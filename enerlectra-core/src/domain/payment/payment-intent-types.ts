/**
 * Payment Intent Types
 * State machine for buyer payment orchestration
 */

import { Ngwee, WattHours } from '../settlement/settlement-types';
import { PaymentRail } from '../treasury/treasury-types';

// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT STATE MACHINE
// ═══════════════════════════════════════════════════════════════

export enum PaymentIntentState {
  CREATED = 'CREATED',               // Intent created, not yet reserved
  RESERVED = 'RESERVED',             // Energy reserved, liquidity reserved
  INITIATED = 'INITIATED',           // Sent to payment rail API
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION', // Waiting for rail callback
  CONFIRMED = 'CONFIRMED',           // Payment confirmed by rail
  SETTLED = 'SETTLED',               // Settled in internal ledger
  FAILED = 'FAILED',                 // Payment failed at rail
  EXPIRED = 'EXPIRED',               // Timeout - no confirmation received
  CANCELLED = 'CANCELLED'            // User cancelled before initiation
}

// ═══════════════════════════════════════════════════════════════
// STATE TRANSITIONS (Enforced by state machine)
// ═══════════════════════════════════════════════════════════════

export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentIntentState, PaymentIntentState[]> = {
  [PaymentIntentState.CREATED]: [
    PaymentIntentState.RESERVED,
    PaymentIntentState.CANCELLED
  ],
  [PaymentIntentState.RESERVED]: [
    PaymentIntentState.INITIATED,
    PaymentIntentState.EXPIRED,
    PaymentIntentState.CANCELLED
  ],
  [PaymentIntentState.INITIATED]: [
    PaymentIntentState.AWAITING_CONFIRMATION,
    PaymentIntentState.FAILED
  ],
  [PaymentIntentState.AWAITING_CONFIRMATION]: [
    PaymentIntentState.CONFIRMED,
    PaymentIntentState.FAILED,
    PaymentIntentState.EXPIRED
  ],
  [PaymentIntentState.CONFIRMED]: [
    PaymentIntentState.SETTLED
  ],
  [PaymentIntentState.SETTLED]: [], // Terminal
  [PaymentIntentState.FAILED]: [], // Terminal
  [PaymentIntentState.EXPIRED]: [], // Terminal
  [PaymentIntentState.CANCELLED]: [] // Terminal
};

// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT
// ═══════════════════════════════════════════════════════════════

export interface PaymentIntent {
  // Identity
  intentId: string;
  buyerId: string;
  
  // What's being purchased
  energyWh: WattHours;
  amountNgwee: Ngwee;
  pricePerWh: Ngwee; // For audit trail
  
  // Payment method
  rail: PaymentRail;
  destinationAccount?: string; // Phone number, etc. (for callback matching)
  
  // State
  state: PaymentIntentState;
  
  // Lifecycle timestamps
  createdAt: Date;
  reservedAt?: Date;
  initiatedAt?: Date;
  confirmedAt?: Date;
  settledAt?: Date;
  failedAt?: Date;
  expiredAt?: Date;
  cancelledAt?: Date;
  
  // Expiry
  expiresAt: Date; // Intent expires if not completed by this time
  
  // External references
  externalReference?: string; // MTN transaction ID, etc.
  treasuryReservationId?: string; // Link to treasury reservation
  
  // Settlement linkage
  settlementCycleId?: string; // Which cycle this contributes to
  ledgerTransactionId?: string; // Final ledger transaction
  
  // Error tracking
  errorMessage?: string;
  failureReason?: string;
  retryCount: number;
  
  // Metadata
  metadata?: Record<string, any>; // User-defined data
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT CREATION
// ═══════════════════════════════════════════════════════════════

export interface CreatePaymentIntentRequest {
  buyerId: string;
  energyWh: WattHours;
  amountNgwee: Ngwee;
  pricePerWh: Ngwee;
  rail: PaymentRail;
  destinationAccount?: string;
  expiryMinutes?: number; // Default: 15 minutes
  metadata?: Record<string, any>;
}

export interface CreatePaymentIntentResult {
  success: boolean;
  intent?: PaymentIntent;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT CONFIRMATION (From external rail)
// ═══════════════════════════════════════════════════════════════

export interface PaymentConfirmation {
  externalReference: string; // MTN transaction ID, Airtel reference, etc.
  rail: PaymentRail;
  amountNgwee: Ngwee;
  confirmedAt: Date;
  
  // Additional rail-specific data
  metadata?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT QUERY
// ═══════════════════════════════════════════════════════════════

export interface PaymentIntentFilter {
  buyerId?: string;
  state?: PaymentIntentState;
  states?: PaymentIntentState[];
  rail?: PaymentRail;
  createdAfter?: Date;
  createdBefore?: Date;
  settledCycleId?: string;
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT STATISTICS
// ═══════════════════════════════════════════════════════════════

export interface PaymentIntentStats {
  totalIntents: number;
  
  // By state
  created: number;
  reserved: number;
  initiated: number;
  awaitingConfirmation: number;
  confirmed: number;
  settled: number;
  failed: number;
  expired: number;
  cancelled: number;
  
  // Success metrics
  successRate: number; // settled / (settled + failed + expired)
  averageConfirmationTime: number; // milliseconds
  
  // Value metrics
  totalAmountNgwee: Ngwee;
  settledAmountNgwee: Ngwee;
  failedAmountNgwee: Ngwee;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function isTerminalState(state: PaymentIntentState): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[state].length === 0;
}

export function isSuccessState(state: PaymentIntentState): boolean {
  return state === PaymentIntentState.SETTLED;
}

export function isFailureState(state: PaymentIntentState): boolean {
  return state === PaymentIntentState.FAILED ||
         state === PaymentIntentState.EXPIRED ||
         state === PaymentIntentState.CANCELLED;
}

export function canTransitionTo(
  currentState: PaymentIntentState,
  targetState: PaymentIntentState
): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[currentState].includes(targetState);
}