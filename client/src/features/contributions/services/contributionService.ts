// client/src/features/contributions/services/contributionService.ts
import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { Contribution } from '@/types/contribution';

const BACKEND_URL = 'https://enerlectra-backend.onrender.com';

export const contributionService = {
  /**
   * Initiate real Lenco payment (calls backend)
   */
  async initiatePayment({
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
    console.log('🚀 [Frontend] Sending payment request:', {
      clusterId,
      amountUsd,
      provider,
      phoneNumber: `+260${phoneNumber}`,
    });

    try {
      const response = await axios.post(`${BACKEND_URL}/api/payments/initiate`, {
        clusterId,
        amountUsd,
        provider,
        phoneNumber: `+260${phoneNumber}`,
      });

      console.log('✅ Backend response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Payment failed:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        'Payment initiation failed'
      );
    }
  },

  /**
   * Get contributions for ContributionHistory
   */
  async getContributionsByCluster(clusterId: string): Promise<Contribution[]> {
    console.log('🔍 [Frontend] Fetching contributions for cluster:', clusterId);

    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log(`✅ Found ${data?.length || 0} contributions`);
    return data || [];
  },
};

/** Legacy export – keeps everything working */
export async function initiateContributionPayment(params: any) {
  return contributionService.initiatePayment(params);
}