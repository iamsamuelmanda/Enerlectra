// src/lib/supabase.ts
// Frontend Supabase client — used by all React components
// Uses ANON key (safe for browser) with RLS enforcing row-level access

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ============================================================================
// TYPE DEFINITIONS — matching actual database schema
// ============================================================================

export interface MeterReading {
  id: string;
  cluster_id: string;
  unit_id: string;
  user_id: string | null;
  reading_kwh: number;
  meter_type: string;
  photo_url: string | null;
  ocr_confidence: number | null;
  captured_at: string;
  reporting_period: string;
  source: string;
  validated: boolean;
  transaction_reference: string | null;
  payment_response: Record<string, unknown> | null;
  signal: string | null;
}

export interface Cluster {
  id: string;
  name: string;
  location: string | null;
  status: string;
  solar_capacity_kw: number | null;
  storage_capacity_kwh: number | null;
  funding_goal_zmw: number | null;
  funding_raised_zmw: number;
  image_url: string | null;
  description: string | null;
  created_at: string;
  lifecycle_state?: string;
  target_kw?: number;
  target_usd?: number;
}

export interface ClusterMember {
  cluster_id: string;
  user_id: string;
  unit_id: string;
  role: string;
  joined_at: string;
}

export interface Contribution {
  id: string;
  user_id: string;
  cluster_id: string;
  amount_usd: number | null;
  amount_zmw: number;
  exchange_rate: number | null;
  pcus: number | null;
  status: 'pending' | 'confirmed' | 'COMPLETED';
  payment_method: string | null;
  projected_ownership_pct: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface EnergyValueAudit {
  id: string;
  user_id: string;
  cluster_id: string;
  reading_id: string | null;
  meter_type: string;
  raw_kwh: number;
  delta_kwh: number;
  gross_value_zmw: number;
  physics_adjusted_kwh: number;
  net_value_zmw: number;
  tariff_params: Record<string, unknown>;
  consent_given: boolean;
  temperature_c: number | null;
  created_at: string;
  request_id: string | null;
}

export interface LedgerEntry {
  id: string;
  settlement_cycle_id: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  unit: 'KWH' | 'ZMW' | 'PCU';
  operation_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface PriceOracle {
  id: string;
  zmw_usd_rate: number;
  pcu_peg_usd: number;
  market_premium_pct: number;
  updated_at: string;
}

// ============================================================================
// HELPER: Subscribe to realtime validated readings
// ============================================================================
export function subscribeToValidatedReadings(
  callback: (reading: MeterReading) => void
): () => void {
  const channel = supabase
    .channel('meter_readings_feed')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'meter_readings',
        filter: 'validated=eq.true',
      },
      (payload) => callback(payload.new as MeterReading)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// HELPER: Fetch live protocol stats from backend API
// ============================================================================
export async function fetchProtocolStats(): Promise<{
  nodeCount: number;
  totalStorageKwh: number;
  totalSolarKw: number;
  totalFundingRaised: number;
  fxRate: number;
  live: boolean;
  timestamp: string;
}> {
  const BASE_URL = import.meta.env.VITE_API_URL;
  if (!BASE_URL) {
    throw new Error('VITE_API_URL is not set in environment');
  }
  const res = await fetch(`${BASE_URL}/api/protocol/global-state`);
  if (!res.ok) throw new Error('Failed to fetch protocol stats');
  return res.json();
}