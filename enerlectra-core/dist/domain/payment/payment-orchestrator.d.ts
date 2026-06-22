/**
 * Payment Orchestrator
 * High-level API for buyer payment flows
 * Coordinates: PaymentIntent + Treasury + Settlement
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Ngwee, WattHours } from '../settlement/settlement-types';
import { PaymentRail } from '../treasury/treasury-types';
import { TreasuryService } from '../treasury/treasury-service';
import { PaymentIntent, PaymentIntentState, PaymentConfirmation } from './payment-intent-types';
export interface PurchaseResult {
    success: boolean;
    intentId?: string;
    intent?: PaymentIntent;
    paymentInstructions?: {
        rail: PaymentRail;
        amount: string;
        destination?: string;
        reference: string;
        expiresAt: Date;
    };
    error?: string;
    reason?: 'INSUFFICIENT_LIQUIDITY' | 'TREASURY_FROZEN' | 'VALIDATION_ERROR' | 'SYSTEM_ERROR';
}
export interface SettlementResult {
    success: boolean;
    intent?: PaymentIntent;
    ledgerTransactionId?: string;
    error?: string;
}
export declare class PaymentOrchestrator {
    private supabase;
    private intentService;
    private treasuryService;
    constructor(supabase: SupabaseClient, treasuryService: TreasuryService);
    /**
     * Initiate energy purchase
     *
     * Flow:
     * 1. Create payment intent (CREATED)
     * 2. Check treasury liquidity
     * 3. Reserve treasury liquidity
     * 4. Transition to RESERVED
     * 5. Return payment instructions to user
     *
     * User then pays via mobile money/bank/etc.
     * Webhook handler will call confirmPayment()
     */
    initiatePurchase(buyerId: string, energyWh: WattHours, amountNgwee: Ngwee, rail: PaymentRail, pricePerWh: Ngwee): Promise<PurchaseResult>;
    /**
     * Confirm payment received from external rail
     *
     * Flow:
     * 1. Find intent by external reference
     * 2. Validate amount matches
     * 3. Transition to CONFIRMED
     * 4. Settle in internal ledger
     * 5. Release treasury reservation
     * 6. Transition to SETTLED
     *
     * Called by webhook handlers (MTN, Airtel, etc.)
     */
    confirmPayment(confirmation: PaymentConfirmation): Promise<SettlementResult>;
    /**
     * Mark payment as failed (from webhook or timeout)
     */
    markPaymentFailed(intentId: string, reason: string, errorMessage?: string): Promise<void>;
    /**
     * Process expired intents
     * Should be called by background job every minute
     */
    processExpiredIntents(): Promise<{
        expired: number;
        released: number;
    }>;
    /**
     * Cancel payment intent (before payment sent)
     */
    cancelPayment(intentId: string, reason?: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Settle payment in internal ledger
     *
     * Ledger operations (atomic):
     * 1. DEBIT   SYSTEM_EXTERNAL (grid)
     * 2. CREDIT  ESCROW_[RAIL]
     * 3. CREDIT  TREASURY_INTERNAL
     * 4. CREDIT  BUYER_ACCOUNT
     */
    private settleInLedger;
    private formatAmount;
    private getPaymentDestination;
    /**
     * Get payment intent statistics
     */
    getStats(filter?: {
        buyerId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<{
        total: number;
        byState: Record<PaymentIntentState, number>;
        successRate: number;
        averageAmount: string;
    }>;
}

