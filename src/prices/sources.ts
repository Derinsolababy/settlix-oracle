import { PRICE_DECIMALS, parseUnits, priceFromNumber } from '../money.js';

export type Pair = 'XLM/USD' | 'USDC/USD';
export const PAIRS: readonly Pair[] = ['XLM/USD', 'USDC/USD'];

export interface Observation {
  pair: Pair;
  /** Fixed point, PRICE_DECIMALS places. */
  price: bigint;
}

export interface PriceSource {
  readonly name: string;
  fetch(): Promise<Observation[]>;
}

export type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string, headers: Record<string, string> = {}) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json() as Promise<any>;
}

/** CoinGecko spot prices for XLM and USDC. */
export function coinGecko(opts: { apiKey?: string; pro?: boolean; fetchImpl?: Fetch } = {}): PriceSource {
  const base = opts.pro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers[opts.pro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = opts.apiKey;
  return {
    name: 'coingecko',
    async fetch() {
      const data = await getJson(opts.fetchImpl ?? fetch, `${base}/simple/price?ids=stellar,usd-coin&vs_currencies=usd`, headers);
      const out: Observation[] = [];
      // A missing or malformed field drops that pair; it never becomes a default.
      for (const [id, pair] of [['stellar', 'XLM/USD'], ['usd-coin', 'USDC/USD']] as const) {
        try {
          out.push({ pair, price: priceFromNumber(data?.[id]?.usd) });
        } catch {
          /* skipped */
        }
      }
      return out;
    },
  };
}

/**
 * Mid price of XLM against Circle's USDC on the Stellar mainnet DEX, taken as
 * XLM/USD (USDC is redeemable 1:1). Always reads mainnet: testnet order books
 * are not real markets. A book wider than `maxSpreadBps` is ignored.
 */
export function stellarDex(opts: { horizonUrl?: string; maxSpreadBps?: number; fetchImpl?: Fetch } = {}): PriceSource {
  const horizon = opts.horizonUrl ?? 'https://horizon.stellar.org';
  const maxSpread = BigInt(opts.maxSpreadBps ?? 200);
  const url =
    `${horizon}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4` +
    `&buying_asset_code=USDC&buying_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&limit=1`;
  return {
    name: 'stellar-dex',
    async fetch() {
      const book = await getJson(opts.fetchImpl ?? fetch, url);
      const bid = book?.bids?.[0]?.price;
      const ask = book?.asks?.[0]?.price;
      if (typeof bid !== 'string' || typeof ask !== 'string') return [];
      const b = parseUnits(Number(bid).toFixed(PRICE_DECIMALS), PRICE_DECIMALS);
      const a = parseUnits(Number(ask).toFixed(PRICE_DECIMALS), PRICE_DECIMALS);
      if (b <= 0n || a < b) return [];
      const mid = (a + b) / 2n;
      if (((a - b) * 10_000n) / mid > maxSpread) return [];
      return [{ pair: 'XLM/USD', price: mid }];
    },
  };
}
