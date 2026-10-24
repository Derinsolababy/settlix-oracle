/**
 * Fixed-point money. Stellar amounts have 7 decimals ("stroops"), and every
 * amount here is a bigint in those units so nothing is lost to floating
 * point. Prices use 8 decimals.
 */

export const AMOUNT_DECIMALS = 7;
export const PRICE_DECIMALS = 8;
export const STROOP = 10n ** BigInt(AMOUNT_DECIMALS);
export const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** "12.5" -> 125000000n at 7 decimals. Rejects negatives, exponents and excess precision. */
export function parseUnits(value: string, decimals: number): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new RangeError(`not a non-negative decimal: ${value}`);
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new RangeError(`more than ${decimals} decimal places: ${value}`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** 125000000n -> "12.5000000" at 7 decimals. */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const frac = (abs % scale).toString().padStart(decimals, '0');
  return `${neg ? '-' : ''}${abs / scale}${decimals ? `.${frac}` : ''}`;
}

/** Converts an API float price to fixed point, refusing NaN, zero and negatives. */
export function priceFromNumber(n: unknown): bigint {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw new RangeError(`invalid price: ${String(n)}`);
  }
  return parseUnits(n.toFixed(PRICE_DECIMALS), PRICE_DECIMALS);
}

export const toStroops = (s: string) => parseUnits(s, AMOUNT_DECIMALS);
export const fromStroops = (v: bigint) => formatUnits(v, AMOUNT_DECIMALS);
export const formatPrice = (v: bigint) => formatUnits(v, PRICE_DECIMALS);

export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** Same rounding as the payment contract: fee rounds down, net is the rest. */
export function splitFee(amount: bigint, bps: number): { fee: bigint; net: bigint } {
  const fee = (amount * BigInt(bps)) / 10_000n;
  return { fee, net: amount - fee };
}

export function median(values: bigint[]): bigint {
  if (values.length === 0) throw new RangeError('median of nothing');
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2n;
}
