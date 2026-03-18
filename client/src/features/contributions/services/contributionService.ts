// client/src/features/contributions/services/contributionService.ts
import axios from 'axios';

const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

/**
 * Safe frontend wrapper – calls backend API only
 */
export async function initiateContributionPayment({
  clusterId,
  amountUsd,
  provider,
  phoneNumber,
}: {
  clusterId: string;
  amountUsd: number;
  provider: 'mtn' | 'airtel';
  phoneNumber: string;
}) {
  console.log('🚀 Sending payment request to backend:', {
    clusterId,
    amountUsd,
    provider,
    phoneNumber,
  });

  try {
    const response = await axios.post(`${BACKEND_URL}/api/payments/initiate`, {
      clusterId,
      amountUsd,
      provider,
      phoneNumber: `+260${phoneNumber}`,
    });

    console.log('✅ Backend response:', response.data);

    return {
      reference: response.data.reference || `pending-${Date.now()}`,
      message: response.data.message || 'Payment request sent! Check your phone.',
    };
  } catch (error: any) {
    console.error('❌ Payment initiation failed:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.error || 
      error.response?.data?.message || 
      'Payment failed. Please try again.'
    );
  }
}