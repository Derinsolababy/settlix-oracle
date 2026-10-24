import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ChainReader, Invoice } from '../src/chain.js';
import { notFound } from '../src/errors.js';
import { USDC_ISSUER, fakeFetch, world } from './helpers.js';

const HASH = 'a'.repeat(64);
const MERCHANT = 'GCJFBATLJXSMKHFKHAW6WD52YKLL5ZPCEQE63XS2TOQXRDOUZ26WXKMX';
const OTHER = 'GAQN3AIY2HIO3M5PTRQBX6YAQQLSFYYS7MMUKHOMUHI2UXAS7QNF5ZOK';

function horizon(tx: object, records: object[]) {
  return fakeFetch({
    [`/transactions/${HASH}/operations`]: { _embedded: { records } },
    [`/transactions/${HASH}`]: { hash: HASH, ledger: 42, created_at: '2026-10-24T12:00:00Z', successful: true, memo_type: 'text', memo: 'ORDER-1001', ...tx },
  });
}
const xlmTo = (to: string, amount: string) => ({ type: 'payment', to, amount, asset_type: 'native' });
const verify = (app: Parameters<typeof request>[0], body: object = {}) =>
  request(app).post('/v1/payments/verify').send({ txHash: HASH, destination: MERCHANT, asset: 'XLM', amount: '25', memo: 'ORDER-1001', ...body });

describe('health and prices', () => {
  it('is live and ready when XLM is priced', async () => {
    const { app } = await world();
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/ready')).status).toBe(200);
  });

  it('is not ready, and says why, with no prices', async () => {
    const { app } = await world({ sources: [] });
    expect((await request(app).get('/ready')).status).toBe(503);
    const res = await request(app).get('/v1/prices/xlm');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'unavailable', message: 'no fresh price for XLM/USD' });
  });

  it('lists prices with their sources', async () => {
    const { app } = await world();
    const res = await request(app).get('/v1/prices');
    expect(res.body.prices[0]).toMatchObject({ ok: true, pair: 'XLM/USD', price: '0.25000000', sources: [{ name: 'a' }] });
  });

  it('reports status and fees', async () => {
    const { app, keypair } = await world({ feeBps: 75 });
    expect((await request(app).get('/v1/status')).body).toMatchObject({ network: 'testnet', quoteSigner: keypair.publicKey(), feeBps: 75 });
    expect((await request(app).get('/v1/fees')).body).toEqual({ feeBps: 75, source: 'config' });
  });
});

describe('quotes', () => {
  it('creates a signed quote and verifies it', async () => {
    const { app } = await world();
    const created = await request(app).post('/v1/quotes').send({ asset: 'XLM', fiatAmount: '10' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amount: '40.0000000', fee: '0.2000000', net: '39.8000000' });
    expect((await request(app).post('/v1/quotes/verify').send(created.body)).body).toEqual({ valid: true });
    const tampered = { ...created.body, net: '40.0000000' };
    expect((await request(app).post('/v1/quotes/verify').send(tampered)).body).toEqual({ valid: false, reason: 'bad signature' });
  });

  it('validates input', async () => {
    const { app } = await world();
    for (const body of [{}, { asset: 'BTC', fiatAmount: '1' }, { asset: 'XLM', fiatAmount: -1 }, { asset: 'XLM', fiatAmount: '1e3' }]) {
      expect((await request(app).post('/v1/quotes').send(body)).status, JSON.stringify(body)).toBe(400);
    }
    const res = await request(app).post('/v1/quotes').set('content-type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
  });
});

describe('payment verification', () => {
  it('verifies a payment that matches destination, asset, amount and memo', async () => {
    const { app } = await world({ fetchImpl: horizon({}, [xlmTo(MERCHANT, '25.0000000')]) });
    const res = await verify(app);
    expect(res.body).toMatchObject({ verified: true, received: '25.0000000', ledger: 42 });
  });

  it('does not verify a transaction that merely exists', async () => {
    // The old oracle answered verified:true for any hash Horizon knew about.
    const { app } = await world({ fetchImpl: horizon({}, [xlmTo(OTHER, '25')]) });
    const res = await verify(app);
    expect(res.body).toMatchObject({ verified: false, checks: { payment: false, amount: false } });
  });

  it('fails each check independently', async () => {
    const cases: [object, object[], object, string][] = [
      [{}, [xlmTo(MERCHANT, '24.9999999')], {}, 'amount'],
      [{ successful: false }, [xlmTo(MERCHANT, '25')], {}, 'successful'],
      [{ memo: 'ORDER-9999' }, [xlmTo(MERCHANT, '25')], {}, 'memo'],
      [{ memo_type: 'none', memo: undefined }, [xlmTo(MERCHANT, '25')], {}, 'memo'],
      [{}, [{ type: 'payment', to: MERCHANT, amount: '25', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: OTHER }], { asset: 'USDC' }, 'payment'],
    ];
    for (const [tx, ops, body, failed] of cases) {
      const { app } = await world({ fetchImpl: horizon(tx, ops) });
      const res = await verify(app, body);
      expect(res.body.verified, failed).toBe(false);
      expect(res.body.checks[failed], failed).toBe(false);
    }
  });

  it('sums split payments and accepts path payments of the right USDC', async () => {
    const usdc = (amount: string, type = 'payment') => ({ type, to: MERCHANT, amount, asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER });
    const { app } = await world({ fetchImpl: horizon({}, [usdc('10'), usdc('2.5', 'path_payment_strict_receive')]) });
    expect((await verify(app, { asset: 'USDC', amount: '12.5' })).body).toMatchObject({ verified: true, received: '12.5000000' });
  });

  it('404s for unknown transactions and 400s for malformed hashes', async () => {
    const { app } = await world({ fetchImpl: fakeFetch({}) });
    expect((await verify(app)).status).toBe(404);
    expect((await verify(app, { txHash: 'nope' })).status).toBe(400);
    expect((await verify(app, { destination: 'not-an-account' })).status).toBe(400);
  });

  it('maps Horizon outages to 502 instead of a verdict', async () => {
    const { app } = await world({ fetchImpl: fakeFetch({ '/transactions/': { status: 500 } }) });
    expect((await verify(app)).status).toBe(502);
  });
});

describe('invoices', () => {
  const invoice: Invoice = {
    id: 1, merchant: MERCHANT, token: 'C...', amount: '25.0000000', reference: 'ORDER-1001', status: 'Paid',
    expiresAt: '', createdAt: '', customer: OTHER, payee: MERCHANT, fee: '0.1250000', refunded: '0.0000000', paidAt: '',
  };
  const chain: ChainReader = {
    feeBps: async () => 50,
    invoice: async (id) => {
      if (id !== 1) throw notFound(`invoice ${id} not found`);
      return invoice;
    },
  };

  it('reads invoice state from the payment contract', async () => {
    const { app } = await world({ chain });
    expect((await request(app).get('/v1/invoices/1')).body).toMatchObject({ status: 'Paid', paid: true });
    expect((await request(app).get('/v1/invoices/2')).status).toBe(404);
    expect((await request(app).get('/v1/invoices/abc')).status).toBe(400);
  });

  it('404s when no contract is configured', async () => {
    const { app } = await world();
    expect((await request(app).get('/v1/invoices/1')).status).toBe(404);
  });
});
