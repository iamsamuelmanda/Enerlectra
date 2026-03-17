// src/features/contributions/services/contributionService.ts
import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { Contribution, PaymentMethod } from '@/types/contribution';

const LENCO_BASE_URL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v2/';
const LENCO_SECRET = process.env.LENCO_SECRET_KEY;

export const contributionService = {
  async createContribution(
    userId: string,
    clusterId: string,
    amountUsd: number,
    provider: 'mtn' | 'airtel',
    phoneNumber: string
  ): Promise<Contribution> {
    console.log('🚀 Creating Lenco payment:', {
      userId,
      clusterId,
      amountUsd,
      provider: provider.toUpperCase(),
      phoneNumber,
    });

    if (!LENCO_SECRET) throw new Error('Missing LENCO_SECRET_KEY in .env');
    if (!amountUsd || amountUsd <= 0) throw new Error('Amount must be greater than 0');

    try {
      const res = await axios.post(
        `${LENCO_BASE_URL}/payments`,
        {
          amount: Math.round(amountUsd * 25), // USD → ZMW conversion (adjust later)
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
          timeout: 30000,
        }
      );

      const data = res.data;

      if (!data.success && data.status !== 'pending') {
        throw new Error(data.message || 'Lenco initiation failed');
      }

      const placeholder: Contribution = {
        id: data.transaction_id || `pending-${Date.now()}`,
        user_id: userId,
        cluster_id: clusterId,
        amount_usd: amountUsd,
        amount_zmw: data.amount || amountUsd * 25,
        exchange_rate: 25,
        pcus: amountUsd,
        status: 'PENDING',
        payment_method: 'MOBILE_MONEY' as PaymentMethod,
        projected_ownership_pct: 0,
        early_investor_bonus: 1.0,
        grace_period_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        completed_at: undefined,
        is_locked: false,
        transaction_reference: data.transaction_id,
      };

      console.log('✅ Lenco payment initiated:', data);
      return placeholder;
    } catch (err: any) {
      console.error('Lenco error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Payment failed');
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
  const contribution = await contributionService.createContribution(
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