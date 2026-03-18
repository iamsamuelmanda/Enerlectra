// server/routes/payments.ts
import express from 'express';
import { initiateContributionPayment } from '../services/lencoService';

const router = express.Router();

router.post('/initiate', async (req, res) => {
  console.log('[PAYMENT INITIATE] Received body:', req.body);   // ← DEBUG LINE

  const { clusterId, amountUsd, provider, phoneNumber, userId } = req.body;

  if (!clusterId || !amountUsd || !provider || !phoneNumber) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      received: Object.keys(req.body),
      required: ['clusterId', 'amountUsd', 'provider', 'phoneNumber']
    });
  }

  if (amountUsd <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  try {
    const result = await initiateContributionPayment({
      clusterId,
      amountUsd,
      userId: userId || 'anonymous',
      provider: provider as 'mtn' | 'airtel',
      phoneNumber,
    });

    res.json({
      success: true,
      reference: result.reference,
      message: result.message || 'Payment request sent! Check your phone.',
    });
  } catch (error: any) {
    console.error('[PAYMENT ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;