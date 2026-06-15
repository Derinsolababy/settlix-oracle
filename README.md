# Settlix Oracle

Oracle service providing real-time exchange rates and pricing data for the Settlix merchant payment platform.

## Features

- **Exchange Rate Feeds**: Real-time USDC, XLM, and fiat currency rates
- **Cross-border Pricing**: Calculate settlement amounts with fees
- **Payment Verification**: Validate on-chain payment transactions
- **Price Aggregation**: Aggregate data from multiple sources
- **Caching Layer**: Redis-based caching for performance

## Oracle Data Sources

1. **Stellar DEX**: On-chain liquidity and price data
2. **External APIs**: CoinGecko, CoinMarketCap for fiat rates
3. **Central Banks**: Official exchange rates for compliance
4. **Market Data**: Volume-weighted average prices

## Endpoints

### Exchange Rates
```
GET /api/v1/rates
GET /api/v1/rates/:pair
POST /api/v1/rates/calculate
```

### Settlement Pricing
```
POST /api/v1/settlement/quote
GET /api/v1/settlement/fees
```

### Payment Verification
```
POST /api/v1/verify/payment
GET /api/v1/verify/transaction/:txHash
```

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Language**: TypeScript
- **Cache**: Redis
- **Blockchain**: Stellar SDK
- **Logger**: Pino

## Getting Started

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Environment Variables

```bash
NODE_ENV=development
PORT=3001

# Stellar
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Redis
REDIS_URL=redis://localhost:6379

# API Keys
COINGECKO_API_KEY=
COINMARKETCAP_API_KEY=

# Oracle Configuration
UPDATE_INTERVAL_MS=30000
CACHE_TTL_SECONDS=60
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── services/
│   ├── exchange-rate.ts  # Exchange rate service
│   ├── settlement.ts     # Settlement pricing
│   ├── verification.ts   # Payment verification
│   └── cache.ts         # Redis cache layer
├── providers/
│   ├── stellar.ts       # Stellar DEX data
│   ├── coingecko.ts     # CoinGecko API
│   └── aggregator.ts    # Price aggregation
├── routes/
│   ├── rates.ts         # Rate endpoints
│   ├── settlement.ts    # Settlement endpoints
│   └── verify.ts        # Verification endpoints
└── utils/
    ├── logger.ts        # Logging utility
    └── validation.ts    # Input validation
```

## Oracle Update Flow

1. Fetch data from multiple sources every 30 seconds
2. Aggregate and validate price data
3. Calculate volume-weighted averages
4. Update Redis cache
5. Serve cached data via API
6. Log anomalies and outliers

## Settlement Calculation

```typescript
const quote = {
  amount: 100.00,           // Amount in source currency
  sourceCurrency: "USDC",
  targetCurrency: "USD",
  exchangeRate: 0.9998,
  platformFee: 0.50,        // 0.5% platform fee
  settlementAmount: 99.48,
  estimatedTime: "instant"
};
```

## Deployment

```bash
# Docker
docker build -t settlix-oracle .
docker run -p 3001:3001 settlix-oracle

# Kubernetes
kubectl apply -f k8s/deployment.yaml
```

## Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics`
- Status: `GET /api/v1/status`
