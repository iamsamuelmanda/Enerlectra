// ─────────────────────────────────────────────────────────────
//  Enerlectra – Shared API Types
//  Column names match the real Supabase schema exactly.
//  Verified against information_schema.columns 2026-03-15.
// ─────────────────────────────────────────────────────────────

export interface ClusterLocation {
    district: string;
    province: string;
  }
  
  export interface Cluster {
    id: string;                           // PK
    name: string;
    location: ClusterLocation;
    lifecycle_state?: string;             // 'open' | 'active' | 'funded' | etc.
    target_usd?: number;
    current_usd?: number;
    funding_pct?: number;                 // computed by DB
    target_kw: number;                    // all lowercase — matches DB exactly
    target_storage_kwh?: number;
    monthly_kwh?: number;
    is_locked?: boolean;
    participant_count?: number;
    created_at: string;
    funded_at?: string;
    operational_at?: string;
    finalized_at?: string;
    deadline?: string;
    settlement_state?: string;
    settlement_state_updated_at?: string;
    // status alias for UI — derived from lifecycle_state
    status?: 'active' | 'pending' | 'inactive' | 'open';
  }
  
  export interface ClusterInput {
    name: string;
    location: ClusterLocation;
    target_kw: number;
    target_usd?: number;
    deadline?: string;
  }
  
  export interface Contribution {
    id: string;
    cluster_id: string;
    participant_id: string;
    amount_pcu: number;
    ownership_percent: number;
    created_at: string;
  }
  
  export interface EnergyReading {
    id?: string;
    cluster_id: string;
    unit_id: string;          // flat / rooftop identifier
    date: string;             // YYYY-MM-DD
    generation_kwh: number;
    consumption_kwh: number;
    surplus_kwh?: number;     // computed by DB as generated column
    recorded_by?: string;     // audit trail — admin or participant id
    created_at?: string;
  }
  
  export interface SettlementResult {
    cluster_id: string;
    date: string;
    unit_id: string;
    generation_kwh: number;
    consumption_kwh: number;
    net_kwh: number;
    credit_pcu: number;
    debit_pcu: number;
    status: 'pending' | 'settled' | 'disputed';
    settled_at?: string;
  }
  
  export interface OwnershipEntry {
    participant_id: string;
    display_name: string;
    ownership_percent: number;
    contribution_pcu: number;
  }
  
  export interface ApiError {
    error: string;
    code?: string;
  }