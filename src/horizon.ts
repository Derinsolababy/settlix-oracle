import type { AssetRef } from './assets.js';
import { badRequest, notFound } from './errors.js';
import { fromStroops, toStroops } from './money.js';
import type { Fetch } from './prices/sources.js';

export interface PaymentExpectation {
  txHash: string;
  destination: string;
  asset: AssetRef;
  /** Minimum amount, 7 decimals. */
  amount: string;
  memo?: string;
}

export interface PaymentVerification {
  verified: boolean;
  txHash: string;
  checks: { successful: boolean; memo: boolean; payment: boolean; amount: boolean };
  received: string;
  ledger: number;
  createdAt: string;
}

const PAYMENT_OPS = new Set(['payment', 'path_payment_strict_receive', 'path_payment_strict_send']);

function sameAsset(op: any, asset: AssetRef) {
  if (asset.issuer === null) return op.asset_type === 'native';
  return op.asset_code === asset.code && op.asset_issuer === asset.issuer;
}

/**
 * Confirms a classic Stellar payment really paid what was asked: the
 * transaction succeeded, carries the expected memo, and its payment
 * operations credit `destination` with at least `amount` of `asset`.
 */
export async function verifyPayment(
  horizonUrl: string,
  expect: PaymentExpectation,
  fetchImpl: Fetch = fetch,
): Promise<PaymentVerification> {
  if (!/^[0-9a-f]{64}$/i.test(expect.txHash)) throw badRequest('txHash must be 64 hex characters');
  const want = toStroops(expect.amount);

  const get = async (path: string) => {
    const res = await fetchImpl(`${horizonUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) throw notFound('transaction not found');
    if (!res.ok) throw new Error(`horizon responded ${res.status}`);
    return res.json() as Promise<any>;
  };
  const tx = await get(`/transactions/${expect.txHash}`);
  const ops = await get(`/transactions/${expect.txHash}/operations?limit=200`);

  let received = 0n;
  for (const op of ops?._embedded?.records ?? []) {
    if (PAYMENT_OPS.has(op.type) && op.to === expect.destination && sameAsset(op, expect.asset)) {
      received += toStroops(op.amount);
    }
  }
  const memoOk = expect.memo === undefined || (tx.memo_type !== 'none' && String(tx.memo) === expect.memo);
  const checks = {
    successful: tx.successful === true,
    memo: memoOk,
    payment: received > 0n,
    amount: received >= want,
  };
  return {
    verified: Object.values(checks).every(Boolean),
    txHash: tx.hash,
    checks,
    received: fromStroops(received),
    ledger: tx.ledger,
    createdAt: tx.created_at,
  };
}
