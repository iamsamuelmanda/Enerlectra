/**
 * Treasury Service
 * Manages external boundary accounts and liquidity
 * Enforces solvency constraints
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Ngwee } from '../settlement/settlement-types';
import { PaymentRail, TreasuryState, RailLiquidity, LiquidityCheckResult, OutboundPayout, InboundPayment, TreasuryOperation } from './treasury-types';
export interface TreasuryConfig {
    mtnReversalBufferHours: number;
    airtelReversalBufferHours: number;
    bankReversalBufferHours: number;
    stablecoinReversalBufferHours: number;
    mtnMinimumBalanceNgwee: Ngwee;
    airtelMinimumBalanceNgwee: Ngwee;
    bankMinimumBalanceNgwee: Ngwee;
    stablecoinMinimumBalanceNgwee: Ngwee;
    reconciliationToleranceNgwee: Ngwee;
    criticalDiscrepancyThreshold: Ngwee;
    autoRebalanceEnabled: boolean;
    targetRailDistribution: Map<PaymentRail, number>;
}
export declare const DEFAULT_TREASURY_CONFIG: TreasuryConfig;
export declare class TreasuryService {
    private supabase;
    private config;
    constructor(supabase: SupabaseClient, config?: TreasuryConfig);
    /**
     * Check if payout can be executed on specific rail
     * CRITICAL: Call this BEFORE initiating any payout
     */
    checkLiquidity(rail: PaymentRail, requestedNgwee: Ngwee): Promise<LiquidityCheckResult>;
    /**
     * Check if multiple payouts can be batched
     * Returns which payouts are safe to execute
     */
    checkBatchLiquidity(payouts: {
        rail: PaymentRail;
        amountNgwee: Ngwee;
    }[]): Promise<{
        canExecuteAll: boolean;
        safePayouts: number[];
        unsafePayouts: number[];
        totalRequired: Map<PaymentRail, Ngwee>;
        totalAvailable: Map<PaymentRail, Ngwee>;
    }>;
    /**
     * Get current liquidity state for a rail
     */
    getRailLiquidity(rail: PaymentRail): Promise<RailLiquidity>;
    /**
     * Get overall treasury state
     */
    getTreasuryState(): Promise<TreasuryState>;
    /**
     * Process confirmed inbound payment
     * External → Internal settlement
     */
    processInboundPayment(payment: InboundPayment): Promise<TreasuryOperation>;
    /**
     * Reserve liquidity for payout
     * MUST be called before sending to rail API
     */
    reservePayoutLiquidity(payoutId: string, rail: PaymentRail, amountNgwee: Ngwee): Promise<{
        success: boolean;
        reason?: string;
    }>;
    /**
     * Release reserved liquidity (if payout fails)
     */
    releasePayoutReservation(payoutId: string): Promise<void>;
    /**
     * Confirm payout completed (move from reserved to settled)
     */
    confirmPayoutSettled(payout: OutboundPayout): Promise<TreasuryOperation>;
    private getInternalRailBalance;
    private getExternalRailBalance;
    private getReservedAmount;
    private calculateReversalBuffer;
    private findAlternativeRail;
    private getReserveBalance;
    private getMinimumBalance;
    private getReversalBufferHours;
    private getRailStatus;
    private getExternalEscrowAccount;
}
