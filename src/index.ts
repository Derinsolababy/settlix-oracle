import express from 'express';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';
import { ratesRouter } from './routes/rates.js';
import { settlementRouter } from './routes/settlement.js';
import { verifyRouter } from './routes/verify.js';
import { ExchangeRateService } from './services/exchange-rate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const logger = createLogger('main');

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// Status endpoint
app.get('/api/v1/status', (req, res) => {
  res.json({
    service: 'settlix-oracle',
    version: '1.0.0',
    network: process.env.STELLAR_NETWORK || 'testnet',
    uptime: process.uptime(),
  });
});

// Routes
app.use('/api/v1/rates', ratesRouter);
app.use('/api/v1/settlement', settlementRouter);
app.use('/api/v1/verify', verifyRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err: err.message }, 'Request error');
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Settlix Oracle running on port ${PORT}`);
  
  // Start exchange rate service
  const exchangeRateService = ExchangeRateService.getInstance();
  exchangeRateService.start();
});

export default app;
