// server/services/lencoService.ts
import axios from 'axios';

const LENCO_BASE_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2/';
const LENCO_SECRET = process.env.LENCO_SECRET_KEY;

export const lencoService = {
  async createContribution(
    userId: string,
    clusterId: string,
    amountUsd: number,
    provider: 'mtn' | 'airtel',
    phoneNumber: string
  ) {
    console.log('🚀 [Lenco] Creating payment:', { userId, clusterId, amountUsd, provider, phoneNumber });

    if (!LENCO_SECRET) throw new Error('Missing LENCO_SECRET_KEY in .env');
    if (!amountUsd || amountUsd <= 0) throw new Error('Amount must be greater than 0');

    try {
      const res = await axios.post(
        `${LENCO_BASE_URL}/payments`,
        {
          amount: Math.round(amountUsd * 25),
          currency: 'ZMW',
          provider: provider.toUpperCase(),
          phone_number: phoneNumber.replace('+260', ''),
          reference: `enerlectra-${Date.now()}`,
          customer_email: 'user@enerlectra.com',
          metadata: { clusterId, userId },
        },
        {
          headers: {
            Authorization: `Bearer ${LENCO_SECRET}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = res.data;

      return {
        id: data.transaction_id || `pending-${Date.now()}`,
        user_id: userId,
        cluster_id: clusterId,
        amount_usd: amountUsd,
        amount_zmw: data.amount || amountUsd * 25,
        exchange_rate: 25,
        pcus: amountUsd,
        status: 'PENDING',
        payment_method: 'MOBILE_MONEY',
        transaction_reference: data.transaction_id,
      };
    } catch (err: any) {
      console.error('Lenco error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Payment initiation failed');
    }
  },
};

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
  const contribution = await lencoService.createContribution(
    userId,
    clusterId,
    amountUsd,
    provider,
    phoneNumber
  );

  return {
    reference: contribution.id,
    message: 'Payment request sent! Check your phone for the prompt.',
  };
}