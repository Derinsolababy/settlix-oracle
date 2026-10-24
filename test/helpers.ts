import { Keypair } from '@stellar/stellar-sdk';
import { createApp } from '../src/app.js';
import type { ChainReader } from '../src/chain.js';
import { PRICE_DECIMALS, parseUnits } from '../src/money.js';
import { PriceOracle } from '../src/prices/oracle.js';
import type { Fetch, Pair, PriceSource } from '../src/prices/sources.js';
import { QuoteService } from '../src/quotes.js';

export const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const price = (s: string) => parseUnits(s, PRICE_DECIMALS);

/** A source that returns whatever prices the test sets, or throws. */
export function fakeSource(name: string, prices: Partial<Record<Pair, string>>) {
  const source = {
    name,
    prices,
    fail: false,
    async fetch() {
      if (source.fail) throw new Error(`${name} down`);
      return Object.entries(source.prices).map(([pair, p]) => ({ pair: pair as Pair, price: price(p!) }));
    },
  };
  return source satisfies PriceSource;
}

export function clock(start = Date.parse('2026-10-24T12:00:00Z')) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => (c.t += ms) };
  return c;
}

/** Routes fetch() calls by URL substring to canned JSON (or a status). */
export function fakeFetch(routes: Record<string, unknown | { status: number }>): Fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((k) => url.includes(k));
    const body = hit === undefined ? { status: 404 } : routes[hit];
    const status = typeof body === 'object' && body && 'status' in body && Object.keys(body).length === 1 ? (body as { status: number }).status : 200;
    return new Response(JSON.stringify(status === 200 ? body : {}), { status });
  }) as Fetch;
}

export async function world(opts: { sources?: PriceSource[]; chain?: ChainReader | null; fetchImpl?: Fetch; feeBps?: number } = {}) {
  const c = clock();
  const sources = opts.sources ?? [fakeSource('a', { 'XLM/USD': '0.25', 'USDC/USD': '1' })];
  const oracle = new PriceOracle(sources, { maxAgeMs: 120_000, maxSpreadBps: 300, now: c.now });
  await oracle.refresh();
  const keypair = Keypair.random();
  const feeBps = async () => opts.feeBps ?? 50;
  const quotes = new QuoteService({ oracle, feeBps, keypair, usdcIssuer: USDC_ISSUER, ttlSeconds: 120, now: c.now });
  const app = createApp({
    oracle,
    quotes,
    chain: opts.chain ?? null,
    feeBps,
    horizonUrl: 'https://horizon.test',
    network: 'testnet',
    usdcIssuer: USDC_ISSUER,
    corsOrigins: ['http://localhost:3000'],
    fetchImpl: opts.fetchImpl,
    rateLimitPerMinute: 1_000,
  });
  return { app, oracle, quotes, keypair, clock: c };
}
