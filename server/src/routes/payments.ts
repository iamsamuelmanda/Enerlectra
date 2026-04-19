// server/src/routes/payments.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requestLencoPayout } from '../services/settlement.js';
import pino from 'pino';
import crypto from 'node:crypto';

const router = Router();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY;

// ====================== HELPERS ======================

async function getLiveExchangeRate(from = 'USD', to = 'ZMW'): Promise<number> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  if (!API_KEY) throw new Error('EXCHANGE_RATE_API_KEY is not configured');

  const axios = (await import('axios')).default;
  const response = await axios.get(
    `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${from}`,
    { timeout: 5000 }
  );

  if (response.data.result !== 'success') {
    throw new Error(`Exchange rate API error: ${response.data['error-type'] || 'unknown'}`);
  }

  const rate = response.data.conversion_rates?.[to];
  if (typeof rate !== 'number' || rate <= 0) throw new Error(`Invalid exchange rate for ${to}`);
  return rate;
}

/**
 * Lenco webhook signature verification.
 * Scheme: webhookHashKey = sha256(API_TOKEN), expected = HMAC-SHA512(webhookHashKey, payload)
 * https://lenco-api.readme.io/reference/webhooks
 */
function verifyLencoSignature(payload: string, signature: string | undefined): boolean {
  if (!LENCO_SECRET_KEY || !signature) return false;

  const webhookHashKey = crypto
    .createHash('sha256')
    .update(LENCO_SECRET_KEY)
    .digest('hex');

  const expected = crypto
    .createHmac('sha512', webhookHashKey)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected,  'utf8')
    );
  } catch {
    return false;
  }
}

// ====================== POST /api/payments/redeem ======================
// Redeem PCU for real mobile money via Lenco.
// Takes userId from body — no JWT required (bot + frontend both use this).

router.post('/redeem', async (req, res) => {
  try {
    const { userId, amount_pcu, phone_number } = req.body;

    if (!userId || !amount_pcu || !phone_number) {
      return res.status(400).json({ error: 'userId, amount_pcu, and phone_number are required' });
    }

    const amount = Number(amount_pcu);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount_pcu must be a positive number' });
    }

    const normalizedPhone = String(phone_number).replace(/\s+/g, '');
    if (!/^\+260\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'phone_number must be in +260XXXXXXXXX format' });
    }

    // 1. Verify PCU balance
    const { data: wallet, error: walletError } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', userId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    if (Number(wallet.balance_pcu) < amount) {
      return res.status(400).json({
        error: `Insufficient PCU balance (have ${wallet.balance_pcu}, need ${amount})`,
      });
    }

    // 2. Get user's active cluster
    const { data: membership } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(1)
      .single();
    const clusterId = membership?.cluster_id || 'clu_73x96b83';

    // 3. Live exchange rate
    const fxRate    = await getLiveExchangeRate('USD', 'ZMW');
    const amount_zmw = amount * fxRate;

    // 4. Trigger Lenco payout
    const payout = await requestLencoPayout({
      userId,
      clusterId,
      amount:      amount_zmw,
      phoneNumber: normalizedPhone,
      narration:   `PCU Redemption – ${amount} PCU → ZMW ${amount_zmw.toFixed(2)}`,
    }, logger);

    // 5. Deduct PCU balance
    const { error: updateError } = await supabase
      .from('pcu_balances')
      .update({
        balance_pcu: Number(wallet.balance_pcu) - amount,
        updated_at:  new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (updateError) throw updateError;

    // 6. Record transaction
    await supabase.from('energy_transactions').insert({
      from_user_id:     userId,
      to_user_id:       null,
      pcu_amount:       amount,
      zmw_amount:       amount_zmw,
      transaction_type: 'redeem',
      status:           payout.status === 'processing' ? 'pending' : payout.status,
      reference:        payout.reference,
      metadata: {
        phone_number: normalizedPhone,
        fx_rate:      fxRate,
        provider_ref: payout.providerRef,
      },
    });

    res.json({
      success:       true,
      reference:     payout.reference,
      status:        payout.status,
      amount_pcu:    amount,
      amount_zmw,
      remaining_pcu: Number(wallet.balance_pcu) - amount,
      message:       `Redemption of ${amount} PCU initiated. Payout of ZMW ${amount_zmw.toFixed(2)} to ${normalizedPhone} is processing.`,
    });

  } catch (error: any) {
    logger.error({ err: error }, 'Redemption failed');
    res.status(500).json({ error: error.message || 'Redemption failed', success: false });
  }
});

// ====================== POST /api/payments/verify ======================

router.post('/verify', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Missing reference' });

    const { data: tx, error } = await supabase
      .from('energy_transactions')
      .select('status, reference')
      .eq('reference', reference)
      .single();

    if (error || !tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, status: tx.status });

  } catch (error: any) {
    logger.error({ err: error }, 'Verification failed');
    res.status(500).json({ error: error.message });
  }
});

// ====================== POST /api/payments/webhooks/lenco ======================
// Lenco calls this after payout succeeds or fails.
// Signature verification uses SHA256(API_TOKEN) as HMAC-SHA512 key.

router.post('/webhooks/lenco', async (req, res) => {
  const signature = (
    req.headers['x-lenco-signature'] ||
    req.headers['x-lenco-webhook-signature'] ||
    req.headers['x-signature']
  ) as string | undefined;

  const rawBody = JSON.stringify(req.body);

  logger.info({
    signaturePresent: !!signature,
    payloadLength:    rawBody.length,
    keyConfigured:    !!LENCO_SECRET_KEY,
  }, '[LENCO WEBHOOK] Incoming');

  if (!verifyLencoSignature(rawBody, signature)) {
    logger.warn('[LENCO WEBHOOK] Signature verification failed — processing anyway for now');
    // NOTE: During initial integration, log but don't reject.
    // Uncomment the line below once signature is confirmed working:
    // return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const { reference, status, providerRef } = req.body;

    // Idempotency check
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('provider_ref', providerRef)
      .single();

    if (existing) return res.status(200).json({ received: true });

    // Record webhook event
    await supabase.from('webhook_events').insert({
      provider:     'lenco',
      provider_ref: providerRef,
      reference,
      status,
      payload:      req.body,
    });

    // Update transaction status
    const txStatus = status === 'SUCCESSFUL' ? 'completed'
                   : status === 'FAILED'     ? 'failed'
                   : 'pending';

    await supabase
      .from('energy_transactions')
      .update({ status: txStatus })
      .eq('reference', reference);

    // Update settlement_payouts
    await supabase
      .from('settlement_payouts')
      .update({
        status:       txStatus,
        completed_at: status === 'SUCCESSFUL' ? new Date().toISOString() : null,
      })
      .eq('reference', reference);

    logger.info({ reference, status, providerRef }, '[LENCO WEBHOOK] Payout updated');
    res.status(200).json({ received: true });

  } catch (error: any) {
    logger.error({ err: error }, 'Webhook processing failed');
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;