/**
 * Webhook Handler
 * Secure webhook processing with signature verification
 * Handles MTN, Airtel, and other payment rail callbacks
 */

import { createHmac } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../domain/payment/payment-orchestrator';
import { PaymentConfirmation, PaymentRail } from '../../domain/treasury/treasury-types';
import { ngwee } from '../../domain/settlement/settlement-types';

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
   * Verify MTN webhook signature
   */
  static verifyMTNSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Verify Airtel webhook signature
   */
  static verifyAirtelSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Generic HMAC verification
   */
  static verifyHMAC(
    payload: string,
    signature: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256',
    encoding: 'hex' | 'base64' = 'hex'
  ): boolean {
    const expectedSignature = createHmac(algorithm, secret)
      .update(payload)
      .digest(encoding);

    // Timing-safe comparison to prevent timing attacks
    return this.timingSafeEqual(signature, expectedSignature);
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
// WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════

export class WebhookHandler {
  constructor(
    private supabase: SupabaseClient,
    private orchestrator: PaymentOrchestrator
  ) {}

  // ═══════════════════════════════════════════════════════════
  // MTN WEBHOOK PROCESSING
  // ═══════════════════════════════════════════════════════════

  /**
   * Process MTN payment webhook
   */
  async processMTNWebhook(
    payload: string,
    signature: string | undefined,
    secret: string
  ): Promise<WebhookProcessingResult> {
    const webhookId = await this.logWebhook('MTN', payload);

    try {
      // Verify signature
      if (signature) {
        const valid = WebhookSignatureVerifier.verifyMTNSignature(
          payload,
          signature,
          secret
        );

        if (!valid) {
          await this.updateWebhookStatus(webhookId, 'FAILED', 'Invalid signature');
          return {
            success: false,
            webhookId,
            processed: false,
            error: 'Invalid signature'
          };
        }
      }

      // Parse payload
      const data = JSON.parse(payload);

      // Check if this is a payment confirmation
      if (data.status === 'SUCCESSFUL') {
        const confirmation: PaymentConfirmation = {
          externalReference: data.referenceId || data.financialTransactionId,
          rail: 'MTN' as PaymentRail,
          amountNgwee: ngwee(BigInt(Math.round(parseFloat(data.amount) * 100))),
          confirmedAt: new Date(data.timestamp || Date.now()),
          metadata: {
            partyId: data.payer?.partyId,
            currency: data.currency
          }
        };

        // Process through orchestrator
        const result = await this.orchestrator.confirmPayment(confirmation);

        await this.updateWebhookStatus(
          webhookId,
          result.success ? 'PROCESSED' : 'FAILED',
          result.error
        );

        return {
          success: result.success,
          webhookId,
          processed: true,
          error: result.error
        };
      }

      // Not a payment confirmation, just log it
      await this.updateWebhookStatus(webhookId, 'IGNORED', 'Not a payment confirmation');

      return {
        success: true,
        webhookId,
        processed: false
      };

    } catch (error: any) {
      await this.updateWebhookStatus(webhookId, 'ERROR', error.message);

      return {
        success: false,
        webhookId,
        processed: false,
        error: error.message,
        retry: true // Retry on errors
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AIRTEL WEBHOOK PROCESSING
  // ═══════════════════════════════════════════════════════════

  /**
   * Process Airtel payment webhook
   */
  async processAirtelWebhook(
    payload: string,
    signature: string | undefined,
    secret: string
  ): Promise<WebhookProcessingResult> {
    const webhookId = await this.logWebhook('AIRTEL', payload);

    try {
      // Verify signature
      if (signature) {
        const valid = WebhookSignatureVerifier.verifyAirtelSignature(
          payload,
          signature,
          secret
        );

        if (!valid) {
          await this.updateWebhookStatus(webhookId, 'FAILED', 'Invalid signature');
          return {
            success: false,
            webhookId,
            processed: false,
            error: 'Invalid signature'
          };
        }
      }

      // Parse payload
      const data = JSON.parse(payload);

      // Check if payment was successful
      if (data.transaction?.status === 'SUCCESS' || data.status?.success === true) {
        const confirmation: PaymentConfirmation = {
          externalReference: data.transaction?.id || data.data?.transaction?.id,
          rail: 'AIRTEL' as PaymentRail,
          amountNgwee: ngwee(
            BigInt(Math.round(parseFloat(data.transaction?.amount || data.data?.transaction?.amount) * 100))
          ),
          confirmedAt: new Date(),
          metadata: {
            msisdn: data.subscriber?.msisdn,
            currency: data.transaction?.currency
          }
        };

        const result = await this.orchestrator.confirmPayment(confirmation);

        await this.updateWebhookStatus(
          webhookId,
          result.success ? 'PROCESSED' : 'FAILED',
          result.error
        );

        return {
          success: result.success,
          webhookId,
          processed: true,
          error: result.error
        };
      }

      await this.updateWebhookStatus(webhookId, 'IGNORED', 'Not a successful payment');

      return {
        success: true,
        webhookId,
        processed: false
      };

    } catch (error: any) {
      await this.updateWebhookStatus(webhookId, 'ERROR', error.message);

      return {
        success: false,
        webhookId,
        processed: false,
        error: error.message,
        retry: true
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // WEBHOOK LOGGING
  // ═══════════════════════════════════════════════════════════

  /**
   * Log incoming webhook for audit trail
   */
  private async logWebhook(
    source: string,
    payload: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('webhook_logs')
      .insert({
        source,
        payload,
        received_at: new Date().toISOString(),
        status: 'RECEIVED'
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Update webhook processing status
   */
  private async updateWebhookStatus(
    webhookId: string,
    status: string,
    error?: string
  ): Promise<void> {
    await this.supabase
      .from('webhook_logs')
      .update({
        status,
        error_message: error,
        processed_at: new Date().toISOString()
      })
      .eq('id', webhookId);
  }

  // ═══════════════════════════════════════════════════════════
  // RETRY LOGIC
  // ═══════════════════════════════════════════════════════════

  /**
   * Get failed webhooks that need retry
   */
  async getFailedWebhooks(
    maxRetries: number = 3
  ): Promise<Array<{
    id: string;
    source: string;
    payload: string;
    retry_count: number;
  }>> {
    const { data } = await this.supabase
      .from('webhook_logs')
      .select('*')
      .eq('status', 'ERROR')
      .lt('retry_count', maxRetries)
      .order('received_at', { ascending: true })
      .limit(100);

    return data || [];
  }

  /**
   * Retry failed webhook
   */
  async retryWebhook(
    webhookId: string,
    source: string,
    payload: string,
    secret: string
  ): Promise<WebhookProcessingResult> {
    // Increment retry count
    await this.supabase
      .from('webhook_logs')
      .update({
        retry_count: this.supabase.sql`retry_count + 1`,
        last_retry_at: new Date().toISOString()
      })
      .eq('id', webhookId);

    // Retry processing
    if (source === 'MTN') {
      return this.processMTNWebhook(payload, undefined, secret);
    } else if (source === 'AIRTEL') {
      return this.processAirtelWebhook(payload, undefined, secret);
    }

    return {
      success: false,
      webhookId,
      processed: false,
      error: 'Unknown source'
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK RETRY SCHEDULER
// ═══════════════════════════════════════════════════════════════

export class WebhookRetryScheduler {
  constructor(
    private handler: WebhookHandler,
    private secrets: {
      mtn: string;
      airtel: string;
    }
  ) {}

  /**
   * Process failed webhooks (run periodically)
   */
  async processFailedWebhooks(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const failed = await this.handler.getFailedWebhooks();

    let succeeded = 0;
    let stillFailed = 0;

    for (const webhook of failed) {
      const secret = webhook.source === 'MTN' ? this.secrets.mtn : this.secrets.airtel;

      const result = await this.handler.retryWebhook(
        webhook.id,
        webhook.source,
        webhook.payload,
        secret
      );

      if (result.success) {
        succeeded++;
      } else {
        stillFailed++;
      }

      // Wait between retries to avoid overwhelming the system
      await this.sleep(1000);
    }

    return {
      processed: failed.length,
      succeeded,
      failed: stillFailed
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}