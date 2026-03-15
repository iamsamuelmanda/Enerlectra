const API_BASE = '/api';

export interface InitiatePaymentRequest {
  userId: string;
  clusterId: string;
  amountUSD: number;
  phoneNumber: string;
  provider: 'mtn' | 'airtel';
}

export interface InitiatePaymentResponse {
  success: boolean;
  data?: {
    contributionId?: string;
    transactionReference?: string;
    status?: 'PENDING' | 'COMPLETED' | 'FAILED';
    contribution?: any; // In case backend returns full contribution
  };
  message?: string;
}

export const paymentService = {
  async initiatePayment(request: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
    console.log('🚀 [paymentService] Request:', request);

    const response = await fetch(`${API_BASE}/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ [paymentService] HTTP error:', error);
      throw new Error(`Payment initiation failed: ${error}`);
    }

    const json = await response.json();
    console.log('✅ [paymentService] Raw response:', json);

    // The response might be the contribution object directly, or nested under data
    const data = json.data || json;

    // Try to extract a contribution ID from various possible locations
    const contributionId = data.id || data.contributionId || data.transactionId;
    const transactionReference = data.transactionReference || data.transactionId || data.id;
    const status = data.status || 'PENDING';

    // If the response contains the full contribution (e.g., data includes all fields), pass it through
    const contribution = data.id ? data : undefined;

    return {
      success: json.success !== false,
      data: {
        contributionId,
        transactionReference,
        status,
        contribution,
      },
      message: json.message,
    };
  },

  async getPaymentStatus(transactionReference: string): Promise<any> {
    const response = await fetch(`${API_BASE}/payments/status/${transactionReference}`);
    if (!response.ok) throw new Error('Failed to fetch payment status');
    return response.json();
  },
};