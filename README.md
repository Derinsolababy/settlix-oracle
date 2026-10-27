# Settlix Oracle

[![CI](https://github.com/SETTLIX/settlix-oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/SETTLIX/settlix-oracle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The off-chain half of Settlix. It answers three questions:

1. **What is XLM or USDC worth right now?** The median of CoinGecko and the
   Stellar DEX. It refuses to answer when the data is stale or the sources
   disagree, rather than falling back to a made-up number.
2. **How much should the customer pay?** A signed, expiring quote turns a USD
   price into an exact asset amount, with the same fee split the payment
   contract will apply.
3. **Did the customer actually pay?** It checks a classic Stellar payment for
   the destination, asset, amount, memo and success, or reads an invoice's
   status straight from the payment contract.

Part of the Settlix stack:
[settlix-contracts](https://github.com/SETTLIX/settlix-contracts) ·
[settlix-oracle](https://github.com/SETTLIX/settlix-oracle) (this repo) ·
[settlix-interface](https://github.com/SETTLIX/settlix-interface)

## Quick start

```bash
cp .env.example .env     # testnet contract IDs are prefilled
npm install
npm run dev              # http://localhost:3001
curl localhost:3001/v1/prices
curl -X POST localhost:3001/v1/quotes -H 'content-type: application/json' \
  -d '{"asset":"XLM","fiatAmount":"5"}'
```

Requires Node 20.11 or newer. There is no database or Redis to run: prices
live in memory and are refreshed every 30 seconds.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/ready` | 200 only when XLM can be priced |
| GET | `/v1/status` | Network, version, quote signer, fee rate |
| GET | `/v1/prices` | Every pair with its sources, or why it cannot be priced |
| GET | `/v1/prices/:asset` | `XLM` or `USDC` in USD |
| GET | `/v1/fees` | Platform fee in basis points, read from the settlement contract |
| POST | `/v1/quotes` | Signed quote: `{ "asset": "XLM", "fiatAmount": "12.50" }` |
| POST | `/v1/quotes/verify` | Check a quote's signature and expiry |
| POST | `/v1/payments/verify` | Verify a classic payment against what was asked |
| GET | `/v1/invoices/:id` | Invoice state from the payment contract |

Request and response examples, error codes, and how to verify a quote
signature yourself are in [docs/api.md](docs/api.md). How prices are formed
is in [docs/pricing.md](docs/pricing.md).

## Design rules

- **Money is never a float.** Amounts are bigints in stroops (7 decimals),
  prices in 8-decimal fixed point. Customer amounts round up and fees round
  down, the same as the contract.
- **No price is better than a wrong price.** No hard-coded fallback rates.
  Stale or conflicting data returns 503.
- **Verification means the payment matches,** not just that a transaction
  exists.
- **Quotes are signed** with an ed25519 Stellar key, so the interface or a
  merchant backend can prove a price came from this service.

## Running in production

```bash
docker build -t settlix-oracle .
docker run -p 3001:3001 --env-file .env -e NODE_ENV=production settlix-oracle
```

In production the service refuses to start without `ORACLE_SECRET`. Put it
behind TLS, set `CORS_ORIGINS` to the interface's origin, and point a load
balancer's health check at `/ready`. All configuration is in
[.env.example](.env.example).

## Development

```bash
npm test            # vitest, no network needed
npm run typecheck
npm run build
```

Tests use fake price sources, a fake Horizon and a fake chain reader, so they
run offline. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
<!-- fix: addresses issue #332 - [Security] Oracle admin cannot be revoked without deploying a new contract -->
