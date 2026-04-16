/**
 * Airtel Money Adapter
 * Zambia Airtel Money API integration
 */
import { Ngwee } from '../../domain/settlement/settlement-types';
export interface AirtelConfig {
    environment: 'sandbox' | 'production';
    clientId: string;
    clientSecret: string;
    apiKey: string;
    callbackUrl: string;
    country: string;
}
export interface AirtelCollectionRequest {
    reference: string;
    subscriber: {
        country: string;
        currency: string;
        msisdn: string;
    };
    transaction: {
        amount: number;
        country: string;
        currency: string;
        id: string;
    };
}
export interface AirtelCollectionResponse {
    status: {
        code: string;
        message: string;
        result_code: string;
        response_code: string;
        success: boolean;
    };
    data: {
        transaction: {
            id: string;
            status: 'SUCCESS' | 'PENDING' | 'FAILED';
        };
    };
}
export interface AirtelDisbursementRequest {
    payee: {
        msisdn: string;
    };
    reference: string;
    pin: string;
    transaction: {
        amount: number;
        id: string;
    };
}
export declare class AirtelMoneyAdapter {
    private client;
    private config;
    private accessToken?;
    private tokenExpiresAt?;
    constructor(config: AirtelConfig);
    /**
     * Get OAuth access token
     */
    private getAccessToken;
    /**
     * Request payment from customer
     */
    requestPayment(phoneNumber: string, amountNgwee: Ngwee, externalId: string): Promise<{
        transactionId: string;
        status: 'PENDING' | 'SUCCESS' | 'FAILED';
    }>;
    /**
     * Check payment status
     */
    getPaymentStatus(transactionId: string): Promise<{
        status: 'SUCCESS' | 'PENDING' | 'FAILED';
        message: string;
    }>;
    /**
     * Poll payment status until completed
     */
    waitForPaymentConfirmation(transactionId: string, timeoutSeconds?: number, pollIntervalSeconds?: number): Promise<{
        status: 'SUCCESS' | 'FAILED';
        message: string;
    }>;
    /**
     * Send payout to contributor
     */
    sendPayout(phoneNumber: string, amountNgwee: Ngwee, externalId: string, merchantPin: string): Promise<{
        transactionId: string;
        status: 'PENDING' | 'SUCCESS' | 'FAILED';
    }>;
    /**
     * Check payout status
     */
    getPayoutStatus(transactionId: string): Promise<{
        status: 'SUCCESS' | 'PENDING' | 'FAILED';
        message: string;
    }>;
    /**
     * Get account balance
     */
    getBalance(): Promise<{
        balance: string;
        currency: string;
    }>;
    /**
     * Format phone number for Airtel API
     * Expects: 260971234567
     */
    private formatPhoneNumber;
    private sleep;
}
export declare function createAirtelAdapter(config: AirtelConfig): AirtelMoneyAdapter;
export declare function getAirtelConfigFromEnv(): AirtelConfig;
