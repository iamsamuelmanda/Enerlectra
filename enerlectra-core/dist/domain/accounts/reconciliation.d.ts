/**
 * Account Reconciliation
 * Handles imbalances, surpluses, and shortfalls
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountUnit } from './account';
export interface ReconciliationResult {
    settlement_cycle_id: string;
    unit: AccountUnit;
    pool_balance_before: number;
    imbalance_amount: number;
    reconciled: boolean;
    operations: string[];
}
export declare class AccountReconciliation {
    private supabase;
    private accountService;
    private ledgerService;
    private invariants;
    constructor(supabase: SupabaseClient);
    /**
     * Reconcile cluster pool after entitlement allocation
     * Moves any remaining balance to either reserve (surplus) or imbalance (shortfall)
     */
    reconcileClusterPool(cluster_id: string, settlement_cycle_id: string, unit: AccountUnit): Promise<ReconciliationResult>;
    /**
     * Get reconciliation report for a settlement cycle
     */
    getReconciliationReport(settlement_cycle_id: string): Promise<{
        cycle_id: string;
        balanced: boolean;
        units: {
            unit: AccountUnit;
            total_credits: number;
            total_debits: number;
            net_balance: number;
        }[];
    }>;
    /**
     * Verify full cycle reconciliation
     */
    verifyCycleReconciled(settlement_cycle_id: string): Promise<boolean>;
}

