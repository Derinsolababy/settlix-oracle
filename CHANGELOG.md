# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning:
[SemVer](https://semver.org/).

## [0.2.0] - Unreleased

### Fixed

- `POST /verify/payment` returned `verified: true` for any transaction
  that existed, whoever it paid and however much. It now checks
  success, destination, asset (including USDC issuer), amount and memo.
- Hard-coded fallback rates (XLM at $0.12, EUR, GBP) were served whenever
  CoinGecko had no key or failed, with nothing telling clients. Without a
  fresh price the service now returns 503.
- Missing CoinGecko fields defaulted to $1.00 and $0.12.
- Every cache miss went to CoinGecko, so traffic could exhaust its rate
  limit.
- Money was floating point; amounts are now exact bigint stroops.
- The quote fee was hard-coded at 50 bps. It is now read from the
  settlement contract.
- The logger required `pino-pretty`, which was not a dependency, so the
  service crashed on start outside production.
- CORS allowed every origin.

### Added

- Price aggregation: median of CoinGecko and the Stellar DEX, with
  staleness and disagreement checks.
- Signed, expiring quotes (ed25519, Stellar key) and `POST /v1/quotes/verify`.
- `GET /v1/invoices/:id`: invoice state from the payment contract.
- `/ready` for load balancers; configuration validated with zod at startup.
- helmet, a CORS allow-list, rate limiting, and a 16 KB body limit.
- 33 offline tests, Dockerfile, CI on Node 20 and 22, and API and pricing
  docs.

### Removed

- Redis: the in-memory cache refreshed every 30 s is enough for one
  instance, and Redis was never required for correctness.
- `/api/v1/rates/calculate` and the EUR and GBP pairs, which only ever
  served hard-coded values.
- Generated `.meta/commits` filler files.

### Changed

- Routes moved from `/api/v1/...` to `/v1/...`.
