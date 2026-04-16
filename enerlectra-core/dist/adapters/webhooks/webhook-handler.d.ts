/**
 * Webhook Handler
 * Secure webhook processing with signature verification
 * Handles MTN, Airtel, and Lenco/Broadpay callbacks
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../domain/payment/payment-orchestrator';
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
export declare class WebhookSignatureVerifier {
    /**
     * Verify MTN webhook signature
     */
    static verifyMTNSignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Verify Airtel webhook signature
     */
    static verifyAirtelSignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Verify Lenco webhook signature
     */
    static verifyLencoSignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Timing-safe string comparison
     */
    private static timingSafeEqual;
}
export declare class WebhookHandler {
    private supabase;
    private orchestrator;
    constructor(supabase: SupabaseClient, orchestrator: PaymentOrchestrator);
    processMTNWebhook(payload: string, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    processAirtelWebhook(payload: string, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    processLencoWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    private logWebhook;
    /**
     * Update webhook processing status
     */
    private updateWebhookStatus;
    getFailedWebhooks(maxRetries?: number): Promise<Array<{
        id: string;
        source: string;
        payload: string;
        retry_count: number;
    }>>;
    retryWebhook(webhookId: string, source: string, payload: string, secret: string): Promise<WebhookProcessingResult>;
}
export declare class WebhookRetryScheduler {
    private handler;
    private secrets;
    constructor(handler: WebhookHandler, secrets: {
        mtn: string;
        airtel: string;
        lenco: string;
    });
    processFailedWebhooks(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
    }>;
    private sleep;
}
