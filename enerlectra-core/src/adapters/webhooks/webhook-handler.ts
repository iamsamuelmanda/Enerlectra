import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../domain/payment/payment-orchestrator';
import { PaymentRail } from '../../domain/treasury/treasury-types';
import { ngwee } from '../../domain/settlement/settlement-types';

export interface WebhookPayload {
  event?: string;
  type?: string;
  kind?: string;
  data?: any;
  timestamp?: string | number;
  signature?: string;
  reference?: string;
  transaction_id?: string;
  transactionId?: string;
  id?: string;
  status?: string;
  amount?: number | string;
  phone_number?: string;
  msisdn?: string;
  provider_ref?: string;
  message?: string;
  error?: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  webhookId: string;
  processed: boolean;
  error?: string;
  retry?: boolean;
}

type WebhookKind = 'contribution' | 'payout' | 'unknown';

const WEBHOOK_EVENTS_TABLE = process.env.WEBHOOK_EVENTS_TABLE || 'webhook_events';
const CONTRIBUTIONS_TABLE = process.env.CONTRIBUTIONS_TABLE || 'payment_intents';
const SETTLEMENT_PAYOUTS_TABLE = process.env.SETTLEMENT_PAYOUTS_TABLE || 'settlement_payouts';
const WEBHOOK_MAX_AGE_SECONDS = Number(process.env.WEBHOOK_MAX_AGE_SECONDS || 300);

export class WebhookSignatureVerifier {
  static verify(payload: string, signature: string, secret: string, algorithm: 'sha256' | 'sha512', output: 'hex' | 'base64' = 'hex'): boolean {
    if (!secret || !signature) return false;
    const expected = crypto.createHmac(algorithm, secret).update(payload).digest(output);
    return this.safeEqual(expected, signature);
  }

  static verifyMTNSignature(payload: string, signature: string, secret: string): boolean {
    return this.verify(payload, signature, secret, 'sha256', 'hex');
  }

  static verifyAirtelSignature(payload: string, signature: string, secret: string): boolean {
    return this.verify(payload, signature, secret, 'sha256', 'base64');
  }

  static verifyLencoSignature(payload: string, signature: string, secret: string): boolean {
    return this.verify(payload, signature, secret, 'sha512', 'hex');
  }

  static safeEqual(a: string, b: string): boolean {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  }
}

export class WebhookHandler {
  constructor(
    private supabase: SupabaseClient,
    private orchestrator: PaymentOrchestrator
  ) {}

  async processMTNWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult> {
    return this.processProviderWebhook({ provider: 'MTN', payload, signature, secret, verifier: WebhookSignatureVerifier.verifyMTNSignature });
  }

  async processAirtelWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult> {
    return this.processProviderWebhook({ provider: 'AIRTEL', payload, signature, secret, verifier: WebhookSignatureVerifier.verifyAirtelSignature });
  }

  async processLencoWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult> {
    return this.processProviderWebhook({ provider: 'LENCO', payload, signature, secret, verifier: WebhookSignatureVerifier.verifyLencoSignature });
  }

  private async processProviderWebhook(params: {
    provider: string;
    payload: string | Buffer;
    signature?: string;
    secret: string;
    verifier: (payload: string, signature: string, secret: string) => boolean;
  }): Promise<WebhookProcessingResult> {
    const rawPayload = params.payload instanceof Buffer ? params.payload.toString('utf8') : params.payload;
    const parsed = this.parsePayload(rawPayload);
    const webhookId = this.resolveWebhookId(params.provider, parsed, rawPayload, params.signature);
    const eventType = this.resolveEventType(parsed, params.provider);
    const kind = this.resolveKind(eventType, parsed, params.provider);
    const reference = this.resolveReference(parsed, kind);
    const timestamp = this.resolveTimestamp(parsed);

    const logged = await this.logWebhook({
      webhookId,
      source: params.provider,
      eventType,
      reference,
      payload: parsed ?? { raw: rawPayload },
    });
    if (!logged.inserted) return { success: true, webhookId, processed: false };

    try {
      if (params.signature) {
        const ok = params.verifier(rawPayload, params.signature, params.secret);
        if (!ok) {
          await this.updateWebhookStatus(webhookId, 'FAILED', 'Invalid signature');
          return { success: false, webhookId, processed: false, error: 'Invalid signature' };
        }
      }

      if (timestamp !== null && !this.isFresh(timestamp)) {
        await this.updateWebhookStatus(webhookId, 'FAILED', 'Stale webhook');
        return { success: false, webhookId, processed: false, error: 'Stale webhook' };
      }

      if (kind === 'unknown') {
        await this.updateWebhookStatus(webhookId, 'IGNORED', 'Unsupported event type');
        return { success: true, webhookId, processed: false };
      }

      if (kind === 'contribution') {
        await this.handleContributionWebhook({ webhookId, eventType, reference, payload: parsed, provider: params.provider });
      } else {
        await this.handlePayoutWebhook({ webhookId, eventType, reference, payload: parsed, provider: params.provider });
      }

      await this.updateWebhookStatus(webhookId, 'COMPLETED');
      return { success: true, webhookId, processed: true };
    } catch (error: any) {
      await this.updateWebhookStatus(webhookId, 'ERROR', error?.message || 'Webhook processing failed');
      return { success: false, webhookId, processed: false, error: error?.message || 'Webhook processing failed', retry: true };
    }
  }

