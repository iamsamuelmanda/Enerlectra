import express from 'express';
import type { Request, Response } from 'express';
import { WebhookHandler } from '../../enerlectra-core/src/adapters/webhooks/webhook-handler';
import { supabase } from '../../enerlectra-core/src/lib/supabase';
import { paymentOrchestrator } from '../services/payment-orchestrator';

const router = express.Router();
const webhookHandler = new WebhookHandler(supabase, paymentOrchestrator);

const MTN_WEBHOOK_SECRET = process.env.MTN_WEBHOOK_SECRET || '';
const AIRTEL_WEBHOOK_SECRET = process.env.AIRTEL_WEBHOOK_SECRET || '';
const LENCO_WEBHOOK_SECRET = process.env.LENCO_WEBHOOK_SECRET || '';
const WEBHOOK_MAX_AGE_SECONDS = Number(process.env.WEBHOOK_MAX_AGE_SECONDS || 300);

type RawRequest = Request & { rawBody?: string };

function captureRawBody(req: RawRequest, _res: Response, buf: Buffer) {
  req.rawBody = buf.toString('utf8');
}

function extractTimestamp(headers: Record<string, any>): number | null {
  const ts = headers['x-webhook-timestamp'] || headers['x-timestamp'] || headers['x-lenco-timestamp'];
  if (!ts) return null;
  const n = Number(ts);
  return Number.isFinite(n) ? n : null;
}

function verifyFreshness(timestamp: number | null): boolean {
  if (timestamp === null) return true;
  const age = Math.floor(Date.now() / 1000) - timestamp;
  return age >= 0 && age <= WEBHOOK_MAX_AGE_SECONDS;
}

async function markWebhookSeen(webhookId: string, source: string): Promise<boolean> {
  const { error } = await supabase.from('webhook_events').insert({
    webhook_id: webhookId,
    source,
    received_at: new Date().toISOString(),
  });
  if (!error) return true;
  if ((error as any).code === '23505') return false;
  throw error;
}

router.post('/webhooks/mtn', express.json({ verify: captureRawBody }), async (req: RawRequest, res: Response) => {
  try {
    const signature = (req.headers['x-mtn-signature'] || req.headers['x-signature']) as string | undefined;
    const rawBody = req.rawBody || '';
    if (!signature) return res.status(401).json({ error: 'Missing signature' });
    if (!MTN_WEBHOOK_SECRET) return res.status(500).json({ error: 'Webhook secret not configured' });
    if (!verifyFreshness(extractTimestamp(req.headers as any))) return res.status(401).json({ error: 'Stale webhook' });

    const result = await webhookHandler.processMTNWebhook(rawBody, signature, MTN_WEBHOOK_SECRET);
    if (!result.success) return res.status(result.retry ? 500 : 400).json({ error: result.error, webhookId: result.webhookId });

    if (result.webhookId) await markWebhookSeen(result.webhookId, 'mtn').catch(() => null);
    return res.status(200).json({ message: 'MTN webhook processed successfully', webhookId: result.webhookId });
  } catch (error: any) {
    console.error('[MTN WEBHOOK ROUTE ERROR]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/webhooks/airtel', express.json({ verify: captureRawBody }), async (req: RawRequest, res: Response) => {
  try {
    const signature = (req.headers['x-airtel-signature'] || req.headers['x-signature']) as string | undefined;
    const rawBody = req.rawBody || '';
    if (!signature) return res.status(401).json({ error: 'Missing signature' });
    if (!AIRTEL_WEBHOOK_SECRET) return res.status(500).json({ error: 'Webhook secret not configured' });
    if (!verifyFreshness(extractTimestamp(req.headers as any))) return res.status(401).json({ error: 'Stale webhook' });

    const result = await webhookHandler.processAirtelWebhook(rawBody, signature, AIRTEL_WEBHOOK_SECRET);
    if (!result.success) return res.status(result.retry ? 500 : 400).json({ error: result.error, webhookId: result.webhookId });

    if (result.webhookId) await markWebhookSeen(result.webhookId, 'airtel').catch(() => null);
    return res.status(200).json({ message: 'Airtel webhook processed successfully', webhookId: result.webhookId });
  } catch (error: any) {
    console.error('[AIRTEL WEBHOOK ROUTE ERROR]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/webhooks/lenco', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = (req.headers['x-lenco-signature'] || req.headers['x-signature']) as string | undefined;
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body ?? '');
    if (!signature) return res.status(401).json({ error: 'Missing signature' });
    if (!LENCO_WEBHOOK_SECRET) return res.status(500).json({ error: 'Webhook secret not configured' });
    if (!verifyFreshness(extractTimestamp(req.headers as any))) return res.status(401).json({ error: 'Stale webhook' });

    const result = await webhookHandler.processLencoWebhook(rawBody, signature, LENCO_WEBHOOK_SECRET);
    if (!result.success) return res.status(result.retry ? 500 : 400).json({ error: result.error, webhookId: result.webhookId });

    if (result.webhookId) await markWebhookSeen(result.webhookId, 'lenco').catch(() => null);
    return res.status(200).json({ message: 'Lenco webhook processed successfully', webhookId: result.webhookId });
  } catch (error: any) {
    console.error('[LENCO WEBHOOK ROUTE ERROR]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/webhooks/status', async (_req: Request, res: Response) => {
  try {
    const { data: recentWebhooks } = await supabase
      .from('webhook_events')
      .select('webhook_id, source, received_at')
      .order('received_at', { ascending: false })
      .limit(10);

    return res.json({
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
    return res.status(500).json({ error: error.message });
  }
});

export default router;