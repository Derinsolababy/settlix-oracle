import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonical } from '../src/quotes.js';
import { USDC_ISSUER, fakeSource, world } from './helpers.js';

describe('QuoteService', () => {
  it('prices a USD amount in XLM with the contract fee split', async () => {
    const { quotes } = await world();
    const q = await quotes.create('XLM', '10');
    expect(q).toMatchObject({
      asset: { code: 'XLM', issuer: null },
      fiatAmount: '10.0000000',
      price: '0.25000000',
      amount: '40.0000000',
      feeBps: 50,
      fee: '0.2000000',
      net: '39.8000000',
    });
    expect(Date.parse(q.expiresAt) - Date.parse(q.issuedAt)).toBe(120_000);
  });

  it('rounds the customer amount up so the merchant is never short', async () => {
    const { quotes } = await world({ sources: [fakeSource('a', { 'XLM/USD': '0.3' })] });
    // 1 / 0.3 = 3.33333333... -> 3.3333334, never 3.3333333
    expect((await quotes.create('XLM', '1')).amount).toBe('3.3333334');
  });

  it('quotes USDC with the configured issuer', async () => {
    const { quotes } = await world();
    const q = await quotes.create('USDC', '12.5');
    expect(q.asset).toEqual({ code: 'USDC', issuer: USDC_ISSUER });
    expect(q.amount).toBe('12.5000000');
  });

  it('signs quotes so they verify, and detects tampering, expiry and foreign signers', async () => {
    const { quotes, clock } = await world();
    const q = await quotes.create('XLM', '10');
    expect(quotes.verify(q)).toEqual({ valid: true });

    // Signature is ed25519 over sha256(canonical(quote)), checkable by any client.
    const { signature, ...body } = q;
    const digest = createHash('sha256').update(canonical(body)).digest();
    expect(Keypair.fromPublicKey(q.signer).verify(digest, Buffer.from(signature, 'base64'))).toBe(true);

    expect(quotes.verify({ ...q, amount: '1.0000000' })).toEqual({ valid: false, reason: 'bad signature' });
    expect(quotes.verify({ ...q, signer: Keypair.random().publicKey() })).toMatchObject({ valid: false });
    clock.advance(120_000);
    expect(quotes.verify(q)).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects zero and malformed amounts', async () => {
    const { quotes } = await world();
    await expect(quotes.create('XLM', '0')).rejects.toMatchObject({ status: 400 });
    await expect(quotes.create('XLM', '1.00000001')).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to quote without a price', async () => {
    const { quotes } = await world({ sources: [] });
    await expect(quotes.create('XLM', '10')).rejects.toMatchObject({ status: 503 });
  });
});
