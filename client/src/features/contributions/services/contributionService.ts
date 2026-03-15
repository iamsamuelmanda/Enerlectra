import { supabase } from '../../../lib/supabase';
import { paymentService } from '../../../services/paymentService';
import type { Contribution, PaymentMethod } from '../../../types/contribution';

export const contributionService = {
  /**
   * Create a contribution – uses backend API for mobile money
   * Returns a placeholder Contribution object with the transaction reference.
   * The real contribution will appear via real‑time subscription when completed.
   */
  async createContribution(
    userId: string,
    clusterId: string,
    amount_usd: number,
    provider?: 'mtn' | 'airtel',
    phoneNumber?: string
  ): Promise<Contribution> {
    console.log('🚀 [contributionService] Creating contribution:', {
      userId,
      clusterId,
      amount_usd,
      provider,
      phoneNumber,
    });

    if (!provider || !phoneNumber) {
      throw new Error('Provider and phone number are required for mobile money payments');
    }

    const response = await paymentService.initiatePayment({
      userId,
      clusterId,
      amountUSD: amount_usd,
      phoneNumber,
      provider,
    });

    console.log('📦 [contributionService] Payment service response:', response);

    if (!response.success) {
      throw new Error(response.message || 'Payment initiation failed');
    }

    // We don't have the real contribution yet – return a placeholder.
    // The real contribution will appear in the list via Supabase subscription.
    const placeholderContribution: Contribution = {
      id: response.data?.transactionReference || `pending-${Date.now()}`,
      user_id: userId,
      cluster_id: clusterId,
      amount_usd,
      amount_zmw: amount_usd * 22.5, // approximate; real value will be set later
      exchange_rate: 22.5,
      pcus: amount_usd,
      status: 'PENDING',
      payment_method: 'MOBILE_MONEY' as PaymentMethod,
      projected_ownership_pct: 0,
      early_investor_bonus: 1.0,
      grace_period_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      completed_at: undefined,
      is_locked: false,
    };

    console.log('✅ [contributionService] Payment initiated, returning placeholder:', placeholderContribution);
    return placeholderContribution;
  },

  /**
   * Get all completed contributions for a specific cluster
   */
  async getContributionsByCluster(clusterId: string): Promise<Contribution[]> {
    console.log('🔍 [contributionService] Fetching contributions for cluster:', clusterId);

    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [contributionService] Error fetching cluster contributions:', error);
      throw error;
    }

    console.log(`✅ [contributionService] Found ${data?.length || 0} contributions`);
    return data as Contribution[];
  },

  /**
   * Get all completed contributions for a specific user (optionally with cluster details)
   */
  async getUserContributions(userId: string): Promise<Contribution[]> {
    console.log('🔍 [contributionService] Fetching contributions for user:', userId);

    const { data, error } = await supabase
      .from('contributions')
      .select(`
        *,
        clusters:cluster_id (
          name,
          location
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [contributionService] Error fetching user contributions:', error);
      throw error;
    }

    console.log(`✅ [contributionService] Found ${data?.length || 0} user contributions`);
    return data as Contribution[];
  },
};