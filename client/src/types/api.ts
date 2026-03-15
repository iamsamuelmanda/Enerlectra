// ─────────────────────────────────────────────────────────────
//  Enerlectra – Shared API Types
//  Shapes match what the backend actually returns.
// ─────────────────────────────────────────────────────────────

// Matches backend response shape — note: clusterId (not id), target_kW, location as object
export interface ClusterLocation {
    district: string;
    province: string;
  }
  
  export interface Cluster {
    clusterId: string;
    name: string;
    location: ClusterLocation;
    target_kW: number;
    status: 'active' | 'pending' | 'inactive' | 'open';
    createdAt: string;
    updatedAt?: string;
    participant_count?: number;
    // Campaign fields — populated when backend adds them
    current_usd?: number;
    target_usd?: number;
    deadline?: string;
    // Hardware spec fields
    target_storage_kwh?: number;
    monthly_kwh?: number;
    // Lifecycle
    lifecycle_state?: string;
  }
  
  export interface ClusterInput {
    name: string;
    location: ClusterLocation;
    target_kW: number;
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
    unit_id: string;              // flat / rooftop identifier
    date: string;                 // YYYY-MM-DD
    generation_kwh: number;
    consumption_kwh: number;
    surplus_kwh?: number;         // computed by backend
    recorded_by?: string;         // audit trail — admin or participant id
    created_at?: string;
  }
  
  export interface SettlementResult {
    cluster_id: string;
    date: string;
    unit_id: string;
    generation_kwh: number;
    consumption_kwh: number;
    net_kwh: number;              // generation - consumption
    credit_pcu: number;
    debit_pcu: number;
    status: 'pending' | 'settled' | 'disputed';
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