  private parsePayload(rawPayload: string): any {
    try { return JSON.parse(rawPayload); } catch { return null; }
  }

  private resolveEventType(payload: any, provider: string): string {
    const candidates = [payload?.event, payload?.type, payload?.kind, payload?.data?.event, payload?.data?.type].filter(Boolean);
    const value = candidates.find(v => typeof v === 'string' && v.trim().length > 0);
    return String(value || `${provider.toLowerCase()}.unknown`).toLowerCase();
  }

  private resolveKind(eventType: string, payload: any, provider: string): WebhookKind {
    const combined = `${eventType} ${JSON.stringify(payload || {})}`.toLowerCase();
    if (/(payout|disbursement|transfer|settlement)/.test(combined)) return 'payout';
    if (/(contribution|deposit|payment|collection|funding|success|paid)/.test(combined)) return 'contribution';
    if (provider === 'LENCO') return 'payout';
    return 'unknown';
  }

  private resolveReference(payload: any, kind: WebhookKind): string | null {
    const candidates = [payload?.reference, payload?.transaction_id, payload?.transactionId, payload?.id, payload?.data?.reference, payload?.data?.transaction_id, payload?.provider_ref, payload?.data?.provider_ref];
    const ref = candidates.find(v => typeof v === 'string' && v.trim().length > 0);
    return ref ? String(ref) : null;
  }

  private resolveWebhookId(provider: string, payload: any, rawPayload: string, signature?: string): string {
    const ref = this.resolveReference(payload, 'unknown');
    if (ref) return `${provider}:${ref}`;
    const basis = `${provider}|${signature || ''}|${rawPayload}`;
    return `${provider}:${crypto.createHash('sha256').update(basis).digest('hex')}`;
  }

  private resolveTimestamp(payload: any): number | null {
    const ts = payload?.timestamp || payload?.data?.timestamp || payload?.created_at || payload?.data?.created_at;
    if (!ts) return null;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(n) ? (typeof ts === 'number' ? ts : Math.floor(n / 1000)) : null;
  }

  private isFresh(timestampSeconds: number): boolean {
    const age = Math.floor(Date.now() / 1000) - timestampSeconds;
    return age >= 0 && age <= WEBHOOK_MAX_AGE_SECONDS;
  }

  private async logWebhook(params: { webhookId: string; source: string; eventType: string; reference: string | null; payload: any }): Promise<{ inserted: boolean }> {
    const { error } = await this.supabase.from(WEBHOOK_EVENTS_TABLE).insert({
      webhook_id: params.webhookId,
      source: params.source,
      event_type: params.eventType,
      reference: params.reference,
      status: 'received',
      payload: params.payload ?? {},
      received_at: new Date().toISOString(),
    });
    if (!error) return { inserted: true };
    if ((error as any).code === '23505') return { inserted: false };
    throw error;
  }

