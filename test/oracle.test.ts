import { describe, expect, it } from 'vitest';
import { PriceOracle } from '../src/prices/oracle.js';
import { coinGecko, stellarDex } from '../src/prices/sources.js';
import { clock, fakeFetch, fakeSource, price } from './helpers.js';

const make = (...sources: ReturnType<typeof fakeSource>[]) => {
  const c = clock();
  return { c, oracle: new PriceOracle(sources, { maxAgeMs: 60_000, maxSpreadBps: 300, now: c.now }) };
};

describe('PriceOracle', () => {
  it('prices a pair as the median of fresh sources', async () => {
    const { oracle } = make(
      fakeSource('a', { 'XLM/USD': '0.250' }),
      fakeSource('b', { 'XLM/USD': '0.252' }),
      fakeSource('c', { 'XLM/USD': '0.251' }),
    );
    await oracle.refresh();
    const p = oracle.get('XLM/USD');
    expect(p.price).toBe(price('0.251'));
    expect(p.sources.map((s) => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('refuses rather than inventing a price when nothing is available', async () => {
    const a = fakeSource('a', { 'XLM/USD': '0.25' });
    a.fail = true;
    const { oracle } = make(a);
    await oracle.refresh(); // must not throw
    expect(() => oracle.get('XLM/USD')).toThrow(/no fresh price/);
    expect(() => oracle.get('USDC/USD')).toThrow(/no fresh price/);
  });

  it('drops readings once they are older than maxAge', async () => {
    const a = fakeSource('a', { 'XLM/USD': '0.25' });
    const b = fakeSource('b', { 'XLM/USD': '0.251' });
    const { oracle, c } = make(a, b);
    await oracle.refresh();
    b.fail = true;
    c.advance(30_000);
    await oracle.refresh(); // a refreshes, b keeps its 30s-old reading
    expect(oracle.get('XLM/USD').sources).toHaveLength(2);
    c.advance(45_000); // b is now 75s old
    expect(oracle.get('XLM/USD').sources.map((s) => s.name)).toEqual(['a']);
    c.advance(60_000);
    expect(() => oracle.get('XLM/USD')).toThrow(/no fresh price/);
  });

  it('refuses when fresh sources disagree beyond the spread limit', async () => {
    const { oracle } = make(fakeSource('a', { 'XLM/USD': '0.25' }), fakeSource('b', { 'XLM/USD': '0.30' }));
    await oracle.refresh();
    expect(() => oracle.get('XLM/USD')).toThrow(/disagree/);
    expect(oracle.snapshot().find((s) => s.pair === 'XLM/USD')?.ok).toBe(false);
  });
});

describe('sources', () => {
  it('coinGecko maps ids to pairs and skips malformed values', async () => {
    const src = coinGecko({ fetchImpl: fakeFetch({ 'simple/price': { stellar: { usd: 0.2512 }, 'usd-coin': { usd: null } } }) });
    expect(await src.fetch()).toEqual([{ pair: 'XLM/USD', price: price('0.2512') }]);
  });

  it('coinGecko surfaces HTTP errors so the oracle can log them', async () => {
    const src = coinGecko({ fetchImpl: fakeFetch({ 'simple/price': { status: 429 } }) });
    await expect(src.fetch()).rejects.toThrow(/429/);
  });

  it('stellarDex takes the mid of the best bid and ask', async () => {
    const src = stellarDex({ fetchImpl: fakeFetch({ order_book: { bids: [{ price: '0.2500' }], asks: [{ price: '0.2504' }] } }) });
    expect(await src.fetch()).toEqual([{ pair: 'XLM/USD', price: price('0.2502') }]);
  });

  it('stellarDex ignores empty, crossed or wide books', async () => {
    for (const book of [
      { bids: [], asks: [] },
      { bids: [{ price: '0.26' }], asks: [{ price: '0.25' }] },
      { bids: [{ price: '0.20' }], asks: [{ price: '0.30' }] },
    ]) {
      expect(await stellarDex({ fetchImpl: fakeFetch({ order_book: book }) }).fetch()).toEqual([]);
    }
  });
});
