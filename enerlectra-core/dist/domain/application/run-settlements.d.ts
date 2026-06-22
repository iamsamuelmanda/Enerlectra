/**
 * Run Settlement
 * Application layer orchestration for full daily settlement
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContributorAllocation } from '../settlement/settlement-service';
export interface RunSettlementRequest {
    cluster_id: string;
    settlement_date: string;
    production_report: {
        kwh_reported: number;
        kwh_verified: number;
        price_per_kwh: number;
    };
    contributor_allocations: ContributorAllocation[];
}
export interface RunSettlementResult {
    success: boolean;
    settlement_cycle_id: string;
    final_state: string;
    operations_completed: string[];
    error?: string;
}
/**
 * Run complete daily settlement for a cluster
 * This is the main entry point for settlement execution
 */
export declare function runDailySettlement(supabase: SupabaseClient, request: RunSettlementRequest): Promise<RunSettlementResult>;
/**
 * Attempt to finalize a settlement (after challenge window)
 * Call this 24 hours after entering finality window
 */
export declare function attemptFinalization(supabase: SupabaseClient, settlement_cycle_id: string): Promise<RunSettlementResult>;

