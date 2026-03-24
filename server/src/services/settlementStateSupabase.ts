import { supabase } from "../lib/supabase";
import {
  SettlementState,
  SETTLEMENT_STATES,
} from "../../enerlectra-core/src/domain/settlementState";

export async function getClusterState(
  clusterId: string,
): Promise<SettlementState> {
  const { data, error } = await supabase
    .from("clusters")
    .select("settlement_state")
    .eq("id", clusterId)
    .maybeSingle(); // Changed from .single() to .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to load settlement_state for cluster ${clusterId}: ${error?.message}`,
    );
  }

  if (!data) {
    throw new Error(
      `Cluster ${clusterId} not found in database`,
    );
  }

  const state = data.settlement_state as SettlementState;
  if (!Object.values(SETTLEMENT_STATES).includes(state)) {
    throw new Error(
      `Invalid settlement_state ${state} for cluster ${clusterId}`,
    );
  }

  return state;
}

export async function setClusterState(
  clusterId: string,
  next: SettlementState,
): Promise<void> {
  const { error } = await supabase
    .from("clusters")
    .update({
      settlement_state: next,
      settlement_state_updated_at: new Date().toISOString(),
    })
    .eq("id", clusterId);

  if (error) {
    throw new Error(
      `Failed to update settlement_state for cluster ${clusterId}: ${error.message}`,
    );
  }
}
