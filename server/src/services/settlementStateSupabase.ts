// src/services/settlementStateSupabase.ts
import { supabase } from '../../../enerlectra-core/src/lib/supabase.js';

type SettlementState = 'DRAFT' | 'PILOT' | 'ACTIVE' | 'SETTLED' | 'CLOSED' | 'PREVIEW';

const SETTLEMENT_STATES = {
  DRAFT: 'DRAFT' as SettlementState,
  PILOT: 'PILOT' as SettlementState,
  ACTIVE: 'ACTIVE' as SettlementState,
  SETTLED: 'SETTLED' as SettlementState,
  CLOSED: 'CLOSED' as SettlementState,
  PREVIEW: 'PREVIEW' as SettlementState,
} as const;

export async function getClusterState(clusterId: string): Promise<SettlementState> {
  const { data, error } = await supabase
    .from('clusters')
    .select('settlement_state')
    .eq('id', clusterId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load settlement_state for cluster ${clusterId}: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(`Cluster ${clusterId} not found in database`);
  }

  const state = data.settlement_state as SettlementState;
  
  // Validate state is known
  const validStates = Object.values(SETTLEMENT_STATES);
  if (!validStates.includes(state)) {
    throw new Error(`Invalid settlement_state "${state}" for cluster ${clusterId}`);
  }

  return state;
}

export async function setClusterState(
  clusterId: string,
  next: SettlementState,
): Promise<void> {
  // Validate next state
  const validStates = Object.values(SETTLEMENT_STATES);
  if (!validStates.includes(next)) {
    throw new Error(`Invalid target state "${next}"`);
  }

  const { error } = await supabase
    .from('clusters')
    .update({
      settlement_state: next,
      settlement_state_updated_at: new Date().toISOString(),
    })
    .eq('id', clusterId);

  if (error) {
    throw new Error(
      `Failed to update settlement_state for cluster ${clusterId}: ${error.message}`,
    );
  }
}

/**
 * Get all clusters by state (read-only)
 */
export async function getClustersByState(state: SettlementState): Promise<any[]> {
  const { data, error } = await supabase
    .from('clusters')
    .select('*')
    .eq('settlement_state', state);

  if (error) throw error;
  return data || [];
}
