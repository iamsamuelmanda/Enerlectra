/**
 * Treasury Reconciliation
 * Daily verification of internal ledger vs external balances
 * CRITICAL: Prevents insolvency drift
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Ngwee } from '../settlement/settlement-types';
import { ReconciliationReport } from './treasury-types';
import { TreasuryService, TreasuryConfig } from './treasury-service';
export declare class TreasuryReconciliation {
    private supabase;
    private treasuryService;
    private config;
    constructor(supabase: SupabaseClient, treasuryService: TreasuryService, config: TreasuryConfig);
    /**
     * Run daily reconciliation
     * CRITICAL: Call this every day at 2 AM
     */
    runDailyReconciliation(): Promise<ReconciliationReport>;
    /**
     * Freeze all payouts (critical discrepancy detected)
     */
    private freezePayouts;
    /**
     * Unfreeze payouts (after manual resolution)
     */
    unfreezePayouts(approvedBy: string, notes: string): Promise<void>;
    /**
     * Check if payouts are currently frozen
     */
    arePayoutsFrozen(): Promise<boolean>;
    /**
     * Get reconciliation history
     */
    getReconciliationHistory(startDate: Date, endDate: Date): Promise<ReconciliationReport[]>;
    /**
     * Log reconciliation to database
     */
    private logReconciliation;
    /**
     * Generate reconciliation report for regulators
     */
    generateRegulatoryReport(startDate: Date, endDate: Date): Promise<string>;
    /**
     * Calculate average daily drift (for trending)
     */
    calculateAverageDrift(days?: number): Promise<{
        averageDriftNgwee: Ngwee;
        maxDriftNgwee: Ngwee;
        daysOutOfBalance: number;
        trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    }>;
    private calculateAverage;
}

