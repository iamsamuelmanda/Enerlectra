// src/routes/webhooks.ts
import express from 'express';
import { Router } from 'express';
import crypto from 'node:crypto';
import { supabase } from '../../../enerlectra-core/src/lib/supabase';

const router = Router();

interface WebhookResult {
  success: boolean;
  webhookId?: string;
  error?: string;
  retry?: boolean;
}

/**
 * Generic webhook processor
 */
async function processWebhook(
  provider: string,
  payload: any,
  signature: string | null,
  secret: string | undefined,
): Promise<WebhookResult> {
  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Log webhook
    await supabase.from('webhook_logs').insert({
      id: webhookId,
      provider,
      payload,
      signature: signature || null,
      status: 'received',
      received_at: new Date().toISOString(),
    });

    // Signature verification hook (for providers that use it)
    if (secret && signature) {
      console.log(`Signature verification placeholder for ${provider}:`, signature);
    }

    // Process payment (simplified)
    if (payload?.status === 'completed' || payload?.payment_status === 'PAID') {
      await supabase.from('payments').upsert({
        transaction_id: payload.transaction_id || payload.reference,
        user_id: payload.user_id || payload.account_id,
        amount: payload.amount,
        status: 'confirmed',
        provider,
        webhook_id: webhookId,
      });

      return { success: true, webhookId };
    }

    return {
      success: false,
      error: 'Payment not confirmed',
      webhookId,
      retry: true,
    };
  } catch (error: any) {
    console.error(`[${provider.toUpperCase()} WEBHOOK ERROR]`, error);
    return {
      success: false,
      error: error.message,
      webhookId,
      retry: true,
    };
  }
}

// ====================== MTN Webhook ======================
router.post('/webhooks/mtn', express.json(), async (req, res) => {
  const signature = req.headers['x-mtn-signature'] as string | null;
  const result = await processWebhook(
    'mtn',
    req.body,
    signature,
    process.env.MTN_WEBHOOK_SECRET,
  );

  if (result.success) {
    res.status(200).json({
      message: 'Webhook processed successfully',
      webhookId: result.webhookId,
    });
  } else {
    res
      .status(result.retry ? 500 : 400)
      .json({ error: result.error, webhookId: result.webhookId });
  }
});

// ====================== Airtel Webhook ======================
router.post('/webhooks/airtel', express.json(), async (req, res) => {
  const signature = req.headers['x-airtel-signature'] as string | null;
  const result = await processWebhook(
    'airtel',
    req.body,
    signature,
    process.env.AIRTEL_WEBHOOK_SECRET,
  );

  if (result.success) {
    res.status(200).json({
      message: 'Webhook processed successfully',
      webhookId: result.webhookId,
    });
  } else {
    res
      .status(result.retry ? 500 : 400)
      .json({ error: result.error, webhookId: result.webhookId });
  }
});

// ====================== Lenco Webhook (with debug) ======================
// Lenco docs: header X-Lenco-Signature is HMAC SHA512 over JSON payload,
// using webhook_hash_key = SHA256(API_SECRET_KEY).

const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY || '';
const LENCO_WEBHOOK_HASH_KEY = LENCO_SECRET_KEY
  ? crypto.createHash('sha256').update(LENCO_SECRET_KEY).digest('hex')
  : '';

function computeLencoSignature(payload: any): string | null {
  if (!LENCO_WEBHOOK_HASH_KEY) return null;

  return crypto
    .createHmac('sha512', LENCO_WEBHOOK_HASH_KEY)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function verifyLencoSignature(payload: any, signature: string | undefined): boolean {
  if (!LENCO_WEBHOOK_HASH_KEY || !signature) return false;

  const computed = computeLencoSignature(payload);
  if (!computed) return false;

  return computed === signature;
}

router.post('/webhooks/lenco', express.json(), async (req, res) => {
  // Debug: log headers and body exactly as we see them
  console.log('[LENCO WEBHOOK DEBUG] headers', {
    'x-lenco-signature': req.headers['x-lenco-signature'],
    'x-signature': req.headers['x-signature'],
  });
  console.log('[LENCO WEBHOOK DEBUG] raw body', JSON.stringify(req.body));

  const signature = (req.headers['x-lenco-signature'] ||
    req.headers['x-signature']) as string | undefined;

  const computed = computeLencoSignature(req.body);

  if (!verifyLencoSignature(req.body, signature)) {
    console.warn('[LENCO WEBHOOK] Invalid signature', {
      received: signature,
      computed,
    });

    // Still log it for debugging, but do not process as valid payment
    await supabase.from('webhook_logs').insert({
      id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider: 'lenco',
      payload: req.body,
      signature: signature || null,
      status: 'invalid_signature',
      received_at: new Date().toISOString(),
    });

    // In production you might not want to expose computed/received;
    // this is mainly to help debugging now.
    return res.status(401).json({
      error: 'Invalid signature',
      receivedSignature: signature,
      computedSignature: computed,
    });
  }

  // At this point, the event is verified as coming from Lenco
  const result = await processWebhook('lenco', req.body, signature || null, undefined);

  if (result.success) {
    return res.status(200).json({
      message: 'Lenco webhook processed successfully',
      webhookId: result.webhookId,
    });
  }

  return res
    .status(result.retry ? 500 : 400)
    .json({ error: result.error, webhookId: result.webhookId });
});

// ====================== Status check ======================
router.get('/webhooks/status', async (req, res) => {
  try {
    const { data: recentWebhooks } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(10);

    res.json({
      status: 'ok',
      recentWebhooks,
      endpoints: {
        mtn: process.env.MTN_CALLBACK_URL || 'not-configured',
        airtel: process.env.AIRTEL_CALLBACK_URL || 'not-configured',
        lenco: `${process.env.BASE_URL}/api/webhooks/lenco`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;