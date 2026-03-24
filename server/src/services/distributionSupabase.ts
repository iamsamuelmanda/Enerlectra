import { supabase } from '../lib/supabase';

export type DbFinalDistribution = {
  id: string;
  cluster_id: string;
  snapshot_id: string;
  total_kwh: number;
  allocations: any; // JSONB: array of { userId, allocatedKwh, ownershipPct }
  finalized_at: string;
};

export async function insertFinalDistribution(input: {
  distributionId: string;
  clusterId: string;
  snapshotId: string;
  totalKwh: number;
  allocations: any[];
}): Promise<DbFinalDistribution> {
  const { data, error } = await supabase
    .from('final_distributions')
    .insert({
      id: input.distributionId,
      cluster_id: input.clusterId,
      snapshot_id: input.snapshotId,
      total_kwh: input.totalKwh,
      allocations: input.allocations,
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertFinalDistribution error', error);
    throw error;
  }

  return data as DbFinalDistribution;
}

export async function getFinalDistributionFromDb(
  distributionId: string,
): Promise<DbFinalDistribution | null> {
  const { data, error } = await supabase
    .from('final_distributions')
    .select('*')
    .eq('id', distributionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.details?.includes('Results contain 0 rows')) {
      return null;
    }
    console.error('getFinalDistributionFromDb error', error);
    throw error;
  }

  return data as DbFinalDistribution;
}

export async function hasFinalDistributionForSnapshot(
  snapshotId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('final_distributions')
    .select('id')
    .eq('snapshot_id', snapshotId)
    .limit(1);

  if (error) {
    console.error('hasFinalDistributionForSnapshot error', error);
    throw error;
  }

  return !!(data && data.length > 0);
}
