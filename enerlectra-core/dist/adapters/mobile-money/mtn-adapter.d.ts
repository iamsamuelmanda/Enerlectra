/**
 * MTN Mobile Money Adapter
 * Zambia MTN MoMo API integration
 * Supports both sandbox and production environments
 */
import { Ngwee } from '../../domain/settlement/settlement-types';
export interface MTNConfig {
    environment: 'sandbox' | 'production';
    apiKey: string;
    apiSecret: string;
    subscriptionKey: string;
    callbackUrl: string;
    targetEnvironment: string;
}
export interface MTNCollectionRequest {
    amount: string;
    currency: 'ZMW';
    externalId: string;
    payer: {
        partyIdType: 'MSISDN';
        partyId: string;
    };
    payerMessage: string;
    payeeNote: string;
}
export interface MTNCollectionResponse {
    referenceId: string;
    status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
    amount: string;
    currency: string;
    externalId: string;
    payer: {
        partyIdType: string;
        partyId: string;
    };
    reason?: {
        code: string;
        message: string;
    };
}
export interface MTNDisbursementRequest {
    amount: string;
    currency: 'ZMW';
    externalId: string;
    payee: {
        partyIdType: 'MSISDN';
        partyId: string;
    };
    payerMessage: string;
    payeeNote: string;
}
export declare class MTNMobileMoneyAdapter {
    private client;
    private config;
    private accessToken?;
    private tokenExpiresAt?;
    constructor(config: MTNConfig);
    /**
     * Get OAuth access token
     * Tokens expire after some time, so we cache and refresh
     */
    private getAccessToken;
    /**
     * Request payment from customer (Request to Pay)
     */
    requestPayment(phoneNumber: string, amountNgwee: Ngwee, externalId: string, payerMessage?: string, payeeNote?: string): Promise<{
        referenceId: string;
        status: 'PENDING' | 'INITIATED';
    }>;
    /**
     * Check payment status
     */
    getPaymentStatus(referenceId: string): Promise<MTNCollectionResponse>;
    /**
     * Poll payment status until completed or timeout
     */
    waitForPaymentConfirmation(referenceId: string, timeoutSeconds?: number, // 5 minutes
    pollIntervalSeconds?: number): Promise<MTNCollectionResponse>;
    /**
     * Send payout to contributor
     */
    sendPayout(phoneNumber: string, amountNgwee: Ngwee, externalId: string, payerMessage?: string, payeeNote?: string): Promise<{
        referenceId: string;
        status: 'PENDING' | 'INITIATED';
    }>;
    /**
     * Check payout status
     */
    getPayoutStatus(referenceId: string): Promise<MTNCollectionResponse>;
    /**
     * Get account balance (for treasury reconciliation)
     */
    getBalance(): Promise<{
        availableBalance: string;
        currency: string;
    }>;
    /**
     * Format phone number for MTN API
     * Expects: 260971234567 (country code + number)
     */
    private formatPhoneNumber;
    private sleep;
    /**
     * In sandbox, simulate instant payment confirmation
     */
    simulateSandboxPayment(referenceId: string): Promise<void>;
}
export declare function createMTNAdapter(config: MTNConfig): MTNMobileMoneyAdapter;
export declare function getMTNConfigFromEnv(): MTNConfig;
