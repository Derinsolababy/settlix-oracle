import 'dotenv/config';
import { Keypair } from '@stellar/stellar-sdk';
import { createApp } from './app.js';
import { cachedFeeBps, sorobanReader } from './chain.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { PriceOracle } from './prices/oracle.js';
import { coinGecko, stellarDex } from './prices/sources.js';
import { QuoteService } from './quotes.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const keypair = config.ORACLE_SECRET ? Keypair.fromSecret(config.ORACLE_SECRET) : Keypair.random();
if (!config.ORACLE_SECRET) {
  logger.warn({ signer: keypair.publicKey() }, 'ORACLE_SECRET not set: signing quotes with a throwaway key');
}

const oracle = new PriceOracle(
  [coinGecko({ apiKey: config.COINGECKO_API_KEY, pro: config.COINGECKO_PRO }), stellarDex()],
  { maxAgeMs: config.PRICE_MAX_AGE_MS, maxSpreadBps: config.PRICE_MAX_SPREAD_BPS, logger },
);

const chain =
  config.PAYMENT_CONTRACT_ID || config.SETTLEMENT_CONTRACT_ID
    ? sorobanReader({
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        paymentContractId: config.PAYMENT_CONTRACT_ID,
        settlementContractId: config.SETTLEMENT_CONTRACT_ID,
      })
    : null;
const feeBps = cachedFeeBps(config.SETTLEMENT_CONTRACT_ID ? chain : null, config.FEE_BPS);

const app = createApp({
  oracle,
  quotes: new QuoteService({
    oracle,
    feeBps,
    keypair,
    usdcIssuer: config.usdcIssuer,
    ttlSeconds: config.QUOTE_TTL_SECONDS,
  }),
  chain,
  feeBps,
  horizonUrl: config.horizonUrl,
  network: config.STELLAR_NETWORK,
  usdcIssuer: config.usdcIssuer,
  corsOrigins: config.corsOrigins,
  logger,
});

await oracle.start(config.PRICE_POLL_MS);
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, network: config.STELLAR_NETWORK, prices: oracle.snapshot().map((p) => [p.pair, p.ok]) }, 'settlix-oracle listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'shutting down');
    oracle.stop();
    server.close(() => process.exit(0));
  });
}
