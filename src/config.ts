import { z } from 'zod';

const USDC_ISSUERS = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
} as const;

const DEFAULTS = {
  testnet: {
    horizon: 'https://horizon-testnet.stellar.org',
    rpc: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    horizon: 'https://horizon.stellar.org',
    rpc: 'https://mainnet.sorobanrpc.com',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
} as const;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().url().optional(),
  SOROBAN_RPC_URL: z.string().url().optional(),
  USDC_ISSUER: z.string().optional(),
  PAYMENT_CONTRACT_ID: z.string().optional(),
  SETTLEMENT_CONTRACT_ID: z.string().optional(),
  /** Used when SETTLEMENT_CONTRACT_ID is unset or unreachable at startup. */
  FEE_BPS: z.coerce.number().int().min(0).max(1000).default(50),

  /** Stellar secret seed (S...) used to sign quotes. Required in production. */
  ORACLE_SECRET: z.string().optional(),
  QUOTE_TTL_SECONDS: z.coerce.number().int().min(10).max(900).default(120),

  COINGECKO_API_KEY: z.string().optional(),
  COINGECKO_PRO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  PRICE_POLL_MS: z.coerce.number().int().min(5_000).default(30_000),
  /** A source's price is ignored once older than this. */
  PRICE_MAX_AGE_MS: z.coerce.number().int().min(10_000).default(120_000),
  /** Refuse to price when fresh sources disagree by more than this. */
  PRICE_MAX_SPREAD_BPS: z.coerce.number().int().min(1).default(300),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = schema.parse(env);
  if (c.NODE_ENV === 'production' && !c.ORACLE_SECRET) {
    throw new Error('ORACLE_SECRET is required in production: quotes must be signed by a stable key');
  }
  const net = DEFAULTS[c.STELLAR_NETWORK];
  return {
    ...c,
    horizonUrl: c.STELLAR_HORIZON_URL ?? net.horizon,
    rpcUrl: c.SOROBAN_RPC_URL ?? net.rpc,
    networkPassphrase: net.passphrase,
    usdcIssuer: c.USDC_ISSUER ?? USDC_ISSUERS[c.STELLAR_NETWORK],
    corsOrigins: c.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
