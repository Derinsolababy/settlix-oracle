import { createClient } from 'redis';
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('exchange-rate');

export interface ExchangeRate {
  pair: string;
  rate: number;
  timestamp: number;
  source: string;
}

export class ExchangeRateService {
  private static instance: ExchangeRateService;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS || '30000');
  private readonly CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '60');

  private constructor() {}

  static getInstance(): ExchangeRateService {
    if (!ExchangeRateService.instance) {
      ExchangeRateService.instance = new ExchangeRateService();
    }
    return ExchangeRateService.instance;
  }

  async start() {
    logger.info('Starting Exchange Rate Service');
    
    // Initialize Redis if URL is provided
    if (process.env.REDIS_URL) {
      this.redisClient = createClient({ url: process.env.REDIS_URL });
      await this.redisClient.connect();
      logger.info('Connected to Redis');
    }

    // Start periodic updates
    this.updateInterval = setInterval(() => {
      this.updateRates();
    }, this.UPDATE_INTERVAL_MS);

    // Initial update
    await this.updateRates();
  }

  async stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  private async updateRates() {
    try {
      logger.info('Updating exchange rates');

      // Fetch rates from multiple sources
      const rates = await this.fetchRatesFromSources();

      // Store in cache
      for (const rate of rates) {
        await this.cacheRate(rate);
      }

      logger.info({ count: rates.length }, 'Exchange rates updated');
    } catch (error: any) {
      logger.error({ err: error.message }, 'Failed to update exchange rates');
    }
  }

  private async fetchRatesFromSources(): Promise<ExchangeRate[]> {
    const rates: ExchangeRate[] = [];

    // Fetch from CoinGecko
    if (process.env.COINGECKO_API_KEY) {
      try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
          params: {
            ids: 'usd-coin,stellar',
            vs_currencies: 'usd',
          },
          headers: {
            'X-Cg-Pro-Api-Key': process.env.COINGECKO_API_KEY,
          },
        });

        rates.push({
          pair: 'USDC/USD',
          rate: response.data['usd-coin']?.usd || 1.0,
          timestamp: Date.now(),
          source: 'coingecko',
        });

        rates.push({
          pair: 'XLM/USD',
          rate: response.data.stellar?.usd || 0.12,
          timestamp: Date.now(),
          source: 'coingecko',
        });
      } catch (error: any) {
        logger.error({ err: error.message }, 'CoinGecko API error');
      }
    }

    // Fallback hardcoded rates for development
    if (rates.length === 0) {
      rates.push(
        { pair: 'USDC/USD', rate: 1.0, timestamp: Date.now(), source: 'fallback' },
        { pair: 'XLM/USD', rate: 0.12, timestamp: Date.now(), source: 'fallback' },
        { pair: 'EUR/USD', rate: 1.08, timestamp: Date.now(), source: 'fallback' },
        { pair: 'GBP/USD', rate: 1.27, timestamp: Date.now(), source: 'fallback' }
      );
    }

    return rates;
  }

  private async cacheRate(rate: ExchangeRate) {
    if (this.redisClient) {
      await this.redisClient.set(
        `rate:${rate.pair}`,
        JSON.stringify(rate),
        { EX: this.CACHE_TTL_SECONDS }
      );
    }
  }

  async getRate(pair: string): Promise<ExchangeRate | null> {
    if (this.redisClient) {
      const cached = await this.redisClient.get(`rate:${pair}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // If not in cache, fetch fresh data
    const rates = await this.fetchRatesFromSources();
    const rate = rates.find(r => r.pair === pair);
    
    if (rate && this.redisClient) {
      await this.cacheRate(rate);
    }

    return rate || null;
  }

  async getAllRates(): Promise<ExchangeRate[]> {
    return this.fetchRatesFromSources();
  }
}
