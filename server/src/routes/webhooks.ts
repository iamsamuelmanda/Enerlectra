// server/src/routes/webhooks.ts
import express from 'express';
import type { Request, Response } from 'express';
import { WebhookHandler } from '../../enerlectra-core/src/domain/webhook/webhook-handler';
import { supabase } from '../../enerlectra-core/src/lib/supabase';
import { paymentOrchestrator } from '../services/payment-orchestrator';

const router = express.Router();

// Instantiate the domain handler once per process
const webhookHandler = new WebhookHandler(supabase, paymentOrchestrator);

// Helper to get secrets from env (no hardcoding)
const MTN_WEBHOOK_SECRET = process.env.MTN_WEBHOOK_SECRET || '';
const AIRTEL_WEBHOOK_SECRET = process.env.AIRTEL_WEBHOOK_SECRET || '';

// IMPORTANT: use the key that actually exists in Render
// This should be the same token you use for Authorization: Bearer <token> with Lenco
const LENCO_API_TOKEN = process.env.LENCO_SECRET_KEY || '';

// ====================== MTN Webhook ======================

router.post(
  '/webhooks/mtn',
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const signature = (req.headers['x-mtn-signature'] ||
        req.headers['x-signature']) as string | undefined;

      const rawBody = JSON.stringify(req.body);

      const result = await webhookHandler.processMTNWebhook(
        rawBody,
        signature,
        MTN_WEBHOOK_SECRET
      );

      if (result.success) {
        return res.status(200).json({
          message: 'MTN webhook processed successfully',
          webhookId: result.webhookId,
        });
      }

      return res
        .status(result.retry ? 500 : 400)
        .json({ error: result.error, webhookId: result.webhookId });
    } catch (error: any) {
      console.error('[MTN WEBHOOK ROUTE ERROR]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ====================== Airtel Webhook ======================

router.post(
  '/webhooks/airtel',
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const signature = (req.headers['x-airtel-signature'] ||
        req.headers['x-signature']) as string | undefined;

      const rawBody = JSON.stringify(req.body);

      const result = await webhookHandler.processAirtelWebhook(
        rawBody,
        signature,
        AIRTEL_WEBHOOK_SECRET
      );

      if (result.success) {
        return res.status(200).json({
          message: 'Airtel webhook processed successfully',
          webhookId: result.webhookId,
        });
      }

      return res
        .status(result.retry ? 500 : 400)
        .json({ error: result.error, webhookId: result.webhookId });
    } catch (error: any) {
      console.error('[AIRTEL WEBHOOK ROUTE ERROR]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ====================== Lenco Webhook ======================
// Lenco: X-Lenco-Signature header, HMAC SHA512 over raw JSON body,
// key = SHA256(API_TOKEN). We use express.raw() to preserve body. [web:12]

router.post(
  '/webhooks/lenco',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const signature = (req.headers['x-lenco-signature'] ||
        req.headers['x-signature']) as string | undefined;

      if (!signature) {
        console.warn('[LENCO WEBHOOK] Missing X-Lenco-Signature header');
      }

      const rawBody =
        req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body ?? '');

      const result = await webhookHandler.processLencoWebhook(
        rawBody,
        signature,
        LENCO_API_TOKEN
      );

      if (result.success) {
        return res.status(200).json({
          message: 'Lenco webhook processed successfully',
          webhookId: result.webhookId,
        });
      }

      return res
        .status(result.retry ? 500 : 400)
        .json({ error: result.error, webhookId: result.webhookId });
    } catch (error: any) {
      console.error('[LENCO WEBHOOK ROUTE ERROR]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ====================== Status check ======================

router.get('/webhooks/status', async (req: Request, res: Response) => {
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
        mtn: `${process.env.BASE_URL}/api/webhooks/mtn`,
        airtel: `${process.env.BASE_URL}/api/webhooks/airtel`,
        lenco: `${process.env.BASE_URL}/api/webhooks/lenco`,
      },
    });
  } catch (error: any) {
    console.error('[WEBHOOK STATUS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;