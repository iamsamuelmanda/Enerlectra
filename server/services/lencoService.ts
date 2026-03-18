// server/services/lencoService.ts
import axios from 'axios';

const LENCO_BASE_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2/';
const LENCO_SECRET = process.env.LENCO_SECRET_KEY;

export async function initiateContributionPayment({
  clusterId,
  amountUsd,
  userId,
  provider,
  phoneNumber,
}: {
  clusterId: string;
  amountUsd: number;
  userId: string;
  provider: 'mtn' | 'airtel';
  phoneNumber: string;
}) {
  console.log('[LENCO SERVICE] Initiating payment:', {
    clusterId,
    amountUsd,
    provider,
    phoneNumber,
  });

  if (!LENCO_SECRET) {
    throw new Error('LENCO_SECRET_KEY is missing in Render environment variables');
  }

  // FIXED: Correct production endpoint path
  const fullUrl = `${LENCO_BASE_URL.endsWith('/') ? LENCO_BASE_URL : LENCO_BASE_URL + '/'}payments`;
  console.log('[LENCO] Calling exact URL:', fullUrl);

  const payload = {
    amount: Math.round(amountUsd * 27.5),
    currency: 'ZMW',
    provider: provider.toUpperCase(),
    phone_number: phoneNumber.replace('+260', ''),
    reference: `enerlectra-${Date.now()}`,
    customer_email: 'user@enerlectra.com',
    metadata: { clusterId, userId },
  };

  try {
    const res = await axios.post(fullUrl, payload, {
      headers: {
        Authorization: `Bearer ${LENCO_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[LENCO] SUCCESS response:', res.data);

    return {
      reference: res.data.transaction_id || `pending-${Date.now()}`,
      message: 'Payment request sent! Check your phone for the prompt.',
    };
  } catch (error: any) {
    console.error('[LENCO FULL ERROR]', {
      status: error.response?.status,
      data: error.response?.data,
      url: fullUrl,
      message: error.message,
    });

    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      'Lenco API error - check Render logs for details'
    );
  }
}