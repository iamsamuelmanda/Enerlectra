import express from 'express';
import { createMTNAdapter, getMTNConfigFromEnv } from '../../enerlectra-core/src/adapters/mobile-money/mtn-adapter';
import { createAirtelAdapter, getAirtelConfigFromEnv } from '../../enerlectra-core/src/adapters/mobile-money/airtel-adapter';
import { ngwee } from '../../enerlectra-core/src/domain/settlement/settlement-types';

const router = express.Router();

// Initialize adapters
const mtnAdapter = createMTNAdapter(getMTNConfigFromEnv());
const airtelAdapter = createAirtelAdapter(getAirtelConfigFromEnv());

// ═══════════════════════════════════════════════════════════
// INITIATE PAYMENT
// ═══════════════════════════════════════════════════════════
router.post('/payments/initiate', async (req, res) => {
  try {
    const { provider, phoneNumber, amountUSD, externalId } = req.body;

    // Validate
    if (!provider || !phoneNumber || !amountUSD || !externalId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get exchange rate
    const exchangeRate = 27.5; // TODO: Fetch live rate
    const amountZMW = amountUSD * exchangeRate;
    const amountNgwee = ngwee(BigInt(Math.round(amountZMW * 100)));

    let result;

    if (provider === 'mtn') {
      result = await mtnAdapter.requestPayment(
        phoneNumber,
        amountNgwee,
        externalId,
        'Enerlectra Contribution',
        'Energy cluster investment'
      );
    } else if (provider === 'airtel') {
      result = await airtelAdapter.requestPayment(
        phoneNumber,
        amountNgwee,
        externalId
      );
    } else {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    res.json({
      success: true,
      transactionId: result.referenceId || result.transactionId,
      status: result.status,
      provider,
      amountZMW: amountZMW.toFixed(2),
      message: 'Payment initiated. Please approve on your phone.'
    });

  } catch (error: any) {
    console.error('[PAYMENT INITIATION ERROR]', error);
    res.status(500).json({ 
      error: 'Payment initiation failed',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CHECK PAYMENT STATUS
// ═══════════════════════════════════════════════════════════
router.get('/payments/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { provider } = req.query;

    let status;

    if (provider === 'mtn') {
      status = await mtnAdapter.getPaymentStatus(transactionId);
    } else if (provider === 'airtel') {
      status = await airtelAdapter.getPaymentStatus(transactionId);
    } else {
      return res.status(400).json({ error: 'Provider required' });
    }

    res.json({
      success: true,
      status: status.status,
      message: status.message || 'Payment status retrieved'
    });

  } catch (error: any) {
    console.error('[PAYMENT STATUS ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to get payment status',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET BALANCE (for debugging)
// ═══════════════════════════════════════════════════════════
router.get('/payments/balance/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    let balance;

    if (provider === 'mtn') {
      balance = await mtnAdapter.getBalance();
    } else if (provider === 'airtel') {
      balance = await airtelAdapter.getBalance();
    } else {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    res.json({
      success: true,
      provider,
      balance: balance.availableBalance || balance.balance,
      currency: balance.currency
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;