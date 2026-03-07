/**
 * MTN Mobile Money Adapter
 * Zambia MTN MoMo API integration
 * Supports both sandbox and production environments
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Ngwee, ngwee } from '../../domain/settlement/settlement-types';
import { PaymentRail } from '../../domain/treasury/treasury-types';

// ═══════════════════════════════════════════════════════════════
// MTN API CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface MTNConfig {
  environment: 'sandbox' | 'production';
  apiKey: string;
  apiSecret: string;
  subscriptionKey: string;
  callbackUrl: string;
  targetEnvironment: string; // 'mtnzambia' for production
}

export interface MTNCollectionRequest {
  amount: string; // ZMW amount as string
  currency: 'ZMW';
  externalId: string; // Your reference ID
  payer: {
    partyIdType: 'MSISDN'; // Phone number
    partyId: string; // e.g., '260971234567'
  };
  payerMessage: string;
  payeeNote: string;
}

export interface MTNCollectionResponse {
  referenceId: string; // MTN transaction reference
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

// ═══════════════════════════════════════════════════════════════
// MTN ADAPTER
// ═══════════════════════════════════════════════════════════════

export class MTNMobileMoneyAdapter {
  private client: AxiosInstance;
  private config: MTNConfig;
  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: MTNConfig) {
    this.config = config;
    
    const baseURL = config.environment === 'sandbox'
      ? 'https://sandbox.momodeveloper.mtn.com'
      : 'https://proxy.momoapi.mtn.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'Ocp-Apim-Subscription-Key': config.subscriptionKey,
        'X-Target-Environment': config.targetEnvironment
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Get OAuth access token
   * Tokens expire after some time, so we cache and refresh
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.apiKey}:${this.config.apiSecret}`
      ).toString('base64');

      const response = await this.client.post(
        '/collection/token/',
        {},
        {
          headers: {
            'Authorization': `Basic ${credentials}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      
      // Tokens typically expire in 1 hour
      this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 min buffer

      return this.accessToken;
    } catch (error: any) {
      throw new Error(`MTN authentication failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COLLECTION (Receive payment from customer)
  // ═══════════════════════════════════════════════════════════

  /**
   * Request payment from customer (Request to Pay)
   */
  async requestPayment(
    phoneNumber: string,
    amountNgwee: Ngwee,
    externalId: string,
    payerMessage: string = 'Enerlectra Payment',
    payeeNote: string = 'Energy purchase'
  ): Promise<{
    referenceId: string;
    status: 'PENDING' | 'INITIATED';
  }> {
    try {
      const token = await this.getAccessToken();
      const referenceId = uuidv4();

      const amount = (Number(amountNgwee) / 100).toFixed(2); // Convert ngwee to ZMW

      const request: MTNCollectionRequest = {
        amount,
        currency: 'ZMW',
        externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: this.formatPhoneNumber(phoneNumber)
        },
        payerMessage,
        payeeNote
      };

      await this.client.post(
        '/collection/v1_0/requesttopay',
        request,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Reference-Id': referenceId,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        referenceId,
        status: 'PENDING'
      };
    } catch (error: any) {
      throw new Error(`MTN request payment failed: ${error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(referenceId: string): Promise<MTNCollectionResponse> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        `/collection/v1_0/requesttopay/${referenceId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`MTN get payment status failed: ${error.message}`);
    }
  }

  /**
   * Poll payment status until completed or timeout
   */
  async waitForPaymentConfirmation(
    referenceId: string,
    timeoutSeconds: number = 300, // 5 minutes
    pollIntervalSeconds: number = 5
  ): Promise<MTNCollectionResponse> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getPaymentStatus(referenceId);

      if (status.status === 'SUCCESSFUL' || status.status === 'FAILED') {
        return status;
      }

      // Wait before polling again
      await this.sleep(pollIntervalSeconds * 1000);
    }

    throw new Error(`Payment confirmation timeout after ${timeoutSeconds} seconds`);
  }

  // ═══════════════════════════════════════════════════════════
  // DISBURSEMENT (Send payment to contributor)
  // ═══════════════════════════════════════════════════════════

  /**
   * Send payout to contributor
   */
  async sendPayout(
    phoneNumber: string,
    amountNgwee: Ngwee,
    externalId: string,
    payerMessage: string = 'Enerlectra Payout',
    payeeNote: string = 'Energy contributor payment'
  ): Promise<{
    referenceId: string;
    status: 'PENDING' | 'INITIATED';
  }> {
    try {
      const token = await this.getAccessToken();
      const referenceId = uuidv4();

      const amount = (Number(amountNgwee) / 100).toFixed(2);

      const request: MTNDisbursementRequest = {
        amount,
        currency: 'ZMW',
        externalId,
        payee: {
          partyIdType: 'MSISDN',
          partyId: this.formatPhoneNumber(phoneNumber)
        },
        payerMessage,
        payeeNote
      };

      await this.client.post(
        '/disbursement/v1_0/transfer',
        request,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Reference-Id': referenceId,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        referenceId,
        status: 'PENDING'
      };
    } catch (error: any) {
      throw new Error(`MTN send payout failed: ${error.message}`);
    }
  }

  /**
   * Check payout status
   */
  async getPayoutStatus(referenceId: string): Promise<MTNCollectionResponse> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        `/disbursement/v1_0/transfer/${referenceId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`MTN get payout status failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BALANCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Get account balance (for treasury reconciliation)
   */
  async getBalance(): Promise<{
    availableBalance: string;
    currency: string;
  }> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        '/collection/v1_0/account/balance',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`MTN get balance failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Format phone number for MTN API
   * Expects: 260971234567 (country code + number)
   */
  private formatPhoneNumber(phone: string): string {
    // Remove any spaces, dashes, or plus signs
    let formatted = phone.replace(/[\s\-\+]/g, '');

    // If doesn't start with 260, add it
    if (!formatted.startsWith('260')) {
      // Remove leading 0 if present
      if (formatted.startsWith('0')) {
        formatted = formatted.substring(1);
      }
      formatted = '260' + formatted;
    }

    return formatted;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════
  // SANDBOX MODE HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * In sandbox, simulate instant payment confirmation
   */
  async simulateSandboxPayment(referenceId: string): Promise<void> {
    if (this.config.environment !== 'sandbox') {
      throw new Error('Can only simulate payments in sandbox mode');
    }

    // In real sandbox, you'd call MTN's sandbox approval endpoint
    // For now, we just document this
    console.log(`[SANDBOX] Simulating payment approval for ${referenceId}`);
    console.log('[SANDBOX] In production, user would approve on phone');
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

export function createMTNAdapter(config: MTNConfig): MTNMobileMoneyAdapter {
  return new MTNMobileMoneyAdapter(config);
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM ENVIRONMENT
// ═══════════════════════════════════════════════════════════════

export function getMTNConfigFromEnv(): MTNConfig {
  return {
    environment: (process.env.MTN_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    apiKey: process.env.MTN_API_KEY || '',
    apiSecret: process.env.MTN_API_SECRET || '',
    subscriptionKey: process.env.MTN_SUBSCRIPTION_KEY || '',
    callbackUrl: process.env.MTN_CALLBACK_URL || 'https://enerlectra.com/webhooks/mtn',
    targetEnvironment: process.env.MTN_TARGET_ENVIRONMENT || 'sandbox'
  };
}