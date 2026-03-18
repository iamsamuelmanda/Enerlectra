// client/src/features/contributions/services/contributionService.ts
import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { Contribution } from '@/types/contribution';

const BACKEND_URL = 'https://enerlectra-backend.onrender.com';
const LENCO_PUBLIC_KEY ='1187e2020c8d8657438033d87387af85bf4259d72f89c58d'; // ← Your production public key from dashboard

export const contributionService = {
  /**
   * Open Lenco payment popup widget (client-side only - safe, no secret key here)
   */
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
      console.error('LencoPay script not loaded - make sure <script src="https://pay.lenco.co/js/v1/inline.js"> is included');
      throw new Error('LencoPay widget not available');
    }

    const reference = `enerlectra-${clusterId}-${Date.now()}`;

    window.LencoPay.getPaid({
      key: LENCO_PUBLIC_KEY,
      reference,
      email: 'user@enerlectra.com',
      amount: amountUsd, // Lenco accepts decimal ZMW directly (10.00)
      currency: 'ZMW',
      channels: ['mobile-money'],
      label: `Contribution to Enerlectra Cluster`,
      customer: {
        firstName: 'Enerlectra',
        lastName: 'User',
        phone: phoneNumber.replace('+260', ''),
      },
      bearer: 'merchant', // You (merchant) pay the fee - already set in dashboard
      onSuccess: (response) => {
        console.log('[LENCO WIDGET] onSuccess:', response);
        // Immediately verify on backend
        axios
          .post(`${BACKEND_URL}/api/payments/verify`, { reference: response.reference })
          .then((res) => {
            console.log('[VERIFY] Backend confirmed:', res.data);
            onSuccess?.(response.reference);
          })
          .catch((err) => {
            console.error('[VERIFY ERROR]', err);
            toast.error('Payment verification failed - contact support');
          });
      },
      onClose: () => {
        console.log('[LENCO WIDGET] onClose');
        onClose?.();
      },
      onConfirmationPending: () => {
        console.log('[LENCO WIDGET] onConfirmationPending');
        toast('Payment pending confirmation - check your phone');
      },
    });
  },

  /**
   * Fetch completed contributions (used by ContributionHistory)
   */
  async getContributionsByCluster(clusterId: string): Promise<Contribution[]> {
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch contributions:', error);
      throw error;
    }
    return data || [];
  },
};

/** Legacy export for backward compatibility */
export async function initiateContributionPayment(params: any) {
  return contributionService.initiatePayment(params);
}