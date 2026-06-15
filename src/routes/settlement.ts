import express from 'express';
import { ExchangeRateService } from '../services/exchange-rate.js';

export const settlementRouter = express.Router();
const exchangeRateService = ExchangeRateService.getInstance();

// Get settlement quote
settlementRouter.post('/quote', async (req, res) => {
  try {
    const { amount, sourceCurrency, targetCurrency } = req.body;

    if (!amount || !sourceCurrency || !targetCurrency) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, sourceCurrency, targetCurrency' 
      });
    }

    const sourceRate = await exchangeRateService.getRate(`${sourceCurrency}/USD`);
    const targetRate = await exchangeRateService.getRate(`${targetCurrency}/USD`);

    if (!sourceRate || !targetRate) {
      return res.status(404).json({ error: 'Exchange rate not found' });
    }

    const exchangeRate = sourceRate.rate / targetRate.rate;
    const platformFeeBps = 50; // 0.5% platform fee
    const platformFee = (amount * platformFeeBps) / 10000;
    const grossAmount = amount * exchangeRate;
    const settlementAmount = grossAmount - (platformFee * exchangeRate);

    res.json({
      quote: {
        amount,
        sourceCurrency,
        targetCurrency,
        exchangeRate,
        grossAmount,
        platformFee: platformFee * exchangeRate,
        platformFeeBps,
        settlementAmount,
        estimatedTime: 'instant',
        expiresAt: Date.now() + 60000, // 1 minute expiry
        timestamp: Date.now(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get fee structure
settlementRouter.get('/fees', (req, res) => {
  res.json({
    fees: {
      platformFeeBps: 50, // 0.5%
      networkFee: 0.0001, // XLM network fee
      minimumFee: 0.01,
    },
  });
});
