import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { Contribution } from '@/types/contribution';

const BACKEND_URL = 'https://enerlectra-backend.onrender.com';
const LENCO_PUBLIC_KEY = 'pub-1187e2020c8d8657438033d87387af85bf4259d72f89c58d';

export const contributionService = {
  initiatePayment({
    clusterId,
    amountUsd,
    provider,
    phoneNumber,
    userId,
    onSuccess,
    onClose,
  }: {
    clusterId: string;
    amountUsd: number;
    provider: 'mtn' | 'airtel';
    phoneNumber: string;
    userId: string;
    onSuccess?: (reference: string) => void;
    onClose?: () => void;
  }) {
    if (!window.LencoPay) {
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
      label: 'Contribution to Cluster',
      customer: {
        firstName: 'User',
        lastName: 'Enerlectra',
        phone: phoneNumber.replace('+260', ''),
      },
      bearer: 'merchant',
      onSuccess: async (response: any) => {
        console.log('[LENCO] onSuccess:', response);
        try {
          // 1. Verify payment with backend
          await axios.post(`${BACKEND_URL}/api/payments/verify`, {
            reference: response.reference,
          });

          // 2. Record ownership — this is the bridge that closes the loop
          const { error: rpcError } = await supabase.rpc('increment_cluster_funding', {
            row_id: clusterId,
            inc_amount: amountUsd,
            user_uuid: userId,
          });

          if (rpcError) {
            console.error('[OWNERSHIP] Failed to record stake:', rpcError);
          } else {
            console.log('[OWNERSHIP] Stake recorded successfully');
          }

          onSuccess?.(response.reference);
        } catch (err) {
          console.error('[PAYMENT] Verification failed:', err);
          onSuccess?.(response.reference);
        }
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
