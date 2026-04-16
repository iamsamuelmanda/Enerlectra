/**
 * Settlement Service
 * The Enerlectra Engine (EE) - orchestrates settlement state machine
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SettlementCycle } from './settlement-cycle';
export interface ProductionReport {
    cluster_id: string;
    settlement_date: string;
    kwh_reported: number;
    kwh_verified: number;
    price_per_kwh: number;
}
export interface ContributorAllocation {
    contributor_id: string;
    kwh_share: number;
    value_share: number;
}
export declare class SettlementService {
    private supabase;
    private accountService;
    private ledgerService;
    private invariants;
    private reconciliation;
    private finalityDetector;
    constructor(supabase: SupabaseClient);
    /**
     * Create or get settlement cycle
     */
    getOrCreateCycle(cluster_id: string, settlement_date: string): Promise<SettlementCycle>;
    /**
     * STEP 1: Report Production
     * Transitions: OPERATIONAL → PRODUCTION_REPORTED
     */
    reportProduction(report: ProductionReport): Promise<SettlementCycle>;
    /**
     * STEP 2: Compute Value
     * Transitions: PRODUCTION_REPORTED → VALUE_COMPUTED
     * Creates ledger entries: SYSTEM → CLUSTER_POOL
     */
    computeValue(settlement_cycle_id: string): Promise<SettlementCycle>;
    /**
     * STEP 3: Allocate Entitlements
     * Transitions: VALUE_COMPUTED → ENTITLEMENTS_ALLOCATED
     * Creates ledger entries: CLUSTER_POOL → CONTRIBUTOR accounts
     */
    allocateEntitlements(settlement_cycle_id: string, allocations: ContributorAllocation[]): Promise<SettlementCycle>;
    /**
     * STEP 4: Reconcile Balances
     * Transitions: ENTITLEMENTS_ALLOCATED → BALANCES_NETTED → RECONCILIATION_COMPLETE
     * Handles any pool remainders
     */
    reconcileBalances(settlement_cycle_id: string): Promise<SettlementCycle>;
    /**
     * STEP 5: Enter Finality Window
     * Transitions: RECONCILIATION_COMPLETE → FINALITY_PENDING
     */
    enterFinalityWindow(settlement_cycle_id: string): Promise<SettlementCycle>;
    /**
     * STEP 6: Finalize Settlement
     * Transitions: FINALITY_PENDING → SETTLEMENT_FINALIZED
     * Only if challenge window passed and no pending challenges
     */
    finalizeSettlement(settlement_cycle_id: string): Promise<SettlementCycle>;
    /**
     * Get settlement cycle
     */
    private getCycle;
    /**
     * Update settlement cycle
     */
    private updateCycle;
    private mapCycle;
    private serializeCycle;
}
