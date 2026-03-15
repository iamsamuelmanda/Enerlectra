export type LifecycleState = 'PLANNING' | 'FUNDING' | 'FUNDED' | 'OPERATIONAL' | 'LOCKED' | 'COMPLETED';
export type SettlementState = 'DRAFT' | 'PENDING' | 'SETTLED' | 'FAILED';

export interface Cluster {
  id: string;
  name: string;
  location: string;
  lifecycle_state: LifecycleState;
  target_usd: number;
  current_usd: number;
  funding_pct: number;        // 0–100
  target_kw: number;
  target_storage_kwh: number;
  monthly_kwh: number;
  is_locked: boolean;
  participant_count: number;
  created_at: string;
  funded_at: string | null;
  operational_at: string | null;
  finalized_at: string | null;
  deadline: string;
  settlement_state: SettlementState | null;
  settlement_state_updated_at: string | null;
}

export interface ClusterInput {
  name: string;
  location: string;
  target_usd: number;
  target_kw: number;
  target_storage_kwh?: number;
  monthly_kwh: number;
  deadline: string;
}