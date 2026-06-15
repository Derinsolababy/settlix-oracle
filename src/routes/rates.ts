import express from 'express';
import { ExchangeRateService } from '../services/exchange-rate.js';

export const ratesRouter = express.Router();
const exchangeRateService = ExchangeRateService.getInstance();

// Get all exchange rates
ratesRouter.get('/', async (req, res) => {
  try {
    const rates = await exchangeRateService.getAllRates();
    res.json({ rates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific rate pair
ratesRouter.get('/:pair', async (req, res) => {
  try {
    const { pair } = req.params;
    const rate = await exchangeRateService.getRate(pair.toUpperCase());
    
    if (!rate) {
      return res.status(404).json({ error: 'Rate pair not found' });
    }
    
    res.json({ rate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate conversion
ratesRouter.post('/calculate', async (req, res) => {
  try {
    const { amount, from, to } = req.body;

    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'Missing required fields: amount, from, to' });
    }

    const fromRate = await exchangeRateService.getRate(`${from}/USD`);
    const toRate = await exchangeRateService.getRate(`${to}/USD`);

    if (!fromRate || !toRate) {
      return res.status(404).json({ error: 'Exchange rate not found' });
    }

    // Convert through USD as intermediate
    const usdAmount = amount * fromRate.rate;
    const converted = usdAmount / toRate.rate;

    res.json({
      amount,
      from,
      to,
      converted,
      rate: fromRate.rate / toRate.rate,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
