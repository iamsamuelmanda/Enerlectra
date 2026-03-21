// server/routes/payments.ts
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const LENCO_SECRET = process.env.LENCO_SECRET_KEY;
const LENCO_WEBHOOK_SECRET = process.env.LENCO_WEBHOOK_SECRET || 'c0cacc67954b0b5f0db329443f68aa9ba06d5a05632e65a322bd4a61b9227905';

const LENCO_VERIFY_BASE = 'https://api.lenco.co/access/v2/collections/status/';

// ═══════════════════════════════════════════════════════════
// VERIFY ENDPOINT (called by Lenco widget onSuccess)
// ═══════════════════════════════════════════════════════════
router.post('/verify', async (req, res) => {
  const { reference } = req.body;

  console.log('[PAYMENT VERIFY] Received reference:', reference);

  if (!reference) {
    return res.status(400).json({ error: 'Missing reference' });
  }

  if (!LENCO_SECRET) {
    return res.status(500).json({ error: 'LENCO_SECRET_KEY missing' });
  }

  try {
    const verifyUrl = `${LENCO_VERIFY_BASE}${reference}`;
    const response = await axios.get(verifyUrl, {
      headers: { Authorization: `Bearer ${LENCO_SECRET}` },
      timeout: 15000,
    });

    const data = response.data.data || {};

    if (data.status === 'successful') {
      const { error } = await supabase
        .from('contributions')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          transaction_reference: reference,
          payment_response: data,
        })
        .eq('transaction_reference', reference)
        .single();

      if (error) console.error('[SUPABASE UPDATE ERROR]', error);
      else console.log('[SUPABASE] Contribution marked COMPLETED:', reference);

      return res.json({ success: true, status: 'COMPLETED' });
    }

    return res.json({ success: true, status: data.status || 'PENDING' });
  } catch (error: any) {
    console.error('[VERIFY ERROR]', error.response?.data || error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// LENCO WEBHOOK (real production events from Lenco)
// ═══════════════════════════════════════════════════════════
router.post('/webhooks/lenco', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-lenco-signature'];
  const rawBody = req.body.toString();

  console.log('[LENCO WEBHOOK] Received event');

  // Signature verification
  if (signature && LENCO_WEBHOOK_SECRET) {
    const hmac = crypto.createHmac('sha256', LENCO_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');
    if (signature !== digest) {
      console.error('[WEBHOOK] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    const payload = JSON.parse(rawBody);
    const event = payload.event || payload.type;

    if (event === 'collection.successful') {
      const reference = payload.data?.reference || payload.reference;
      console.log('[WEBHOOK] SUCCESSFUL COLLECTION – reference:', reference);

      const { error } = await supabase
        .from('contributions')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          transaction_reference: reference,
          payment_response: payload.data,
        })
        .eq('transaction_reference', reference)
        .single();

      if (error) console.error('[SUPABASE UPDATE ERROR]', error);
      else console.log('[WEBHOOK] Contribution successfully updated in Supabase');
    }

    // Always return 200 to Lenco
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;