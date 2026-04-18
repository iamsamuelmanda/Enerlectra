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

const LENCO_WEBHOOK_SECRET = process.env.LENCO_WEBHOOK_SECRET;

/**
 * Fetch live USD → ZMW exchange rate.
 * Throws error if API fails – no hardcoded fallback.
 */
async function getLiveExchangeRate(from: string = 'USD', to: string = 'ZMW'): Promise<number> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  if (!API_KEY) {
    throw new Error('EXCHANGE_RATE_API_KEY is not configured');
  }

  const axios = (await import('axios')).default;
  const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${from}`;
  const response = await axios.get(url, { timeout: 5000 });

  if (response.data.result !== 'success') {
    throw new Error(`Exchange rate API error: ${response.data['error-type'] || 'unknown'}`);
  }

  const rate = response.data.conversion_rates?.[to];
  if (typeof rate !== 'number' || rate <= 0) {
    throw new Error(`Invalid exchange rate for ${to}`);
  }

  return rate;
}

/**
 * POST /api/payments/redeem
 * Redeem PCU for real mobile money via Lenco.
 */
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
    if (wallet.balance_pcu < amount) {
      return res.status(400).json({ error: `Insufficient PCU balance (have ${wallet.balance_pcu}, need ${amount})` });
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

    // 3. Live exchange rate – no fallback
    const fxRate = await getLiveExchangeRate('USD', 'ZMW');
    const amount_zmw = amount * fxRate;

    // 4. Trigger real Lenco payout
    const payout = await requestLencoPayout({
      userId,
      clusterId,
      amount: amount_zmw,
      phoneNumber: normalizedPhone,
      narration: `PCU Redemption – ${amount} PCU → ZMW ${amount_zmw.toFixed(2)}`,
    }, logger);

    // 5. Deduct PCU balance
    const { error: updateError } = await supabase
      .from('pcu_balances')
      .update({
        balance_pcu: wallet.balance_pcu - amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (updateError) throw updateError;

    // 6. Record transaction
    await supabase.from('energy_transactions').insert({
      from_user_id: userId,
      to_user_id: null,
      pcu_amount: amount,
      zmw_amount: amount_zmw,
      transaction_type: 'redeem',
      status: payout.status === 'processing' ? 'pending' : payout.status,
      reference: payout.reference,
      metadata: { phone_number: normalizedPhone, fx_rate: fxRate, provider_ref: payout.providerRef },
    });

    res.json({
      success: true,
      reference: payout.reference,
      status: payout.status,
      amount_pcu: amount,
      amount_zmw,
      remaining_pcu: wallet.balance_pcu - amount,
      message: `Redemption of ${amount} PCU initiated. Payout of ZMW ${amount_zmw.toFixed(2)} to ${normalizedPhone} is processing.`,
    });

  } catch (error: any) {
    logger.error({ err: error }, 'Redemption failed');
    res.status(500).json({ error: error.message || 'Redemption failed', success: false });
  }
});

/**
 * POST /api/payments/verify
 * Called by frontend after Lenco widget success.
 */
router.post('/verify', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const { data: tx, error } = await supabase
      .from('energy_transactions')
      .select('status, reference')
      .eq('reference', reference)
      .single();

    if (error || !tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ success: true, status: tx.status });
  } catch (error: any) {
    logger.error({ err: error }, 'Verification failed');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks/lenco
 * Lenco webhook receiver with signature verification.
 */
router.post('/webhooks/lenco', async (req, res) => {
  const signature = req.headers['x-lenco-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  if (signature && LENCO_WEBHOOK_SECRET) {
    const hmac = crypto.createHmac('sha256', LENCO_WEBHOOK_SECRET);
    const digest = hmac.update(rawBody).digest('hex');
    if (signature !== digest) {
      logger.warn('[LENCO WEBHOOK] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    const { reference, status, providerRef } = req.body;

    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('provider_ref', providerRef)
      .single();

    if (existing) {
      return res.status(200).json({ received: true });
    }

    await supabase.from('webhook_events').insert({
      provider: 'lenco',
      provider_ref: providerRef,
      reference,
      status,
      payload: req.body,
    });

    await supabase
      .from('energy_transactions')
      .update({
        status: status === 'SUCCESSFUL' ? 'completed' : status === 'FAILED' ? 'failed' : 'pending',
        metadata: supabase.sql`metadata || ${JSON.stringify({ webhook_status: status })}::jsonb`,
      })
      .eq('reference', reference);

    logger.info(`[LENCO WEBHOOK] Payout ${reference} ${status}`);
    res.status(200).json({ received: true });

  } catch (error: any) {
    logger.error({ err: error }, 'Webhook processing failed');
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;