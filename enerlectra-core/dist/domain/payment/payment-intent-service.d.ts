/**
 * Payment Intent Service
 * State machine enforcement and lifecycle management
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PaymentIntent, PaymentIntentState, CreatePaymentIntentRequest, CreatePaymentIntentResult, PaymentConfirmation, PaymentIntentFilter } from './payment-intent-types';
export declare class PaymentIntentError extends Error {
    constructor(message: string);
}
export declare class IllegalPaymentTransition extends Error {
    constructor(from: PaymentIntentState, to: PaymentIntentState);
}
export declare class PaymentIntentService {
    private supabase;
    constructor(supabase: SupabaseClient);
    /**
     * Create new payment intent
     * Initial state: CREATED
     */
    createIntent(request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResult>;
    /**
     * Transition intent to RESERVED state
     * Prerequisites:
     * - Current state must be CREATED
     * - Treasury reservation successful
     */
    transitionToReserved(intentId: string, treasuryReservationId: string): Promise<PaymentIntent>;
    /**
     * Transition intent to INITIATED state
     * Prerequisites:
     * - Current state must be RESERVED
     * - Payment sent to rail API
     */
    transitionToInitiated(intentId: string): Promise<PaymentIntent>;
    /**
     * Transition intent to AWAITING_CONFIRMATION state
     * Prerequisites:
     * - Current state must be INITIATED
     */
    transitionToAwaitingConfirmation(intentId: string): Promise<PaymentIntent>;
    /**
     * Transition intent to CONFIRMED state
     * Prerequisites:
     * - Current state must be AWAITING_CONFIRMATION
     * - Payment confirmed by rail
     */
    transitionToConfirmed(intentId: string, confirmation: PaymentConfirmation): Promise<PaymentIntent>;
    /**
     * Transition intent to SETTLED state
     * Prerequisites:
     * - Current state must be CONFIRMED
     * - Ledger settlement complete
     */
    transitionToSettled(intentId: string, ledgerTransactionId: string, settlementCycleId?: string): Promise<PaymentIntent>;
    /**
     * Transition intent to FAILED state
     * Can happen from: INITIATED or AWAITING_CONFIRMATION
     */
    transitionToFailed(intentId: string, failureReason: string, errorMessage?: string): Promise<PaymentIntent>;
    /**
     * Transition intent to EXPIRED state
     * Can happen from: RESERVED or AWAITING_CONFIRMATION
     */
    transitionToExpired(intentId: string): Promise<PaymentIntent>;
    /**
     * Transition intent to CANCELLED state
     * Can happen from: CREATED or RESERVED
     */
    transitionToCancelled(intentId: string, reason?: string): Promise<PaymentIntent>;
    /**
     * Get payment intent by ID
     */
    getIntent(intentId: string): Promise<PaymentIntent>;
    /**
     * Find payment intent by external reference
     */
    findByExternalReference(externalReference: string): Promise<PaymentIntent | null>;
    /**
     * Query payment intents with filters
     */
    queryIntents(filter: PaymentIntentFilter): Promise<PaymentIntent[]>;
    /**
     * Get expired intents that need cleanup
     */
    getExpiredIntents(): Promise<PaymentIntent[]>;
    /**
     * Get intents awaiting confirmation (for monitoring)
     */
    getAwaitingConfirmation(): Promise<PaymentIntent[]>;
    private validateTransition;
    private saveIntent;
    private mapIntent;
}

