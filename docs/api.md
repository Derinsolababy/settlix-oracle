# API reference

All amounts are decimal strings with exactly 7 places (Stellar precision).
Prices are decimal strings with 8 places, in USD per unit.

Errors share one shape:

```json
{ "error": "unavailable", "message": "no fresh price for XLM/USD", "details": { "pair": "XLM/USD", "maxAgeMs": 120000 } }
```

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Invalid input; `details` lists the problems |
| 404 | `not_found` | Unknown route, transaction or invoice |
| 429 | | Rate limited (120 requests per minute per IP on `/v1`) |
| 502 | `upstream_error` | Horizon, RPC or a price API failed; safe to retry |
| 503 | `unavailable` | No trustworthy price right now |

## POST /v1/quotes

```json
{ "asset": "XLM", "fiatAmount": "5" }
```

`201`:

```json
{
  "id": "b7a1234d-7347-45de-a45c-9ad20b9b7168",
  "asset": { "code": "XLM", "issuer": null },
  "fiatCurrency": "USD",
  "fiatAmount": "5.0000000",
  "price": "0.17061077",
  "amount": "29.3064735",
  "feeBps": 50,
  "fee": "0.1465323",
  "net": "29.1599412",
  "priceObservedAt": "2026-10-24T08:28:12.407Z",
  "issuedAt": "2026-10-24T08:28:21.408Z",
  "expiresAt": "2026-10-24T08:30:21.408Z",
  "signer": "GCO44BKELYH5A6HX3IYN2VSLTMWV4PUB2ZKAXQQP7HPLGONAU6ZJW3TV",
  "signature": "Z2vZNpdv1QnW...Pu0GHBw=="
}
```

`amount` is what to put on the invoice: `ceil(fiatAmount / price)`, so the
merchant never receives less than the USD asked. `fee` and `net` are exactly
what the payment contract will split it into at the current rate.

### Verifying a quote yourself

The signature is ed25519 over `sha256(canonical)`, where `canonical` is:

```js
JSON.stringify([
  ['id', q.id], ['asset', [q.asset.code, q.asset.issuer]], ['fiatCurrency', q.fiatCurrency],
  ['fiatAmount', q.fiatAmount], ['price', q.price], ['amount', q.amount], ['feeBps', q.feeBps],
  ['fee', q.fee], ['net', q.net], ['priceObservedAt', q.priceObservedAt],
  ['issuedAt', q.issuedAt], ['expiresAt', q.expiresAt], ['signer', q.signer],
])
```

```js
import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
const ok = Keypair.fromPublicKey(q.signer).verify(
  createHash('sha256').update(canonical).digest(),
  Buffer.from(q.signature, 'base64'),
);
```

Pin the expected `signer` (from `/v1/status`) rather than trusting the one
in the quote. Or send the quote to `POST /v1/quotes/verify`, which returns
`{ "valid": true }` or `{ "valid": false, "reason": "expired" }`.

## POST /v1/payments/verify

For payments made with a plain Stellar payment (for example a SEP-7 link)
rather than through the payment contract.

```json
{
  "txHash": "07d6893b9aaf39ecdafbc6b8d62e78c32038d8ec3a1099512cf89c92596ec03c",
  "destination": "GCJFBATLJXSMKHFKHAW6WD52YKLL5ZPCEQE63XS2TOQXRDOUZ26WXKMX",
  "asset": "XLM",
  "amount": "29.3064735",
  "memo": "QUOTE-b7a1234d"
}
```

```json
{
  "verified": true,
  "txHash": "07d6893b...",
  "checks": { "successful": true, "memo": true, "payment": true, "amount": true },
  "received": "29.3064735",
  "ledger": 5361387,
  "createdAt": "2026-10-24T08:28:42Z"
}
```

`verified` is true only when every check passes:

- `successful`: the transaction did not fail.
- `memo`: matches, when `memo` was given.
- `payment`: at least one `payment` or path payment credits `destination`
  with `asset` (USDC must come from the configured issuer).
- `amount`: those operations add up to at least `amount`.

A transaction Horizon has never seen is a 404.

## GET /v1/invoices/:id

Reads the invoice from the payment contract by simulation, so it is always
current and needs no indexer.

```json
{
  "id": 1, "merchant": "GCDY...", "token": "CDLZ...", "amount": "25.0000000",
  "reference": "ORDER-1001", "status": "Paid", "paid": true,
  "customer": "GAQN...", "payee": "GCJF...", "fee": "0.1250000", "refunded": "0.0000000",
  "createdAt": "2026-10-24T08:19:57.000Z", "expiresAt": "2026-10-24T09:19:49.000Z",
  "paidAt": "2026-10-24T08:20:07.000Z"
}
```

`status` is one of `Open`, `Paid`, `Cancelled`, `PartiallyRefunded`,
`Refunded`. `paid` is true for the last three paid states.
