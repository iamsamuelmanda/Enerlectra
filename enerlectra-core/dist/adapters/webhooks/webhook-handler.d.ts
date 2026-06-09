import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../domain/payment/payment-orchestrator';
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
export declare class WebhookSignatureVerifier {
    static verify(payload: string, signature: string, secret: string, algorithm: 'sha256' | 'sha512', output?: 'hex' | 'base64'): boolean;
    static verifyMTNSignature(payload: string, signature: string, secret: string): boolean;
    static verifyAirtelSignature(payload: string, signature: string, secret: string): boolean;
    static verifyLencoSignature(payload: string, signature: string, secret: string): boolean;
    static safeEqual(a: string, b: string): boolean;
}
export declare class WebhookHandler {
    private supabase;
    private orchestrator;
    constructor(supabase: SupabaseClient, orchestrator: PaymentOrchestrator);
    processMTNWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    processAirtelWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    processLencoWebhook(payload: string | Buffer, signature: string | undefined, secret: string): Promise<WebhookProcessingResult>;
    private processProviderWebhook;
    private parsePayload;
    private resolveEventType;
    private resolveKind;
    private resolveReference;
    private resolveWebhookId;
    private resolveTimestamp;
    private isFresh;
    private logWebhook;
    private updateWebhookStatus;
    private normalizeContributionStatus;
    private normalizePayoutStatus;
    private handleContributionWebhook;
    private handlePayoutWebhook;
    private mapProviderToRail;
}
