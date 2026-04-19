/**
 * Webhook Handler
 * Secure webhook processing with signature verification
 * Handles MTN, Airtel, and Lenco/Broadpay callbacks
 */

import { createHash, createHmac } from 'crypto';
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
  /**
   * Verify MTN webhook signature (example HMAC SHA256 hex)
   */
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

  /**
   * Verify Airtel webhook signature (example HMAC SHA256 base64)
   */
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
   * Lenco: X-Lenco-Signature = HMAC SHA512 over raw JSON payload,
   * using webhook_hash_key = SHA256(API_TOKEN). [web:12]
   */
  static verifyLencoSignature(
    payload: string,
    signature: string,
    apiToken: string
  ): boolean {
    if (!apiToken || !signature) return false;

    // Derive webhook_hash_key exactly as Lenco specifies. [web:12]
    const webhookHashKey = createHash('sha256')
      .update(apiToken)
      .digest('hex');

    const expectedSignature = createHmac('sha512', webhookHashKey)
      .update(payload)
      .digest('hex');

    return this.timingSafeEqual(
      expectedSignature.toLowerCase(),
      signature.toLowerCase()
    );
  }

  /**
   * Timing-safe string comparison
   */
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

  // MTN webhook omitted here for brevity – unchanged from your version
  // Airtel webhook omitted here for brevity – unchanged from your version

  // ═══════════════════════════════════════════════════════════
  // LENCO / BROADPAY WEBHOOK
  // ═══════════════════════════════════════════════════════════

  async processLencoWebhook(
    payload: string | Buffer,
    signature: string | undefined,
    apiToken: string
  ): Promise<WebhookProcessingResult> {
    const rawPayload = payload instanceof Buffer ? payload.toString('utf8') : payload;
    const webhookId = await this.logWebhook('LENCO', rawPayload);

    try {
      // Verify signature against raw JSON body
      if (signature) {
        const valid = WebhookSignatureVerifier.verifyLencoSignature(
          rawPayload,
          signature,
          apiToken
        );

        if (!valid) {
          await this.updateWebhookStatus(
            webhookId,
            'FAILED',
            'Invalid signature'
          );
          return {
            success: false,
            webhookId,
            processed: false,
            error: 'Invalid signature',
          };
        }
      }

      // Parse payload for business logic
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

      // Map to contribution status
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

  // logWebhook, updateWebhookStatus, retry code – unchanged from your version
}