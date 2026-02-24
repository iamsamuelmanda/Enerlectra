import { supabase } from '../lib/supabase';

export type DbSettlement = {
  id: string;
  distribution_id: string;
  cluster_id: string;
  user_id: string;
  kwh: number;
  amount_zwm: number;
  supersedes_settlement_id: string | null;
  created_at: string;
};

export async function insertSettlements(settlements: {
  distributionId: string;
  clusterId: string;
  userId: string;
  kwh: number;
  amountZMW: number;
  supersedesSettlementId?: string | null;
}[]): Promise<DbSettlement[]> {
  const payload = settlements.map((s) => ({
    distribution_id: s.distributionId,
    cluster_id: s.clusterId,
    user_id: s.userId,
    kwh: s.kwh,
    amount_zwm: s.amountZMW,
    supersedes_settlement_id: s.supersedesSettlementId ?? null,
  }));

  const { data, error } = await supabase
    .from('settlements')
    .insert(payload)
    .select('*');

  if (error) {
    console.error('insertSettlements error', error);
    throw error;
  }

  return (data || []) as DbSettlement[];
}

export async function getSettlementsForUser(userId: string): Promise<DbSettlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');

  if (error) {
    console.error('getSettlementsForUser error', error);
    throw error;
  }

  return (data || []) as DbSettlement[];
}

export async function getSettlementsForCluster(clusterId: string): Promise<DbSettlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('cluster_id', clusterId)
    .order('created_at');

  if (error) {
    console.error('getSettlementsForCluster error', error);
    throw error;
  }

  return (data || []) as DbSettlement[];
}

export async function getNetForUserFromDb(userId: string): Promise<{
  userId: string;
  totalKwh: number;
  totalAmountZMW: number;
}> {
  const { data, error } = await supabase
    .from('settlements')
    .select('kwh, amount_zwm')
    .eq('user_id', userId);

  if (error) {
    console.error('getNetForUserFromDb error', error);
    throw error;
  }

  const rows = data || [];
  const totalKwh = rows.reduce((sum: number, r: any) => sum + (r.kwh || 0), 0);
  const totalAmountZMW = rows.reduce(
    (sum: number, r: any) => sum + (r.amount_zwm || 0),
    0,
  );

  return { userId, totalKwh, totalAmountZMW };
}
