# How prices are formed

## Sources

| Source | Pairs | Notes |
| --- | --- | --- |
| CoinGecko `simple/price` | XLM/USD, USDC/USD | Optional demo or pro key raises rate limits |
| Stellar DEX (mainnet Horizon order book) | XLM/USD | Mid of best bid and ask against Circle USDC, taken as USD. Ignored if the book is empty, crossed, or wider than 2% |

The DEX source always reads **mainnet**, even when the service runs on
testnet: testnet order books are not real markets.

## Aggregation

Every `PRICE_POLL_MS` (30 s) each source is fetched. The latest reading from
each source is kept with the time it was taken. To price a pair:

1. Drop readings older than `PRICE_MAX_AGE_MS` (120 s).
2. If none remain: **503**. There is no fallback rate.
3. If the fresh readings differ by more than `PRICE_MAX_SPREAD_BPS` (3%)
   of their median: **503**. One source is wrong, and we cannot tell which.
4. Otherwise the price is the median, and `observedAt` is the oldest
   reading used.

A source that errors is logged and its old reading simply ages out.

## Precision

Source prices are converted to 8-decimal fixed point at the edge, and from
then on everything is integer math on bigints:

```
amount (stroops) = ceil(usd_stroops * 10^8 / price)
fee              = floor(amount * fee_bps / 10_000)      same as the contract
net              = amount - fee
```

## Adding a source

Implement `PriceSource` in `src/prices/sources.ts` (a `name` and an async
`fetch()` returning `{ pair, price }` observations), add it in
`src/index.ts`, and add tests with a fake `fetch`. More sources make the
median harder to move, but the spread check still covers every fresh
reading: one source more than 3% off blocks pricing until it recovers or
goes stale. That is deliberate. Investigate the outlier; do not just widen
the limit.
