// src/routes/webhooks.ts
import express from 'express';
import { WebhookHandler } from '../../enerlectra-core/src/adapters/webhooks/webhook-handler';
import { PaymentOrchestrator } from '../../enerlectra-core/src/domain/payment/payment-orchestrator';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Initialize core classes
const orchestrator = new PaymentOrchestrator(supabase);
const webhookHandler = new WebhookHandler(supabase, orchestrator);

// ═══════════════════════════════════════════════════════════
// MTN WEBHOOK (existing - unchanged)
// ═══════════════════════════════════════════════════════════
router.post('/webhooks/mtn', async (req, res) => {
  try {
    const signature = req.headers['x-mtn-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    const result = await webhookHandler.processMTNWebhook(
      payload,
      signature,
      process.env.MTN_WEBHOOK_SECRET!
    );

    if (result.success) {
      res.status(200).json({ 
        message: 'Webhook processed successfully',
        webhookId: result.webhookId 
      });
    } else {
      res.status(result.retry ? 500 : 400).json({ 
        error: result.error,
        webhookId: result.webhookId 
      });
    }
  } catch (error: any) {
    console.error('[MTN WEBHOOK ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// AIRTEL WEBHOOK (existing - unchanged)
// ═══════════════════════════════════════════════════════════
router.post('/webhooks/airtel', async (req, res) => {
  try {
    const signature = req.headers['x-airtel-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    const result = await webhookHandler.processAirtelWebhook(
      payload,
      signature,
      process.env.AIRTEL_WEBHOOK_SECRET!
    );

    if (result.success) {
      res.status(200).json({ 
        message: 'Webhook processed successfully',
        webhookId: result.webhookId 
      });
    } else {
      res.status(result.retry ? 500 : 400).json({ 
        error: result.error,
        webhookId: result.webhookId 
      });
    }
  } catch (error: any) {
    console.error('[AIRTEL WEBHOOK ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// LENCO / BROADPAY WEBHOOK  ← NEW (this is what we need now)
// ═══════════════════════════════════════════════════════════
router.post('/webhooks/lenco', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const payload = req.body; // raw body for signature verification

    const result = await webhookHandler.processLencoWebhook(
      payload,
      signature,
      process.env.LENCO_WEBHOOK_SECRET!
    );

    if (result.success) {
      res.status(200).json({ 
        message: 'Lenco webhook processed successfully',
        webhookId: result.webhookId 
      });
    } else {
      res.status(result.retry ? 500 : 400).json({ 
        error: result.error,
        webhookId: result.webhookId 
      });
    }
  } catch (error: any) {
    console.error('[LENCO WEBHOOK ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// WEBHOOK STATUS CHECK (for debugging - unchanged)
// ═══════════════════════════════════════════════════════════
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
        mtn: `${process.env.MTN_CALLBACK_URL}`,
        airtel: `${process.env.AIRTEL_CALLBACK_URL}`,
        lenco: `${process.env.BASE_URL}/api/webhooks/lenco`   // ← added
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;