// server/src/routes/payments.ts
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase (Ensure env vars are loaded)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

const LENCO_SECRET = process.env.LENCO_SECRET_KEY;
const LENCO_WEBHOOK_SECRET = process.env.LENCO_WEBHOOK_SECRET;
const LENCO_VERIFY_BASE = 'https://api.lenco.co/access/v2/collections/status/';
const LENCO_PAYOUT_BASE = 'https://api.lenco.co/v1/payouts';

// ═══════════════════════════════════════════════════════════
// VERIFY ENDPOINT (Widget Success Callback)
// ═══════════════════════════════════════════════════════════
router.post('/verify', async (req, res) => {
  const { reference } = req.body;

  console.log('[PAYMENT VERIFY] Checking reference:', reference);

  if (!reference) return res.status(400).json({ error: 'Missing reference' });
  if (!LENCO_SECRET) return res.status(500).json({ error: 'LENCO_SECRET_KEY missing' });

  try {
    const verifyUrl = `${LENCO_VERIFY_BASE}${reference}`;
    const response = await axios.get(verifyUrl, {
      headers: { Authorization: `Bearer ${LENCO_SECRET}` },
      timeout: 15000,
    });

    const data = response.data.data || {};

    // If successful, update Supabase immediately for snappy UI
    if (data.status === 'successful') {
      const { error } = await supabase
        .from('contributions')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          payment_response: data,
        })
        .eq('transaction_reference', reference);

      if (error) console.error('[SUPABASE UPDATE ERROR]', error);
      return res.json({ success: true, status: 'COMPLETED' });
    }

    return res.json({ success: true, status: data.status || 'PENDING' });
  } catch (error: any) {
    console.error('[VERIFY ERROR]', error.response?.data || error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// USER REDEMPTION -> LENCO PAYOUT
// ═══════════════════════════════════════════════════════════
router.post('/redeem', async (req, res) => {
  const { userId, amountPcu, phoneNumber } = req.body ?? {};

  if (!userId || !amountPcu || !phoneNumber) {
    return res.status(400).json({ error: 'userId, amountPcu and phoneNumber are required' });
  }

  if (!LENCO_SECRET) {
    return res.status(500).json({ error: 'LENCO_SECRET_KEY missing' });
  }

  const amount = Number(amountPcu);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amountPcu must be a positive number' });
  }

  const normalizedPhone = String(phoneNumber).replace(/\s+/g, '');
  if (!/^\+260\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'phoneNumber must be in +260XXXXXXXXX format' });
  }

  const reference = `ENR-RED-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const response = await axios.post(
      LENCO_PAYOUT_BASE,
      {
        amount,
        currency: 'ZMW',
        accountNumber: normalizedPhone,
        accountName: 'Enerlectra User',
        narration: `Enerlectra redemption (${amount} PCU)`,
        reference,
      },
      {
        headers: { Authorization: `Bearer ${LENCO_SECRET}` },
        timeout: 15000,
      }
    );

    const providerRef = response.data?.data?.providerRef ?? null;
    return res.json({
      success: true,
      reference,
      status: 'processing',
      providerRef,
    });
  } catch (error: any) {
    console.error('[REDEEM ERROR]', error.response?.data || error.message);
    return res.status(500).json({
      error: error.response?.data?.message || 'Redemption payout failed',
    });
  }
});

// ═══════════════════════════════════════════════════════════
// LENCO WEBHOOK (Production Event Listener)
// ═══════════════════════════════════════════════════════════
// Note: We removed express.raw because index.ts already uses express.json()
router.post('/webhooks/lenco', async (req, res) => {
  const signature = req.headers['x-lenco-signature'];
  
  // To verify signature with pre-parsed JSON, we stringify the body
  // This is the most reliable way when sharing a global JSON parser
  const bodyString = JSON.stringify(req.body);

  if (signature && LENCO_WEBHOOK_SECRET) {
    const hmac = crypto.createHmac('sha256', LENCO_WEBHOOK_SECRET);
    const digest = hmac.update(bodyString).digest('hex');
    
    if (signature !== digest) {
      console.error('[WEBHOOK] Signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    const payload = req.body;
    const event = payload.event || payload.type;

    console.log(`[LENCO WEBHOOK] Event: ${event}`);

    if (event === 'collection.successful') {
      const reference = payload.data?.reference || payload.reference;
      
      const { error } = await supabase
        .from('contributions')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          payment_response: payload.data,
        })
        .eq('transaction_reference', reference);

      if (error) {
        console.error('[WEBHOOK SUPABASE ERROR]', error);
      } else {
        console.log(`✅ [WEBHOOK] Contribution ${reference} set to COMPLETED`);
      }
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[WEBHOOK PROCESSING ERROR]', err);
    res.status(500).json({ error: 'Internal processing error' });
  }
});

export default router;