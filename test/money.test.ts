import { describe, expect, it } from 'vitest';
import { ceilDiv, formatUnits, fromStroops, median, parseUnits, priceFromNumber, splitFee, toStroops } from '../src/money.js';

describe('money', () => {
  it('parses and formats 7-decimal amounts exactly', () => {
    expect(toStroops('12.5')).toBe(125_000_000n);
    expect(toStroops('0.0000001')).toBe(1n);
    expect(toStroops('25')).toBe(250_000_000n);
    expect(fromStroops(248_750_000n)).toBe('24.8750000');
    expect(formatUnits(-5n, 2)).toBe('-0.05');
    // 0.1 + 0.2 is the classic float trap; fixed point has no such error.
    expect(fromStroops(toStroops('0.1') + toStroops('0.2'))).toBe('0.3000000');
  });

  it('rejects negatives, exponents and too many decimals', () => {
    for (const bad of ['-1', '1e3', '1.00000001', '', 'abc', '1.']) {
      expect(() => parseUnits(bad, 7), bad).toThrow(RangeError);
    }
  });

  it('refuses nonsense prices instead of defaulting', () => {
    for (const bad of [0, -1, NaN, Infinity, undefined, '0.12']) {
      expect(() => priceFromNumber(bad), String(bad)).toThrow(RangeError);
    }
    expect(priceFromNumber(0.123456789)).toBe(12_345_679n);
  });

  it('splits fees the way the payment contract does', () => {
    // Matches contracts/payment test: 10 USDC at 50 bps.
    expect(splitFee(100_000_000n, 50)).toEqual({ fee: 500_000n, net: 99_500_000n });
    // Fee rounds down, so fee + net always equals the amount.
    expect(splitFee(199n, 50)).toEqual({ fee: 0n, net: 199n });
  });

  it('ceilDiv and median', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(median([3n, 1n, 2n])).toBe(2n);
    expect(median([4n, 1n, 3n, 2n])).toBe(2n);
    expect(() => median([])).toThrow();
  });
});
