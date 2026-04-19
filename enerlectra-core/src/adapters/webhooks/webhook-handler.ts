/**
 * Webhook Handler
 * Secure webhook processing with signature verification
 * Handles MTN, Airtel, and Lenco/Broadpay callbacks
 */

import { createHmac } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../domain/payment/payment-orchestrator';
import { PaymentRail } from '../../domain/treasury/treasury-types';
import { ngwee } from '../../domain/settlement/settlement-types';

// Local alias for the payment confirmation shape used by the orchestrator
type WebhookPaymentConfirmation = {
  externalReference: string;
  rail: PaymentRail;
  amountNgwee: ReturnType<typeof ngwee>;
  confirmedAt: Date;
  metadata?: Record<string, any>;
};

// ═══════════════════════════════════════════════════════════════
// WEBHOOK TYPES
// ═══════════════════════════════════════════════════════════════

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  signature?: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  webhookId: string;
  processed: boolean;
  error?: string;
  retry?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════

export class WebhookSignatureVerifier {
  static verifyMTNSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!secret || !signature) return false;

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return this.timingSafeEqual(
      expectedSignature.toLowerCase(),
      signature.toLowerCase()
    );
  }

  static verifyAirtelSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!secret || !signature) return false;

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    return this.timingSafeEqual(expectedSignature, signature);
  }

  /**
   * Verify Lenco webhook signature
   * Here we assume Lenco signs with a dedicated webhook secret
   * using HMAC-SHA512 over the raw JSON payload.
   */
  static verifyLencoSignature(
    payload: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    if (!webhookSecret || !signature) return false;

    const expectedSignature = createHmac('sha512', webhookSecret)
      .update(payload)
      .digest('hex');

    return this.timingSafeEqual(
      expectedSignature.toLowerCase(),
      signature.toLowerCase()
    );
  }

  private static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

// ═══════════════════════════════════════════════════════════════
/** WEBHOOK HANDLER */
// ═══════════════════════════════════════════════════════════════

export class WebhookHandler {
  constructor(
    private supabase: SupabaseClient,
    private orchestrator: PaymentOrchestrator
  ) {}

  // MTN and Airtel processing unchanged...

  async processLencoWebhook(
    payload: string | Buffer,
    signature: string | undefined,
    webhookSecret: string
  ): Promise<WebhookProcessingResult> {
    const rawPayload = payload instanceof Buffer ? payload.toString('utf8') : payload;
    const webhookId = await this.logWebhook('LENCO', rawPayload);

    try {
      // --- DEBUG: log what we are actually verifying ---
      console.log('[LENCO DEBUG] Signature header:', signature);
      console.log('[LENCO DEBUG] Raw payload (first 500 chars):', rawPayload.slice(0, 500));
      console.log(
        '[LENCO DEBUG] Webhook secret length:',
        webhookSecret ? webhookSecret.length : 0
      );
      // --------------------------------------------------

      if (signature) {
        const valid = WebhookSignatureVerifier.verifyLencoSignature(
          rawPayload,
          signature,
          webhookSecret
        );

        if (!valid) {
          await this.updateWebhookStatus(
            webhookId,
            'FAILED',
            'Invalid signature'
          );
          console.warn('[LENCO DEBUG] Signature verification failed');
          return {
            success: false,
            webhookId,
            processed: false,
            error: 'Invalid signature',
          };
        }
      }

      const data = JSON.parse(rawPayload);

      const reference =
        data.reference || data.transaction_id || data.data?.reference;
      const status =
        data.status ||
        data.transaction?.status ||
        data.data?.status;

      if (!reference) {
        await this.updateWebhookStatus(
          webhookId,
          'IGNORED',
          'No reference found'
        );
        return { success: true, webhookId, processed: false };
      }

      let newStatus = 'PENDING';
      if (
        ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(
          status?.toUpperCase?.() ?? ''
        )
      ) {
        newStatus = 'COMPLETED';
      } else if (
        ['FAILED', 'ERROR'].includes(status?.toUpperCase?.() ?? '')
      ) {
        newStatus = 'FAILED';
      }

      const { error: updateError } = await this.supabase
        .from('contributions')
        .update({
          status: newStatus,
          transaction_id: data.transaction_id || data.id,
          updated_at: new Date().toISOString(),
          payment_response: data,
          completed_at:
            newStatus === 'COMPLETED'
              ? new Date().toISOString()
              : null,
        })
        .eq('id', reference);

      if (updateError) {
        console.error('Lenco webhook DB update failed:', updateError);
      }

      await this.updateWebhookStatus(webhookId, newStatus);
      console.log(`✅ Lenco webhook: ${reference} → ${newStatus}`);

      return {
        success: true,
        webhookId,
        processed: true,
      };
    } catch (error: any) {
      console.error('[LENCO WEBHOOK ERROR]', error);
      await this.updateWebhookStatus(
        webhookId,
        'ERROR',
        error.message
      );
      return {
        success: false,
        webhookId,
        processed: false,
        error: error.message,
        retry: true,
      };
    }
  }

  // logWebhook, updateWebhookStatus, retry logic unchanged...
}