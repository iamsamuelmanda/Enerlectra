/**
 * Settlement Cycle Domain Model
 * Represents a single daily settlement for a cluster
 */
import { EEState } from './settlement-state.enum';
export interface SettlementCycle {
    settlement_cycle_id: string;
    cluster_id: string;
    settlement_date: string;
    state: EEState;
    kwh_reported: number;
    kwh_verified: number;
    price_per_kwh: number;
    total_value: number;
    production_reported_at?: Date;
    reconciliation_complete_at?: Date;
    finality_pending_at?: Date;
    finalized_at?: Date;
    challenge_window_end?: Date;
    entitlements_hash?: string;
    ledger_hash?: string;
    state_hash?: string;
    previous_cycle_hash?: string;
}
/**
 * Compute deterministic settlement cycle ID
 */
export declare function computeSettlementCycleId(cluster_id: string, settlement_date: string): string;
/**
 * Compute state hash for integrity verification
 */
export declare function computeStateHash(cycle: SettlementCycle): string;
/**
 * Create initial settlement cycle
 */
export declare function createSettlementCycle(cluster_id: string, settlement_date: string): SettlementCycle;

