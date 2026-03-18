// server/routes/payments.ts
import express from 'express';
import { initiateContributionPayment } from '../services/lencoService';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// INITIATE PAYMENT (Real Lenco Integration)
// ═══════════════════════════════════════════════════════════
router.post('/initiate', async (req, res) => {
  try {
    const { clusterId, amountUsd, provider, phoneNumber, userId } = req.body;

    console.log('[PAYMENT INITIATE]', { clusterId, amountUsd, provider, phoneNumber, userId });

    // Validation
    if (!clusterId || !amountUsd || !provider || !phoneNumber || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (amountUsd <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    // Call real Lenco service
    const result = await initiateContributionPayment({
      clusterId,
      amountUsd,
      userId,
      provider: provider as 'mtn' | 'airtel',
      phoneNumber,
    });

    res.json({
      success: true,
      reference: result.reference,
      message: result.message,
      status: 'PENDING',
    });

  } catch (error: any) {
    console.error('[PAYMENT INITIATION ERROR]', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Payment initiation failed'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CHECK PAYMENT STATUS (Placeholder for now)
// ═══════════════════════════════════════════════════════════
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    console.log('[PAYMENT STATUS CHECK]', transactionId);

    // TODO: Later connect to Lenco status API
    // For now we return pending (webhook will update real status)
    res.json({
      success: true,
      status: 'PENDING',
      transactionId,
      message: 'Payment is being processed. Check your phone for confirmation.'
    });

  } catch (error: any) {
    console.error('[PAYMENT STATUS ERROR]', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;