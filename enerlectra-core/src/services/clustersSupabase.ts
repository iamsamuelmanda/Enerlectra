// server/services/clustersSupabase.ts
import { supabase } from '../lib/supabase';
import { ClusterState } from '../../enerlectra-core/src/domain/marketplace/engines/AntiWhaleEngine';
import { LifecycleState } from '../../enerlectra-core/src/domain/lifecycle/types';

export interface ClusterRecord extends ClusterState {
  name: string;
  location: string;
  targetStorageKwh: number;
  monthlyKwh: number;
  participantCount: number;
  createdAt: Date;
  fundedAt: Date | null;
  operationalAt: Date | null;
  finalizedAt: Date | null;
  deadline: Date;
}

export interface CreateClusterParams {
  name: string;
  location: string;
  targetUSD: number;
  targetKw: number;
  targetStorageKwh: number;
  monthlyKwh: number;
  deadline: Date;
}

function mapRow(row: any): ClusterRecord {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    lifecycleState: row.lifecycle_state,
    targetUSD: Number(row.target_usd),
    currentUSD: Number(row.current_usd),
    fundingPct: Number(row.funding_pct),
    targetKw: Number(row.target_kw),
    targetStorageKwh: Number(row.target_storage_kwh),
    monthlyKwh: Number(row.monthly_kwh),
    isLocked: row.is_locked,
    participantCount: row.participant_count,
    createdAt: new Date(row.created_at),
    fundedAt: row.funded_at ? new Date(row.funded_at) : null,
    operationalAt: row.operational_at ? new Date(row.operational_at) : null,
    finalizedAt: row.finalized_at ? new Date(row.finalized_at) : null,
    deadline: new Date(row.deadline),
  };
}

function getTimestampField(state: LifecycleState): string | null {
  switch (state) {
    case 'FUNDED':
      return 'funded_at';
    case 'OPERATIONAL':
      return 'operational_at';
    case 'FINALIZED':
      return 'finalized_at';
    default:
      return null;
  }
}

export async function createCluster(
  params: CreateClusterParams,
): Promise<ClusterRecord> {
  const { data, error } = await supabase
    .from('clusters')
    .insert({
      name: params.name,
      location: params.location,
      lifecycle_state: 'PLANNING',
      target_usd: params.targetUSD,
      target_kw: params.targetKw,
      target_storage_kwh: params.targetStorageKwh,
      monthly_kwh: params.monthlyKwh,
      deadline: params.deadline.toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('createCluster error', error);
    throw error;
  }

  return mapRow(data);
}

export async function updateClusterLifecycleState(
  clusterId: string,
  newState: LifecycleState,
): Promise<ClusterRecord> {
  const timestampField = getTimestampField(newState);

  const updateValues: any = {
    lifecycle_state: newState,
  };

  if (timestampField) {
    updateValues[timestampField] = new Date().toISOString();
  }

  if (['FINALIZED', 'CANCELLED', 'FAILED'].includes(newState)) {
    updateValues.is_locked = true;
  }

  const { data, error } = await supabase
    .from('clusters')
    .update(updateValues)
    .eq('id', clusterId)
    .select('*')
    .single();

  if (error) {
    console.error('updateClusterLifecycleState error', error);
    throw new Error(`Cluster ${clusterId} not found or update failed`);
  }

  return mapRow(data);
}

export async function updateClusterFunding(
  clusterId: string,
  amountUSD: number,
  participantDelta: number = 1,
): Promise<ClusterRecord> {
  // We need to read current values first to compute funding_pct as in SQL version
  const { data: existing, error: getError } = await supabase
    .from('clusters')
    .select('current_usd,target_usd,participant_count')
    .eq('id', clusterId)
    .single();

  if (getError || !existing) {
    console.error('updateClusterFunding get existing error', getError);
    throw new Error(`Cluster ${clusterId} not found`);
  }

  const newCurrent = Number(existing.current_usd) + amountUSD;
  const fundingPct = (newCurrent / Number(existing.target_usd)) * 100;
  const newParticipantCount =
    Number(existing.participant_count) + participantDelta;

  const { data, error } = await supabase
    .from('clusters')
    .update({
      current_usd: newCurrent,
      funding_pct: fundingPct,
      participant_count: newParticipantCount,
    })
    .eq('id', clusterId)
    .select('*')
    .single();

  if (error) {
    console.error('updateClusterFunding error', error);
    throw error;
  }

  return mapRow(data);
}

export async function getClusterById(
  clusterId: string,
): Promise<ClusterRecord | null> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('id', clusterId)
    .maybeSingle();

  if (error) {
    console.error('getClusterById error', error);
    throw error;
  }

  if (!data) return null;
  return mapRow(data);
}

export async function getActiveClusters(): Promise<ClusterRecord[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .in('lifecycle_state', ['PLANNING', 'FUNDING'])
    .eq('is_locked', false)
    .gt('deadline', new Date().toISOString())
    .order('funding_pct', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getActiveClusters error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function getClustersByLocation(
  location: string,
): Promise<ClusterRecord[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('location', location)
    .in('lifecycle_state', [
      'PLANNING',
      'FUNDING',
      'FUNDED',
      'INSTALLING',
      'OPERATIONAL',
    ])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getClustersByLocation error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function getClustersByState(
  state: LifecycleState,
): Promise<ClusterRecord[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('lifecycle_state', state)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getClustersByState error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function getClustersNearingDeadline(
  hoursRemaining: number = 24,
): Promise<ClusterRecord[]> {
  const now = new Date();
  const upper = new Date(now.getTime() + hoursRemaining * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('lifecycle_state', 'FUNDING')
    .gt('deadline', now.toISOString())
    .lt('deadline', upper.toISOString())
    .lt('funding_pct', 100)
    .order('deadline', { ascending: true });

  if (error) {
    console.error('getClustersNearingDeadline error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function getFullyFundedClusters(): Promise<ClusterRecord[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('lifecycle_state', 'FUNDING')
    .gte('funding_pct', 100)
    .order('funded_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('getFullyFundedClusters error', error);
    throw error;
  }

  return (data || []).map(mapRow);
}
