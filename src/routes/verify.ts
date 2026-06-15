import express from 'express';
import { Horizon } from '@stellar/stellar-sdk';

export const verifyRouter = express.Router();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);

// Verify payment transaction
verifyRouter.post('/payment', async (req, res) => {
  try {
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Missing transaction hash' });
    }

    const transaction = await server.transactions().transaction(txHash).call();
    
    res.json({
      verified: true,
      transaction: {
        hash: transaction.hash,
        ledger: transaction.ledger_attr,
        created_at: transaction.created_at,
        source_account: transaction.source_account,
        successful: transaction.successful,
      },
    });
  } catch (error: any) {
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        verified: false, 
        error: 'Transaction not found' 
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get transaction details
verifyRouter.get('/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;

    const transaction = await server.transactions().transaction(txHash).call();
    const operations = await transaction.operations();

    res.json({
      transaction: {
        hash: transaction.hash,
        ledger: transaction.ledger_attr,
        created_at: transaction.created_at,
        source_account: transaction.source_account,
        successful: transaction.successful,
        fee_charged: transaction.fee_charged,
      },
      operations: operations.records.map((op: any) => ({
        type: op.type,
        from: op.from,
        to: op.to,
        amount: op.amount,
        asset_code: op.asset_code,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
