import { supabase } from '../lib/supabase';

export type DbContribution = {
  id: string;
  cluster_id: string;
  user_id: string;
  amount_usd: number;
  amount_zmw: number;
  exchange_rate: number;
  pcus: number;
  status: string;
  payment_method: string;
  projected_ownership_pct: number;
  created_at: string;
};

export async function insertContribution(input: {
  user_id: string;
  cluster_id: string;
  amount_usd: number;
  amount_zmw: number;
  exchange_rate: number;
  pcus: number;
  status: string;
  payment_method: string;
  projected_ownership_pct: number;
  grace_period_expires_at: string;
}): Promise<DbContribution> {
  const { data, error } = await supabase
    .from('contributions')
    .insert({
      user_id: input.user_id,
      cluster_id: input.cluster_id,
      amount_usd: input.amount_usd,
      amount_zmw: input.amount_zmw,
      exchange_rate: input.exchange_rate,
      pcus: input.pcus,
      status: input.status,
      payment_method: input.payment_method,
      projected_ownership_pct: input.projected_ownership_pct,
      grace_period_expires_at: input.grace_period_expires_at,
    })
    .select()
    .single();

  if (error) {
    console.error('insertContribution error', error);
    throw error;
  }

  return data as DbContribution;
}

export async function getContributionsForCluster(
  clusterId: string,
): Promise<DbContribution[]> {
  const { data, error } = await supabase
    .from('contributions')
    .select('*')
    .eq('cluster_id', clusterId)
    .order('created_at');

  if (error) {
    console.error('getContributionsForCluster error', error);
    throw error;
  }

  return data || [];
}