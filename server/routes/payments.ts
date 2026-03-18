// server/routes/payments.ts
import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const LENCO_SECRET = process.env.LENCO_SECRET_KEY;
const LENCO_VERIFY_BASE = 'https://api.lenco.co/access/v2/collections/status/';

// ═══════════════════════════════════════════════════════════
// VERIFY PAYMENT (called from widget onSuccess callback)
// ═══════════════════════════════════════════════════════════
router.post('/verify', async (req, res) => {
  const { reference } = req.body;

  console.log('[PAYMENT VERIFY] Received reference:', reference);

  if (!reference) {
    return res.status(400).json({ error: 'Missing reference' });
  }

  if (!LENCO_SECRET) {
    return res.status(500).json({ error: 'Server configuration error - missing LENCO_SECRET_KEY' });
  }

  try {
    const verifyUrl = `${LENCO_VERIFY_BASE}${reference}`;
    console.log('[LENCO VERIFY] Calling:', verifyUrl);

    const response = await axios.get(verifyUrl, {
      headers: {
        Authorization: `Bearer ${LENCO_SECRET}`,
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    const data = response.data.data || {};

    console.log('[LENCO VERIFY RESPONSE]', {
      status: data.status,
      amount: data.amount,
      reference: data.reference,
    });

    if (data.status === 'successful') {
      // Update contribution in Supabase
      const { error: updateError } = await supabase
        .from('contributions')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          transaction_reference: reference,
          payment_response: data, // store full response for audit
        })
        .eq('transaction_reference', reference) // or eq('reference', reference) if you store it
        .single();

      if (updateError) {
        console.error('[SUPABASE UPDATE ERROR]', updateError);
        // Still return success to frontend — webhook will catch it later
      }

      return res.json({
        success: true,
        status: 'COMPLETED',
        message: 'Payment verified and contribution completed',
      });
    }

    // Pending, failed, etc.
    res.json({
      success: true,
      status: data.status || 'PENDING',
      message: data.reasonForFailure || 'Payment status updated',
    });
  } catch (error: any) {
    console.error('[LENCO VERIFY ERROR]', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || 'Verification failed',
    });
  }
});

export default router;