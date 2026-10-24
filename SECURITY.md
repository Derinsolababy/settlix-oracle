# Security Policy

This service decides prices and whether a payment counts as paid. Please
report vulnerabilities privately.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/SETTLIX/settlix-oracle/security/advisories/new).
Do **not** open a public issue or pull request.

Please include the endpoint, the impact, and a reproduction (a failing
vitest case is ideal). We aim to acknowledge reports within 3 business days.

## Properties we rely on

Report any way to break these:

1. `/v1/payments/verify` returns `verified: true` only for a successful
   transaction that credits the given destination with at least the given
   amount of the given asset (and memo, when given).
2. The service never returns a price that did not come from a fresh source
   reading, and refuses when sources disagree beyond the configured spread.
3. A quote that verifies was issued by this service's key, unmodified, and
   has not expired.
4. Customer amounts round up and fees round down, matching the payment
   contract to the stroop.
5. The quote signing key (`ORACLE_SECRET`) never appears in logs or
   responses.

## Operating securely

- Set `ORACLE_SECRET` from a secrets manager, not a committed file. Rotate
  it by deploying a new key and updating clients that pin the signer.
- Restrict `CORS_ORIGINS` to the interface's origin.
- Run behind TLS. The service trusts one proxy hop for client IPs (rate
  limiting).
