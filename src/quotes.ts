import { createHash, randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { type AssetCode, type AssetRef, assetRef, pairFor } from './assets.js';
import { badRequest } from './errors.js';
import { PRICE_SCALE, ceilDiv, formatPrice, fromStroops, splitFee, toStroops } from './money.js';
import type { PriceOracle } from './prices/oracle.js';

export interface Quote {
  id: string;
  asset: AssetRef;
  fiatCurrency: 'USD';
  fiatAmount: string;
  /** USD per unit of the asset. */
  price: string;
  /** What the customer pays, in the asset, 7 decimals. */
  amount: string;
  feeBps: number;
  fee: string;
  /** What the merchant receives after the platform fee. */
  net: string;
  priceObservedAt: string;
  issuedAt: string;
  expiresAt: string;
  signer: string;
}

export interface SignedQuote extends Quote {
  /** base64 ed25519 signature by `signer` over sha256(canonical(quote)). */
  signature: string;
}

const FIELDS: (keyof Quote)[] = [
  'id', 'asset', 'fiatCurrency', 'fiatAmount', 'price', 'amount', 'feeBps', 'fee', 'net',
  'priceObservedAt', 'issuedAt', 'expiresAt', 'signer',
];

/** Deterministic serialization: fixed key order, so any client can recompute it. */
export function canonical(q: Quote): string {
  return JSON.stringify(FIELDS.map((k) => [k, k === 'asset' ? [q.asset.code, q.asset.issuer] : q[k]]));
}

const digest = (q: Quote) => createHash('sha256').update(canonical(q)).digest();

export interface QuoteDeps {
  oracle: PriceOracle;
  feeBps: () => Promise<number>;
  keypair: Keypair;
  usdcIssuer: string;
  ttlSeconds: number;
  now?: () => number;
}

export class QuoteService {
  private readonly now: () => number;

  constructor(private readonly deps: QuoteDeps) {
    this.now = deps.now ?? Date.now;
  }

  get signer() {
    return this.deps.keypair.publicKey();
  }

  /** Prices `fiatAmount` USD in `code`, rounding the customer's amount up to the stroop. */
  async create(code: AssetCode, fiatAmount: string): Promise<SignedQuote> {
    let usd: bigint;
    try {
      usd = toStroops(fiatAmount);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    if (usd <= 0n) throw badRequest('fiatAmount must be greater than zero');

    const price = this.deps.oracle.get(pairFor(code));
    const amount = ceilDiv(usd * PRICE_SCALE, price.price);
    const feeBps = await this.deps.feeBps();
    const { fee, net } = splitFee(amount, feeBps);
    const issued = this.now();

    const quote: Quote = {
      id: randomUUID(),
      asset: assetRef(code, this.deps.usdcIssuer),
      fiatCurrency: 'USD',
      fiatAmount: fromStroops(usd),
      price: formatPrice(price.price),
      amount: fromStroops(amount),
      feeBps,
      fee: fromStroops(fee),
      net: fromStroops(net),
      priceObservedAt: new Date(price.observedAt).toISOString(),
      issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(issued + this.deps.ttlSeconds * 1000).toISOString(),
      signer: this.signer,
    };
    return { ...quote, signature: this.deps.keypair.sign(digest(quote)).toString('base64') };
  }

  /** Checks a quote came from this oracle, unmodified, and has not expired. */
  verify(q: SignedQuote): { valid: boolean; reason?: string } {
    if (q.signer !== this.signer) return { valid: false, reason: 'not signed by this oracle' };
    const { signature, ...quote } = q;
    let ok = false;
    try {
      ok = Keypair.fromPublicKey(q.signer).verify(digest(quote as Quote), Buffer.from(signature, 'base64'));
    } catch {
      ok = false;
    }
    if (!ok) return { valid: false, reason: 'bad signature' };
    if (Date.parse(q.expiresAt) <= this.now()) return { valid: false, reason: 'expired' };
    return { valid: true };
  }
}
