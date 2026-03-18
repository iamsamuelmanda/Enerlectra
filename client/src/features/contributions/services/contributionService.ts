// client/src/features/contributions/services/contributionService.ts
import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { Contribution } from '@/types/contribution';

const BACKEND_URL = 'https://enerlectra-backend.onrender.com';
const LENCO_PUBLIC_KEY = 'pub-1187e2020c8d8657438033d87387af85bf4259d72f89c58d'; // ← Your live public key

export const contributionService = {
  initiatePayment({
    clusterId,
    amountUsd,
    provider,
    phoneNumber,
    onSuccess,
    onClose,
  }: {
    clusterId: string;
    amountUsd: number;
    provider: 'mtn' | 'airtel';
    phoneNumber: string;
    onSuccess?: (reference: string) => void;
    onClose?: () => void;
  }) {
    if (!window.LencoPay) {
      console.error('LencoPay not loaded');
      throw new Error('Lenco widget not available');
    }

    const reference = `enerlectra-${clusterId}-${Date.now()}`;

    window.LencoPay.getPaid({
      key: LENCO_PUBLIC_KEY,
      reference,
      email: 'user@enerlectra.com',
      amount: amountUsd,
      currency: 'ZMW',
      channels: ['mobile-money'],
      label: `Contribution to Cluster`,
      customer: {
        firstName: 'User',
        lastName: 'Enerlectra',
        phone: phoneNumber.replace('+260', ''),
      },
      bearer: 'merchant',
      onSuccess: (response) => {
        console.log('[LENCO] onSuccess:', response);
        axios.post(`${BACKEND_URL}/api/payments/verify`, { reference: response.reference })
          .then(() => onSuccess?.(response.reference))
          .catch(console.error);
      },
      onClose: () => {
        console.log('[LENCO] onClose');
        onClose?.();
      },
    });
  },

  async getContributionsByCluster(clusterId: string): Promise<Contribution[]> {
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

export async function initiateContributionPayment(params: any) {
  return contributionService.initiatePayment(params);
}