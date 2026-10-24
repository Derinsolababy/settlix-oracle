import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import { ASSET_CODES, type AssetCode, assetRef } from './assets.js';
import type { ChainReader } from './chain.js';
import { HttpError, notFound } from './errors.js';
import { verifyPayment } from './horizon.js';
import type { Logger } from './logger.js';
import { formatPrice } from './money.js';
import type { PriceOracle } from './prices/oracle.js';
import type { Fetch, Pair } from './prices/sources.js';
import type { QuoteService } from './quotes.js';

export interface AppDeps {
  oracle: PriceOracle;
  quotes: QuoteService;
  chain: ChainReader | null;
  feeBps: () => Promise<number>;
  horizonUrl: string;
  network: string;
  usdcIssuer: string;
  corsOrigins: string[];
  logger?: Logger;
  fetchImpl?: Fetch;
  rateLimitPerMinute?: number;
}

const asset = z.enum(ASSET_CODES as [AssetCode, ...AssetCode[]]);
const decimal = z.string().regex(/^\d+(\.\d{1,7})?$/, 'a decimal with at most 7 places');
const stellarAccount = z.string().regex(/^G[A-Z2-7]{55}$/, 'a Stellar account (G...)');

const quoteBody = z.object({ asset, fiatAmount: decimal, fiatCurrency: z.literal('USD').default('USD') });
const verifyBody = z.object({
  txHash: z.string(),
  destination: stellarAccount,
  asset,
  amount: decimal,
  memo: z.string().max(64).optional(),
});
const signedQuote = z.object({
  id: z.string(),
  asset: z.object({ code: asset, issuer: z.string().nullable() }),
  fiatCurrency: z.literal('USD'),
  fiatAmount: z.string(),
  price: z.string(),
  amount: z.string(),
  feeBps: z.number(),
  fee: z.string(),
  net: z.string(),
  priceObservedAt: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  signer: z.string(),
  signature: z.string(),
});

const VERSION = process.env.npm_package_version ?? '0.2.0';

export function createApp(deps: AppDeps) {
  const app = express();
  const started = Date.now();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins, methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Ready only when XLM can be priced: a load balancer should not route quotes here otherwise.
  app.get('/ready', (_req, res) => {
    const prices = deps.oracle.snapshot();
    const ready = prices.some((p) => p.ok && p.pair === 'XLM/USD');
    res.status(ready ? 200 : 503).json({ ready });
  });

  const v1 = express.Router();
  v1.use(rateLimit({ windowMs: 60_000, limit: deps.rateLimitPerMinute ?? 120, standardHeaders: 'draft-7', legacyHeaders: false }));

  v1.get('/status', async (_req, res) => {
    res.json({
      service: 'settlix-oracle',
      version: VERSION,
      network: deps.network,
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      quoteSigner: deps.quotes.signer,
      feeBps: await deps.feeBps(),
      onChain: deps.chain !== null,
    });
  });

  v1.get('/prices', (_req, res) => {
    res.json({ prices: deps.oracle.snapshot().map(serializePrice) });
  });

  v1.get('/prices/:asset', (req, res) => {
    const code = asset.parse(req.params.asset.toUpperCase());
    res.json(serializePrice({ ok: true, ...deps.oracle.get(`${code}/USD` as Pair) }));
  });

  v1.get('/fees', async (_req, res) => {
    res.json({ feeBps: await deps.feeBps(), source: deps.chain ? 'settlement-contract' : 'config' });
  });

  v1.post('/quotes', async (req, res) => {
    const body = quoteBody.parse(req.body);
    res.status(201).json(await deps.quotes.create(body.asset, body.fiatAmount));
  });

  v1.post('/quotes/verify', (req, res) => {
    res.json(deps.quotes.verify(signedQuote.parse(req.body)));
  });

  v1.post('/payments/verify', async (req, res) => {
    const body = verifyBody.parse(req.body);
    const result = await verifyPayment(
      deps.horizonUrl,
      { ...body, asset: assetRef(body.asset, deps.usdcIssuer) },
      deps.fetchImpl,
    );
    res.json(result);
  });

  v1.get('/invoices/:id', async (req, res) => {
    if (!deps.chain) throw notFound('no payment contract configured');
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const invoice = await deps.chain.invoice(id);
    res.json({ ...invoice, paid: ['Paid', 'PartiallyRefunded', 'Refunded'].includes(invoice.status) });
  });

  app.use('/v1', v1);
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'no such route' });
  });

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'bad_request', message: 'invalid input', details: err.issues });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    } else if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'bad_request', message: 'malformed JSON' });
    } else {
      deps.logger?.error({ err }, 'unhandled error');
      res.status(502).json({ error: 'upstream_error', message: 'an upstream service failed; try again' });
    }
  });

  return app;
}

type Snapshot = ReturnType<PriceOracle['snapshot']>[number];

function serializePrice(p: Snapshot) {
  if (!p.ok) return p;
  return {
    ok: true,
    pair: p.pair,
    price: formatPrice(p.price),
    observedAt: new Date(p.observedAt).toISOString(),
    sources: p.sources.map((s) => ({ name: s.name, price: formatPrice(s.price), at: new Date(s.at).toISOString() })),
  };
}
