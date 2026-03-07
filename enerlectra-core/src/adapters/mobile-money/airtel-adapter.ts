/**
 * Airtel Money Adapter
 * Zambia Airtel Money API integration
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Ngwee, ngwee } from '../../domain/settlement/settlement-types';

// ═══════════════════════════════════════════════════════════════
// AIRTEL API CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface AirtelConfig {
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
  apiKey: string;
  callbackUrl: string;
  country: string; // 'ZM' for Zambia
}

export interface AirtelCollectionRequest {
  reference: string; // Your reference ID
  subscriber: {
    country: string;
    currency: string;
    msisdn: string; // Phone number
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
    code: string; // '200' = success
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
  pin: string; // Merchant PIN
  transaction: {
    amount: number;
    id: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// AIRTEL ADAPTER
// ═══════════════════════════════════════════════════════════════

export class AirtelMoneyAdapter {
  private client: AxiosInstance;
  private config: AirtelConfig;
  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: AirtelConfig) {
    this.config = config;
    
    const baseURL = config.environment === 'sandbox'
      ? 'https://openapiuat.airtel.africa'
      : 'https://openapi.airtel.africa';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'X-Country': config.country,
        'X-Currency': 'ZMW'
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    try {
      const response = await this.client.post(
        '/auth/oauth2/token',
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials'
        }
      );

      this.accessToken = response.data.access_token;
      
      // Tokens expire in ~3600 seconds (1 hour)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000); // 5 min buffer

      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Airtel authentication failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COLLECTION (Receive payment from customer)
  // ═══════════════════════════════════════════════════════════

  /**
   * Request payment from customer
   */
  async requestPayment(
    phoneNumber: string,
    amountNgwee: Ngwee,
    externalId: string
  ): Promise<{
    transactionId: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
  }> {
    try {
      const token = await this.getAccessToken();
      const transactionId = uuidv4();

      const amount = Number(amountNgwee) / 100; // Convert to ZMW

      const request: AirtelCollectionRequest = {
        reference: externalId,
        subscriber: {
          country: this.config.country,
          currency: 'ZMW',
          msisdn: this.formatPhoneNumber(phoneNumber)
        },
        transaction: {
          amount,
          country: this.config.country,
          currency: 'ZMW',
          id: transactionId
        }
      };

      const response = await this.client.post(
        '/merchant/v1/payments/',
        request,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Callback-Url': this.config.callbackUrl
          }
        }
      );

      const result = response.data as AirtelCollectionResponse;

      return {
        transactionId: result.data.transaction.id,
        status: result.data.transaction.status
      };
    } catch (error: any) {
      throw new Error(`Airtel request payment failed: ${error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(transactionId: string): Promise<{
    status: 'SUCCESS' | 'PENDING' | 'FAILED';
    message: string;
  }> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        `/standard/v1/payments/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      return {
        status: result.data.transaction.status,
        message: result.status.message
      };
    } catch (error: any) {
      throw new Error(`Airtel get payment status failed: ${error.message}`);
    }
  }

  /**
   * Poll payment status until completed
   */
  async waitForPaymentConfirmation(
    transactionId: string,
    timeoutSeconds: number = 300,
    pollIntervalSeconds: number = 5
  ): Promise<{ status: 'SUCCESS' | 'FAILED'; message: string }> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getPaymentStatus(transactionId);

      if (status.status === 'SUCCESS' || status.status === 'FAILED') {
        return status;
      }

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
    merchantPin: string
  ): Promise<{
    transactionId: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
  }> {
    try {
      const token = await this.getAccessToken();
      const transactionId = uuidv4();

      const amount = Number(amountNgwee) / 100;

      const request: AirtelDisbursementRequest = {
        payee: {
          msisdn: this.formatPhoneNumber(phoneNumber)
        },
        reference: externalId,
        pin: merchantPin,
        transaction: {
          amount,
          id: transactionId
        }
      };

      const response = await this.client.post(
        '/standard/v1/disbursements/',
        request,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      return {
        transactionId: result.data.transaction.id,
        status: result.status.success ? 'SUCCESS' : 'PENDING'
      };
    } catch (error: any) {
      throw new Error(`Airtel send payout failed: ${error.message}`);
    }
  }

  /**
   * Check payout status
   */
  async getPayoutStatus(transactionId: string): Promise<{
    status: 'SUCCESS' | 'PENDING' | 'FAILED';
    message: string;
  }> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        `/standard/v1/disbursements/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      return {
        status: result.data.transaction.status,
        message: result.status.message
      };
    } catch (error: any) {
      throw new Error(`Airtel get payout status failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BALANCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Get account balance
   */
  async getBalance(): Promise<{
    balance: string;
    currency: string;
  }> {
    try {
      const token = await this.getAccessToken();

      const response = await this.client.get(
        '/standard/v1/users/balance',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return {
        balance: response.data.data.balance,
        currency: response.data.data.currency
      };
    } catch (error: any) {
      throw new Error(`Airtel get balance failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Format phone number for Airtel API
   * Expects: 260971234567
   */
  private formatPhoneNumber(phone: string): string {
    let formatted = phone.replace(/[\s\-\+]/g, '');

    if (!formatted.startsWith('260')) {
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
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

export function createAirtelAdapter(config: AirtelConfig): AirtelMoneyAdapter {
  return new AirtelMoneyAdapter(config);
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM ENVIRONMENT
// ═══════════════════════════════════════════════════════════════

export function getAirtelConfigFromEnv(): AirtelConfig {
  return {
    environment: (process.env.AIRTEL_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    clientId: process.env.AIRTEL_CLIENT_ID || '',
    clientSecret: process.env.AIRTEL_CLIENT_SECRET || '',
    apiKey: process.env.AIRTEL_API_KEY || '',
    callbackUrl: process.env.AIRTEL_CALLBACK_URL || 'https://enerlectra.com/webhooks/airtel',
    country: process.env.AIRTEL_COUNTRY || 'ZM'
  };
}