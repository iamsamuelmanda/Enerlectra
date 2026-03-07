/**
 * Payment Intent Service
 * State machine enforcement and lifecycle management
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  Ngwee,
  WattHours,
  ngwee,
  wattHours,
  ZERO_NGWEE
} from '../settlement/settlement-types';
import {
  PaymentIntent,
  PaymentIntentState,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResult,
  PaymentConfirmation,
  PaymentIntentFilter,
  canTransitionTo,
  isTerminalState,
  ALLOWED_PAYMENT_TRANSITIONS
} from './payment-intent-types';

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

export class PaymentIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentIntentError';
  }
}

export class IllegalPaymentTransition extends Error {
  constructor(from: PaymentIntentState, to: PaymentIntentState) {
    super(
      `Illegal payment intent transition: ${from} → ${to}. ` +
      `Allowed: ${ALLOWED_PAYMENT_TRANSITIONS[from].join(', ')}`
    );
    this.name = 'IllegalPaymentTransition';
  }
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT SERVICE
// ═══════════════════════════════════════════════════════════════

export class PaymentIntentService {
  constructor(private supabase: SupabaseClient) {}

  // ═══════════════════════════════════════════════════════════
  // CREATE INTENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Create new payment intent
   * Initial state: CREATED
   */
  async createIntent(
    request: CreatePaymentIntentRequest
  ): Promise<CreatePaymentIntentResult> {
    try {
      const intentId = uuidv4();
      const now = new Date();
      const expiryMinutes = request.expiryMinutes || 15;
      const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

      const intent: PaymentIntent = {
        intentId,
        buyerId: request.buyerId,
        energyWh: request.energyWh,
        amountNgwee: request.amountNgwee,
        pricePerWh: request.pricePerWh,
        rail: request.rail,
        destinationAccount: request.destinationAccount,
        state: PaymentIntentState.CREATED,
        createdAt: now,
        expiresAt,
        retryCount: 0,
        metadata: request.metadata
      };

      // Save to database
      await this.saveIntent(intent);

      return {
        success: true,
        intent
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STATE TRANSITIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Transition intent to RESERVED state
   * Prerequisites:
   * - Current state must be CREATED
   * - Treasury reservation successful
   */
  async transitionToReserved(
    intentId: string,
    treasuryReservationId: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.RESERVED);

    intent.state = PaymentIntentState.RESERVED;
    intent.reservedAt = new Date();
    intent.treasuryReservationId = treasuryReservationId;

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to INITIATED state
   * Prerequisites:
   * - Current state must be RESERVED
   * - Payment sent to rail API
   */
  async transitionToInitiated(
    intentId: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.INITIATED);

    intent.state = PaymentIntentState.INITIATED;
    intent.initiatedAt = new Date();

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to AWAITING_CONFIRMATION state
   * Prerequisites:
   * - Current state must be INITIATED
   */
  async transitionToAwaitingConfirmation(
    intentId: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.AWAITING_CONFIRMATION);

    intent.state = PaymentIntentState.AWAITING_CONFIRMATION;

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to CONFIRMED state
   * Prerequisites:
   * - Current state must be AWAITING_CONFIRMATION
   * - Payment confirmed by rail
   */
  async transitionToConfirmed(
    intentId: string,
    confirmation: PaymentConfirmation
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.CONFIRMED);

    // Verify amount matches
    if (intent.amountNgwee !== confirmation.amountNgwee) {
      throw new PaymentIntentError(
        `Amount mismatch: expected ${intent.amountNgwee}, got ${confirmation.amountNgwee}`
      );
    }

    intent.state = PaymentIntentState.CONFIRMED;
    intent.confirmedAt = confirmation.confirmedAt;
    intent.externalReference = confirmation.externalReference;

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to SETTLED state
   * Prerequisites:
   * - Current state must be CONFIRMED
   * - Ledger settlement complete
   */
  async transitionToSettled(
    intentId: string,
    ledgerTransactionId: string,
    settlementCycleId?: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.SETTLED);

    intent.state = PaymentIntentState.SETTLED;
    intent.settledAt = new Date();
    intent.ledgerTransactionId = ledgerTransactionId;
    intent.settlementCycleId = settlementCycleId;

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to FAILED state
   * Can happen from: INITIATED or AWAITING_CONFIRMATION
   */
  async transitionToFailed(
    intentId: string,
    failureReason: string,
    errorMessage?: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.FAILED);

    intent.state = PaymentIntentState.FAILED;
    intent.failedAt = new Date();
    intent.failureReason = failureReason;
    intent.errorMessage = errorMessage;

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to EXPIRED state
   * Can happen from: RESERVED or AWAITING_CONFIRMATION
   */
  async transitionToExpired(intentId: string): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.EXPIRED);

    intent.state = PaymentIntentState.EXPIRED;
    intent.expiredAt = new Date();

    await this.saveIntent(intent);
    return intent;
  }

  /**
   * Transition intent to CANCELLED state
   * Can happen from: CREATED or RESERVED
   */
  async transitionToCancelled(
    intentId: string,
    reason?: string
  ): Promise<PaymentIntent> {
    const intent = await this.getIntent(intentId);
    this.validateTransition(intent.state, PaymentIntentState.CANCELLED);

    intent.state = PaymentIntentState.CANCELLED;
    intent.cancelledAt = new Date();
    intent.failureReason = reason;

    await this.saveIntent(intent);
    return intent;
  }

  // ═══════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════

  /**
   * Get payment intent by ID
   */
  async getIntent(intentId: string): Promise<PaymentIntent> {
    const { data, error } = await this.supabase
      .from('payment_intents')
      .select('*')
      .eq('intent_id', intentId)
      .single();

    if (error || !data) {
      throw new PaymentIntentError(`Intent not found: ${intentId}`);
    }

    return this.mapIntent(data);
  }

  /**
   * Find payment intent by external reference
   */
  async findByExternalReference(
    externalReference: string
  ): Promise<PaymentIntent | null> {
    const { data, error } = await this.supabase
      .from('payment_intents')
      .select('*')
      .eq('external_reference', externalReference)
      .single();

    if (error || !data) return null;
    return this.mapIntent(data);
  }

  /**
   * Query payment intents with filters
   */
  async queryIntents(filter: PaymentIntentFilter): Promise<PaymentIntent[]> {
    let query = this.supabase.from('payment_intents').select('*');

    if (filter.buyerId) {
      query = query.eq('buyer_id', filter.buyerId);
    }

    if (filter.state) {
      query = query.eq('state', filter.state);
    }

    if (filter.states && filter.states.length > 0) {
      query = query.in('state', filter.states);
    }

    if (filter.rail) {
      query = query.eq('rail', filter.rail);
    }

    if (filter.createdAfter) {
      query = query.gte('created_at', filter.createdAfter.toISOString());
    }

    if (filter.createdBefore) {
      query = query.lte('created_at', filter.createdBefore.toISOString());
    }

    if (filter.settledCycleId) {
      query = query.eq('settlement_cycle_id', filter.settledCycleId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this.mapIntent);
  }

  /**
   * Get expired intents that need cleanup
   */
  async getExpiredIntents(): Promise<PaymentIntent[]> {
    const { data } = await this.supabase
      .from('payment_intents')
      .select('*')
      .in('state', [
        PaymentIntentState.RESERVED,
        PaymentIntentState.AWAITING_CONFIRMATION
      ])
      .lt('expires_at', new Date().toISOString());

    return (data || []).map(this.mapIntent);
  }

  /**
   * Get intents awaiting confirmation (for monitoring)
   */
  async getAwaitingConfirmation(): Promise<PaymentIntent[]> {
    return this.queryIntents({
      state: PaymentIntentState.AWAITING_CONFIRMATION
    });
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private validateTransition(
    currentState: PaymentIntentState,
    targetState: PaymentIntentState
  ): void {
    if (!canTransitionTo(currentState, targetState)) {
      throw new IllegalPaymentTransition(currentState, targetState);
    }
  }

  private async saveIntent(intent: PaymentIntent): Promise<void> {
    const record = {
      intent_id: intent.intentId,
      buyer_id: intent.buyerId,
      energy_wh: intent.energyWh.toString(),
      amount_ngwee: intent.amountNgwee.toString(),
      price_per_wh: intent.pricePerWh.toString(),
      rail: intent.rail,
      destination_account: intent.destinationAccount,
      state: intent.state,
      created_at: intent.createdAt.toISOString(),
      reserved_at: intent.reservedAt?.toISOString(),
      initiated_at: intent.initiatedAt?.toISOString(),
      confirmed_at: intent.confirmedAt?.toISOString(),
      settled_at: intent.settledAt?.toISOString(),
      failed_at: intent.failedAt?.toISOString(),
      expired_at: intent.expiredAt?.toISOString(),
      cancelled_at: intent.cancelledAt?.toISOString(),
      expires_at: intent.expiresAt.toISOString(),
      external_reference: intent.externalReference,
      treasury_reservation_id: intent.treasuryReservationId,
      settlement_cycle_id: intent.settlementCycleId,
      ledger_transaction_id: intent.ledgerTransactionId,
      error_message: intent.errorMessage,
      failure_reason: intent.failureReason,
      retry_count: intent.retryCount,
      metadata: intent.metadata
    };

    const { error } = await this.supabase
      .from('payment_intents')
      .upsert(record);

    if (error) throw error;
  }

  private mapIntent(data: any): PaymentIntent {
    return {
      intentId: data.intent_id,
      buyerId: data.buyer_id,
      energyWh: wattHours(BigInt(data.energy_wh)),
      amountNgwee: ngwee(BigInt(data.amount_ngwee)),
      pricePerWh: ngwee(BigInt(data.price_per_wh)),
      rail: data.rail,
      destinationAccount: data.destination_account,
      state: data.state as PaymentIntentState,
      createdAt: new Date(data.created_at),
      reservedAt: data.reserved_at ? new Date(data.reserved_at) : undefined,
      initiatedAt: data.initiated_at ? new Date(data.initiated_at) : undefined,
      confirmedAt: data.confirmed_at ? new Date(data.confirmed_at) : undefined,
      settledAt: data.settled_at ? new Date(data.settled_at) : undefined,
      failedAt: data.failed_at ? new Date(data.failed_at) : undefined,
      expiredAt: data.expired_at ? new Date(data.expired_at) : undefined,
      cancelledAt: data.cancelled_at ? new Date(data.cancelled_at) : undefined,
      expiresAt: new Date(data.expires_at),
      externalReference: data.external_reference,
      treasuryReservationId: data.treasury_reservation_id,
      settlementCycleId: data.settlement_cycle_id,
      ledgerTransactionId: data.ledger_transaction_id,
      errorMessage: data.error_message,
      failureReason: data.failure_reason,
      retryCount: data.retry_count || 0,
      metadata: data.metadata
    };
  }
}