  private async updateWebhookStatus(webhookId: string, status: string, errorMessage?: string): Promise<void> {
    await this.supabase.from(WEBHOOK_EVENTS_TABLE).update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    }).eq('webhook_id', webhookId);
  }

  private normalizeContributionStatus(status: string): 'SUCCESS' | 'FAILED' | 'PENDING' {
    const s = status.toUpperCase();
    if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID', 'CONFIRMED'].includes(s)) return 'SUCCESS';
    if (['FAILED', 'ERROR', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(s)) return 'FAILED';
    return 'PENDING';
  }

  private normalizePayoutStatus(status: string): string {
    const s = status.toLowerCase();
    if (['success', 'successful', 'completed', 'paid', 'confirmed'].includes(s)) return 'completed';
    if (['failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
    return 'pending';
  }

  private async handleContributionWebhook(params: { webhookId: string; eventType: string; reference: string | null; payload: any; provider: string }): Promise<void> {
    const externalReference = params.reference || this.resolveReference(params.payload, 'contribution');
    if (!externalReference) throw new Error('Missing contribution reference');

    const amountRaw = params.payload?.amount ?? params.payload?.data?.amount ?? params.payload?.amount_zmw ?? params.payload?.data?.amount_zmw;
    const amountZmw = Number(amountRaw);
    const contributionStatus = this.normalizeContributionStatus(String(params.payload?.status || params.payload?.data?.status || params.eventType || 'PENDING'));

    const { data: intent, error: fetchError } = await this.supabase
      .from(CONTRIBUTIONS_TABLE)
      .select('*')
      .eq('transaction_id', externalReference)
      .maybeSingle();
    if (fetchError) throw fetchError;

    if (!intent) {
      const fallback = await this.orchestrator.confirmPayment({
        externalReference,
        rail: this.mapProviderToRail(params.provider),
        amountNgwee: ngwee(Number.isFinite(amountZmw) ? Math.round(amountZmw * 100) : 0),
        confirmedAt: new Date(),
        metadata: { provider: params.provider, eventType: params.eventType, payload: params.payload },
      });
      if (!fallback.success && contributionStatus === 'FAILED') throw new Error(fallback.error || 'Contribution confirmation failed');
      if (!fallback.success) throw new Error(fallback.error || 'Contribution confirmation failed');
      return;
    }

    if (contributionStatus === 'FAILED') {
      const { error } = await this.supabase.from(CONTRIBUTIONS_TABLE).update({
        status: 'FAILED',
        metadata: { ...(intent.metadata || {}), webhook: params.payload },
        updated_at: new Date().toISOString(),
      }).eq('transaction_id', externalReference);
      if (error) throw error;
      return;
    }

    const confirmation = await this.orchestrator.confirmPayment({
      externalReference,
      rail: this.mapProviderToRail(params.provider),
      amountNgwee: ngwee(Number.isFinite(amountZmw) ? Math.round(amountZmw * 100) : 0),
      confirmedAt: new Date(),
      metadata: { provider: params.provider, eventType: params.eventType, payload: params.payload },
    });

    if (!confirmation.success) throw new Error(confirmation.error || 'Payment confirmation failed');
  }

  private async handlePayoutWebhook(params: { webhookId: string; eventType: string; reference: string | null; payload: any; provider: string }): Promise<void> {
    const reference = params.reference || this.resolveReference(params.payload, 'payout');
    if (!reference) throw new Error('Missing payout reference');

    const status = this.normalizePayoutStatus(String(params.payload?.status || params.payload?.data?.status || params.eventType || 'pending'));
    const providerRef = String(params.payload?.provider_ref || params.payload?.data?.provider_ref || params.payload?.transaction_id || params.payload?.id || reference);

    const { data: payout, error: fetchError } = await this.supabase
      .from(SETTLEMENT_PAYOUTS_TABLE)
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!payout) throw new Error(`Payout not found for reference ${reference}`);

    const update: Record<string, any> = {
      status,
      provider: params.provider.toLowerCase(),
      provider_ref: providerRef,
      error_message: status === 'failed' ? String(params.payload?.message || params.payload?.error || params.payload?.data?.message || params.payload?.data?.error || 'Payout failed') : null,
      updated_at: new Date().toISOString(),
      metadata: { ...(payout.metadata || {}), webhook: params.payload },
    };
    if (status === 'completed') update.completed_at = new Date().toISOString();

    const { error } = await this.supabase.from(SETTLEMENT_PAYOUTS_TABLE).update(update).eq('reference', reference);
    if (error) throw error;
  }

  private mapProviderToRail(provider: string): PaymentRail {
    const p = provider.toLowerCase();
    if (p.includes('mtn')) return PaymentRail.MTN;
    if (p.includes('airtel')) return PaymentRail.AIRTEL;
    if (p.includes('lenco')) return PaymentRail.BANK;
    return PaymentRail.BANK;
  }
}
'''
route = r'''import { Router, type Request, type Response } from 'express';
import { WebhookHandler } from '../handlers/webhook-handler';

export function createWebhookRouter(handler: WebhookHandler) {
  const router = Router();

  router.post('/mtn', async (req: Request, res: Response) => {
    const signature = (req.header('x-mtn-signature') || req.header('x-signature') || undefined) as string | undefined;
    const secret = process.env.MTN_WEBHOOK_SECRET || '';
    const result = await handler.processMTNWebhook(req.body, signature, secret);
    return result.success ? res.status(200).json({ ok: true }) : res.status(400).json({ ok: false, error: result.error });
  });

  router.post('/airtel', async (req: Request, res: Response) => {
    const signature = (req.header('x-airtel-signature') || req.header('x-signature') || undefined) as string | undefined;
    const secret = process.env.AIRTEL_WEBHOOK_SECRET || '';
    const result = await handler.processAirtelWebhook(req.body, signature, secret);
    return result.success ? res.status(200).json({ ok: true }) : res.status(400).json({ ok: false, error: result.error });
  });

  router.post('/lenco', async (req: Request, res: Response) => {
    const signature = (req.header('x-lenco-signature') || req.header('x-signature') || undefined) as string | undefined;
    const secret = process.env.LENCO_WEBHOOK_SECRET || '';
    const result = await handler.processLencoWebhook(req.body, signature, secret);
    return result.success ? res.status(200).json({ ok: true }) : res.status(400).json({ ok: false, error: result.error });
  });

  return router;
}