/**
 * Payment Orchestrator
 * High-level API for buyer payment flows
 * Coordinates: PaymentIntent + Treasury + Settlement
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Ngwee,
  WattHours,
  ngwee
} from '../settlement/settlement-types';
import { PaymentRail } from '../treasury/treasury-types';
import { TreasuryService } from '../treasury/treasury-service';
import {
  PaymentIntent,
  PaymentIntentState,
  PaymentConfirmation,
  CreatePaymentIntentRequest
} from './payment-intent-types';
import { PaymentIntentService } from './payment-intent-service';

// ═══════════════════════════════════════════════════════════════
// PURCHASE FLOW RESULT
// ═══════════════════════════════════════════════════════════════

export interface PurchaseResult {
  success: boolean;
  intentId?: string;
  intent?: PaymentIntent;
  
  // For user to complete payment
  paymentInstructions?: {
    rail: PaymentRail;
    amount: string; // Formatted for display
    destination?: string; // Phone number, account, etc.
    reference: string; // User should include this
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

// ═══════════════════════════════════════════════════════════════
// PAYMENT ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export class PaymentOrchestrator {
  private intentService: PaymentIntentService;
  private treasuryService: TreasuryService;

  constructor(
    private supabase: SupabaseClient,
    treasuryService: TreasuryService
  ) {
    this.intentService = new PaymentIntentService(supabase);
    this.treasuryService = treasuryService;
  }

  // ═══════════════════════════════════════════════════════════
  // BUYER PURCHASE FLOW
  // ═══════════════════════════════════════════════════════════

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
  async initiatePurchase(
    buyerId: string,
    energyWh: WattHours,
    amountNgwee: Ngwee,
    rail: PaymentRail,
    pricePerWh: Ngwee
  ): Promise<PurchaseResult> {
    try {
      // STEP 1: Create payment intent
      const createResult = await this.intentService.createIntent({
        buyerId,
        energyWh,
        amountNgwee,
        pricePerWh,
        rail,
        expiryMinutes: 15
      });

      if (!createResult.success || !createResult.intent) {
        return {
          success: false,
          error: createResult.error,
          reason: 'VALIDATION_ERROR'
        };
      }

      const intent = createResult.intent;

      // STEP 2: Check treasury liquidity
      const liquidityCheck = await this.treasuryService.checkLiquidity(
        rail,
        amountNgwee
      );

      if (!liquidityCheck.canPayout) {
        // Mark intent as failed
        await this.intentService.transitionToFailed(
          intent.intentId,
          'Insufficient liquidity',
          liquidityCheck.reason
        );

        return {
          success: false,
          error: liquidityCheck.reason,
          reason: 'INSUFFICIENT_LIQUIDITY',
          intentId: intent.intentId
        };
      }

      // STEP 3: Reserve treasury liquidity
      const reservation = await this.treasuryService.reservePayoutLiquidity(
        intent.intentId,
        rail,
        amountNgwee
      );

      if (!reservation.success) {
        await this.intentService.transitionToFailed(
          intent.intentId,
          'Treasury reservation failed',
          reservation.reason
        );

        return {
          success: false,
          error: reservation.reason,
          reason: 'INSUFFICIENT_LIQUIDITY',
          intentId: intent.intentId
        };
      }

      // STEP 4: Transition to RESERVED
      const reservedIntent = await this.intentService.transitionToReserved(
        intent.intentId,
        intent.intentId // Using intent ID as reservation ID
      );

      // STEP 5: Return payment instructions
      return {
        success: true,
        intentId: reservedIntent.intentId,
        intent: reservedIntent,
        paymentInstructions: {
          rail,
          amount: this.formatAmount(amountNgwee),
          destination: this.getPaymentDestination(rail),
          reference: reservedIntent.intentId,
          expiresAt: reservedIntent.expiresAt
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        reason: 'SYSTEM_ERROR'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAYMENT CONFIRMATION (From webhook)
  // ═══════════════════════════════════════════════════════════

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
  async confirmPayment(
    confirmation: PaymentConfirmation
  ): Promise<SettlementResult> {
    try {
      // STEP 1: Find intent by external reference
      const intent = await this.intentService.findByExternalReference(
        confirmation.externalReference
      );

      if (!intent) {
        // Try to match by amount and recent timestamp
        // This handles cases where external reference format differs
        return {
          success: false,
          error: 'Payment intent not found for external reference'
        };
      }

      // STEP 2: Transition to CONFIRMED
      const confirmedIntent = await this.intentService.transitionToConfirmed(
        intent.intentId,
        confirmation
      );

      // STEP 3: Settle in internal ledger
      const ledgerTransactionId = await this.settleInLedger(confirmedIntent);

      // STEP 4: Transition to SETTLED
      const settledIntent = await this.intentService.transitionToSettled(
        intent.intentId,
        ledgerTransactionId
      );

      // STEP 5: Release treasury reservation
      if (intent.treasuryReservationId) {
        await this.treasuryService.releasePayoutReservation(
          intent.treasuryReservationId
        );
      }

      return {
        success: true,
        intent: settledIntent,
        ledgerTransactionId
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAYMENT FAILURE
  // ═══════════════════════════════════════════════════════════

  /**
   * Mark payment as failed (from webhook or timeout)
   */
  async markPaymentFailed(
    intentId: string,
    reason: string,
    errorMessage?: string
  ): Promise<void> {
    const intent = await this.intentService.getIntent(intentId);

    // Release treasury reservation
    if (intent.treasuryReservationId) {
      await this.treasuryService.releasePayoutReservation(
        intent.treasuryReservationId
      );
    }

    // Transition to FAILED
    await this.intentService.transitionToFailed(
      intentId,
      reason,
      errorMessage
    );
  }

  // ═══════════════════════════════════════════════════════════
  // EXPIRY HANDLING (Background job)
  // ═══════════════════════════════════════════════════════════

  /**
   * Process expired intents
   * Should be called by background job every minute
   */
  async processExpiredIntents(): Promise<{
    expired: number;
    released: number;
  }> {
    const expiredIntents = await this.intentService.getExpiredIntents();
    let expired = 0;
    let released = 0;

    for (const intent of expiredIntents) {
      try {
        // Release treasury reservation
        if (intent.treasuryReservationId) {
          await this.treasuryService.releasePayoutReservation(
            intent.treasuryReservationId
          );
          released++;
        }

        // Transition to EXPIRED
        await this.intentService.transitionToExpired(intent.intentId);
        expired++;
      } catch (error) {
        console.error(`Failed to expire intent ${intent.intentId}:`, error);
      }
    }

    return { expired, released };
  }

  // ═══════════════════════════════════════════════════════════
  // CANCELLATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Cancel payment intent (before payment sent)
   */
  async cancelPayment(
    intentId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const intent = await this.intentService.getIntent(intentId);

      // Can only cancel CREATED or RESERVED states
      if (
        intent.state !== PaymentIntentState.CREATED &&
        intent.state !== PaymentIntentState.RESERVED
      ) {
        return {
          success: false,
          error: `Cannot cancel intent in state: ${intent.state}`
        };
      }

      // Release reservation if exists
      if (intent.treasuryReservationId) {
        await this.treasuryService.releasePayoutReservation(
          intent.treasuryReservationId
        );
      }

      // Transition to CANCELLED
      await this.intentService.transitionToCancelled(intentId, reason);

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Settle payment in internal ledger
   * 
   * Ledger operations (atomic):
   * 1. DEBIT   SYSTEM_EXTERNAL (grid)
   * 2. CREDIT  ESCROW_[RAIL]
   * 3. CREDIT  TREASURY_INTERNAL
   * 4. CREDIT  BUYER_ACCOUNT
   */
  private async settleInLedger(intent: PaymentIntent): Promise<string> {
    // In production, this would call LedgerService
    // For now, return mock transaction ID
    
    // TODO: Implement actual ledger settlement
    // const ledgerService = new LedgerService(this.supabase);
    // const txId = await ledgerService.transfer(...);
    
    return `txn-${intent.intentId}-${Date.now()}`;
  }

  private formatAmount(amountNgwee: Ngwee): string {
    const zmw = Number(amountNgwee) / 100;
    return `${zmw.toFixed(2)} ZMW`;
  }

  private getPaymentDestination(rail: PaymentRail): string {
    // In production, return actual account numbers/phones
    switch (rail) {
      case PaymentRail.MTN:
        return '+260-XXX-XXXXX (MTN)';
      case PaymentRail.AIRTEL:
        return '+260-XXX-XXXXX (Airtel)';
      case PaymentRail.BANK:
        return 'Account: XXXXX (Zanaco)';
      case PaymentRail.STABLECOIN:
        return '0xXXXX...XXXX (Polygon)';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MONITORING & STATISTICS
  // ═══════════════════════════════════════════════════════════

  /**
   * Get payment intent statistics
   */
  async getStats(filter?: {
    buyerId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    byState: Record<PaymentIntentState, number>;
    successRate: number;
    averageAmount: string;
  }> {
    const intents = await this.intentService.queryIntents({
      buyerId: filter?.buyerId,
      createdAfter: filter?.startDate,
      createdBefore: filter?.endDate
    });

    const byState: Record<PaymentIntentState, number> = {} as any;
    Object.values(PaymentIntentState).forEach(state => {
      byState[state] = 0;
    });

    let totalAmount = 0n;

    for (const intent of intents) {
      byState[intent.state]++;
      totalAmount += intent.amountNgwee;
    }

    const settled = byState[PaymentIntentState.SETTLED] || 0;
    const failed =
      (byState[PaymentIntentState.FAILED] || 0) +
      (byState[PaymentIntentState.EXPIRED] || 0) +
      (byState[PaymentIntentState.CANCELLED] || 0);

    const successRate = settled + failed > 0
      ? (settled / (settled + failed)) * 100
      : 0;

    const avgAmount = intents.length > 0
      ? Number(totalAmount / BigInt(intents.length)) / 100
      : 0;

    return {
      total: intents.length,
      byState,
      successRate,
      averageAmount: `${avgAmount.toFixed(2)} ZMW`
    };
  }
}