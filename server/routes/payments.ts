import express from 'express';
import axios from 'axios';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// INITIATE PAYMENT
// ═══════════════════════════════════════════════════════════
router.post('/payments/initiate', async (req, res) => {
  try {
    const { provider, phoneNumber, amountUSD, clusterId, userId } = req.body;

    console.log('[PAYMENT INITIATE]', { provider, phoneNumber, amountUSD, clusterId, userId });

    // Validate
    if (!provider || !phoneNumber || !amountUSD) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get exchange rate
    const exchangeRate = 27.5; // TODO: Fetch from API
    const amountZMW = amountUSD * exchangeRate;

    // For now, return success (real implementation when MTN credentials are configured)
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      transactionId,
      status: 'PENDING',
      provider,
      amountUSD,
      amountZMW: amountZMW.toFixed(2),
      message: `Payment initiated. Please approve on your ${provider.toUpperCase()} phone.`
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

    console.log('[PAYMENT STATUS]', transactionId);

    // For now, simulate pending status
    // Real implementation will query MTN/Airtel APIs
    res.json({
      success: true,
      status: 'PENDING',
      transactionId,
      message: 'Payment is pending confirmation'
    });

  } catch (error: any) {
    console.error('[PAYMENT STATUS ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to get payment status',
      message: error.message 
    });
  }
});

export default router;