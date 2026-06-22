/**
 * Payment Intent Types
 * State machine for buyer payment orchestration
 */
import { Ngwee, WattHours } from '../settlement/settlement-types';
import { PaymentRail } from '../treasury/treasury-types';
export declare enum PaymentIntentState {
    CREATED = "CREATED",// Intent created, not yet reserved
    RESERVED = "RESERVED",// Energy reserved, liquidity reserved
    INITIATED = "INITIATED",// Sent to payment rail API
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION",// Waiting for rail callback
    CONFIRMED = "CONFIRMED",// Payment confirmed by rail
    SETTLED = "SETTLED",// Settled in internal ledger
    FAILED = "FAILED",// Payment failed at rail
    EXPIRED = "EXPIRED",// Timeout - no confirmation received
    CANCELLED = "CANCELLED"
}
export declare const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentIntentState, PaymentIntentState[]>;
export interface PaymentIntent {
    intentId: string;
    buyerId: string;
    energyWh: WattHours;
    amountNgwee: Ngwee;
    pricePerWh: Ngwee;
    rail: PaymentRail;
    destinationAccount?: string;
    state: PaymentIntentState;
    createdAt: Date;
    reservedAt?: Date;
    initiatedAt?: Date;
    confirmedAt?: Date;
    settledAt?: Date;
    failedAt?: Date;
    expiredAt?: Date;
    cancelledAt?: Date;
    expiresAt: Date;
    externalReference?: string;
    treasuryReservationId?: string;
    settlementCycleId?: string;
    ledgerTransactionId?: string;
    errorMessage?: string;
    failureReason?: string;
    retryCount: number;
    metadata?: Record<string, any>;
}
export interface CreatePaymentIntentRequest {
    buyerId: string;
    energyWh: WattHours;
    amountNgwee: Ngwee;
    pricePerWh: Ngwee;
    rail: PaymentRail;
    destinationAccount?: string;
    expiryMinutes?: number;
    metadata?: Record<string, any>;
}
export interface CreatePaymentIntentResult {
    success: boolean;
    intent?: PaymentIntent;
    error?: string;
}
export interface PaymentConfirmation {
    externalReference: string;
    rail: PaymentRail;
    amountNgwee: Ngwee;
    confirmedAt: Date;
    metadata?: Record<string, any>;
}
export interface PaymentIntentFilter {
    buyerId?: string;
    state?: PaymentIntentState;
    states?: PaymentIntentState[];
    rail?: PaymentRail;
    createdAfter?: Date;
    createdBefore?: Date;
    settledCycleId?: string;
}
export interface PaymentIntentStats {
    totalIntents: number;
    created: number;
    reserved: number;
    initiated: number;
    awaitingConfirmation: number;
    confirmed: number;
    settled: number;
    failed: number;
    expired: number;
    cancelled: number;
    successRate: number;
    averageConfirmationTime: number;
    totalAmountNgwee: Ngwee;
    settledAmountNgwee: Ngwee;
    failedAmountNgwee: Ngwee;
}
export declare function isTerminalState(state: PaymentIntentState): boolean;
export declare function isSuccessState(state: PaymentIntentState): boolean;
export declare function isFailureState(state: PaymentIntentState): boolean;
export declare function canTransitionTo(currentState: PaymentIntentState, targetState: PaymentIntentState): boolean;

