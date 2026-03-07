/**
 * Treasury Service
 * Manages external boundary accounts and liquidity
 * Enforces solvency constraints
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Ngwee,
  ngwee,
  addNgwee,
  subtractNgwee,
  ngweeEquals,
  ZERO_NGWEE
} from '../settlement/settlement-types';
import {
  PaymentRail,
  RailStatus,
  TreasuryAccountType,
  TreasuryState,
  RailLiquidity,
  LiquidityCheckResult,
  OutboundPayout,
  PayoutStatus,
  InboundPayment,
  TreasuryOperation,
  TreasuryOperationType
} from './treasury-types';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface TreasuryConfig {
  // Reversal buffers (hold for X time after payment)
  mtnReversalBufferHours: number; // Default: 48 hours
  airtelReversalBufferHours: number; // Default: 48 hours
  bankReversalBufferHours: number; // Default: 72 hours
  stablecoinReversalBufferHours: number; // Default: 1 hour
  
  // Minimum balances (never payout below this)
  mtnMinimumBalanceNgwee: Ngwee;
  airtelMinimumBalanceNgwee: Ngwee;
  bankMinimumBalanceNgwee: Ngwee;
  stablecoinMinimumBalanceNgwee: Ngwee;
  
  // Reconciliation tolerance
  reconciliationToleranceNgwee: Ngwee; // Acceptable drift
  criticalDiscrepancyThreshold: Ngwee; // Freeze payouts above this
  
  // Auto-rebalancing
  autoRebalanceEnabled: boolean;
  targetRailDistribution: Map<PaymentRail, number>; // Percentage
}

export const DEFAULT_TREASURY_CONFIG: TreasuryConfig = {
  mtnReversalBufferHours: 48,
  airtelReversalBufferHours: 48,
  bankReversalBufferHours: 72,
  stablecoinReversalBufferHours: 1,
  
  mtnMinimumBalanceNgwee: ngwee(100_00n), // 100 ZMW
  airtelMinimumBalanceNgwee: ngwee(100_00n),
  bankMinimumBalanceNgwee: ngwee(500_00n), // 500 ZMW
  stablecoinMinimumBalanceNgwee: ngwee(50_00n), // 50 ZMW
  
  reconciliationToleranceNgwee: ngwee(10_00n), // 10 ZMW acceptable drift
  criticalDiscrepancyThreshold: ngwee(1000_00n), // 1000 ZMW = critical
  
  autoRebalanceEnabled: false,
  targetRailDistribution: new Map([
    [PaymentRail.MTN, 40],
    [PaymentRail.AIRTEL, 40],
    [PaymentRail.BANK, 15],
    [PaymentRail.STABLECOIN, 5]
  ])
};

// ═══════════════════════════════════════════════════════════════
// TREASURY SERVICE
// ═══════════════════════════════════════════════════════════════

export class TreasuryService {
  constructor(
    private supabase: SupabaseClient,
    private config: TreasuryConfig = DEFAULT_TREASURY_CONFIG
  ) {}

  // ═══════════════════════════════════════════════════════════
  // LIQUIDITY CHECKS (Critical - prevents insolvency)
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if payout can be executed on specific rail
   * CRITICAL: Call this BEFORE initiating any payout
   */
  async checkLiquidity(
    rail: PaymentRail,
    requestedNgwee: Ngwee
  ): Promise<LiquidityCheckResult> {
    // Get rail liquidity state
    const liquidity = await this.getRailLiquidity(rail);

    // Check 1: Rail must be active
    if (liquidity.status !== RailStatus.ACTIVE) {
      return {
        canPayout: false,
        rail,
        requestedNgwee,
        availableNgwee: ZERO_NGWEE,
        reason: `Rail ${rail} is ${liquidity.status}`
      };
    }

    // Check 2: Available balance must be sufficient
    if (liquidity.availableNgwee < requestedNgwee) {
      // Try to suggest alternative rail
      const alternativeRail = await this.findAlternativeRail(requestedNgwee);

      return {
        canPayout: false,
        rail,
        requestedNgwee,
        availableNgwee: liquidity.availableNgwee,
        insufficientBy: subtractNgwee(requestedNgwee, liquidity.availableNgwee),
        reason: `Insufficient liquidity: requested ${requestedNgwee}, available ${liquidity.availableNgwee}`,
        suggestedRail: alternativeRail || undefined
      };
    }

    // Check 3: Would payout violate minimum balance?
    const afterPayoutBalance = subtractNgwee(liquidity.availableNgwee, requestedNgwee);
    const minimumBalance = this.getMinimumBalance(rail);

    if (afterPayoutBalance < minimumBalance) {
      return {
        canPayout: false,
        rail,
        requestedNgwee,
        availableNgwee: liquidity.availableNgwee,
        reason: `Payout would violate minimum balance constraint (${minimumBalance} ngwee)`
      };
    }

    // ALL CHECKS PASSED
    return {
      canPayout: true,
      rail,
      requestedNgwee,
      availableNgwee: liquidity.availableNgwee
    };
  }

  /**
   * Check if multiple payouts can be batched
   * Returns which payouts are safe to execute
   */
  async checkBatchLiquidity(
    payouts: { rail: PaymentRail; amountNgwee: Ngwee }[]
  ): Promise<{
    canExecuteAll: boolean;
    safePayouts: number[];
    unsafePayouts: number[];
    totalRequired: Map<PaymentRail, Ngwee>;
    totalAvailable: Map<PaymentRail, Ngwee>;
  }> {
    // Group by rail
    const requiredByRail = new Map<PaymentRail, Ngwee>();
    for (const payout of payouts) {
      const current = requiredByRail.get(payout.rail) || ZERO_NGWEE;
      requiredByRail.set(payout.rail, addNgwee(current, payout.amountNgwee));
    }

    // Check each rail
    const availableByRail = new Map<PaymentRail, Ngwee>();
    let canExecuteAll = true;

    for (const [rail, required] of requiredByRail) {
      const check = await this.checkLiquidity(rail, required);
      availableByRail.set(rail, check.availableNgwee);
      
      if (!check.canPayout) {
        canExecuteAll = false;
      }
    }

    // Determine which payouts are safe
    const safePayouts: number[] = [];
    const unsafePayouts: number[] = [];
    const runningTotals = new Map<PaymentRail, Ngwee>();

    for (let i = 0; i < payouts.length; i++) {
      const payout = payouts[i];
      const currentTotal = runningTotals.get(payout.rail) || ZERO_NGWEE;
      const newTotal = addNgwee(currentTotal, payout.amountNgwee);

      const available = availableByRail.get(payout.rail) || ZERO_NGWEE;

      if (newTotal <= available) {
        safePayouts.push(i);
        runningTotals.set(payout.rail, newTotal);
      } else {
        unsafePayouts.push(i);
      }
    }

    return {
      canExecuteAll,
      safePayouts,
      unsafePayouts,
      totalRequired: requiredByRail,
      totalAvailable: availableByRail
    };
  }

  // ═══════════════════════════════════════════════════════════
  // RAIL LIQUIDITY STATE
  // ═══════════════════════════════════════════════════════════

  /**
   * Get current liquidity state for a rail
   */
  async getRailLiquidity(rail: PaymentRail): Promise<RailLiquidity> {
    // Get internal balance from ledger
    const internalBalance = await this.getInternalRailBalance(rail);

    // Get external balance from API (would call actual API here)
    const externalBalance = await this.getExternalRailBalance(rail);

    // Get reserved amount (pending payouts)
    const reserved = await this.getReservedAmount(rail);

    // Calculate available
    const available = subtractNgwee(internalBalance, reserved);

    // Calculate discrepancy
    const discrepancy = subtractNgwee(internalBalance, externalBalance);

    // Get reversal buffer
    const reversalBuffer = await this.calculateReversalBuffer(rail);

    return {
      rail,
      internalBalanceNgwee: internalBalance,
      externalBalanceNgwee: externalBalance,
      discrepancyNgwee: discrepancy,
      availableNgwee: available,
      reservedNgwee: reserved,
      reversalBufferNgwee: reversalBuffer,
      minimumBalanceNgwee: this.getMinimumBalance(rail),
      status: this.getRailStatus(rail, discrepancy),
      lastReconciled: new Date()
    };
  }

  /**
   * Get overall treasury state
   */
  async getTreasuryState(): Promise<TreasuryState> {
    const rails = new Map<PaymentRail, RailLiquidity>();

    let totalInternal = ZERO_NGWEE;
    let totalExternal = ZERO_NGWEE;

    // Get liquidity for each rail
    for (const rail of Object.values(PaymentRail)) {
      const liquidity = await this.getRailLiquidity(rail);
      rails.set(rail, liquidity);

      totalInternal = addNgwee(totalInternal, liquidity.internalBalanceNgwee);
      totalExternal = addNgwee(totalExternal, liquidity.externalBalanceNgwee);
    }

    const totalDiscrepancy = subtractNgwee(totalInternal, totalExternal);

    // Check if system is balanced
    const isBalanced = 
      totalDiscrepancy <= this.config.reconciliationToleranceNgwee &&
      totalDiscrepancy >= (this.config.reconciliationToleranceNgwee * -1n);

    // Check if payouts are allowed
    const canPayout = 
      isBalanced &&
      totalDiscrepancy < this.config.criticalDiscrepancyThreshold;

    // Get reserve balances
    const feeReserve = await this.getReserveBalance(TreasuryAccountType.FEE_RESERVE);
    const insuranceReserve = await this.getReserveBalance(TreasuryAccountType.INSURANCE_RESERVE);
    const operationalReserve = await this.getReserveBalance(TreasuryAccountType.OPERATIONAL_RESERVE);

    return {
      totalInternalNgwee: totalInternal,
      totalExternalNgwee: totalExternal,
      totalDiscrepancyNgwee: totalDiscrepancy,
      rails,
      feeReserveNgwee: feeReserve,
      insuranceReserveNgwee: insuranceReserve,
      operationalReserveNgwee: operationalReserve,
      isBalanced,
      canPayout,
      lastReconciliation: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════
  // INBOUND PAYMENT PROCESSING
  // ═══════════════════════════════════════════════════════════

  /**
   * Process confirmed inbound payment
   * External → Internal settlement
   */
  async processInboundPayment(payment: InboundPayment): Promise<TreasuryOperation> {
    const operationId = `inbound-${payment.paymentId}`;

    // Verify payment is confirmed
    if (!payment.confirmedAt) {
      throw new Error('Cannot process unconfirmed payment');
    }

    // Check if already processed
    if (payment.internallySettled) {
      throw new Error('Payment already settled internally');
    }

    // LEDGER OPERATIONS (atomic):
    // 1. Credit EXTERNAL_ESCROW account (rail-specific)
    // 2. Credit TREASURY_INTERNAL
    // 3. Credit buyer's account

    const externalEscrowAccount = this.getExternalEscrowAccount(payment.rail);

    // In production, these would be actual ledger service calls
    // For now, we return the operation record

    return {
      operationId,
      type: TreasuryOperationType.INBOUND_SETTLEMENT,
      rail: payment.rail,
      amountNgwee: payment.amountNgwee,
      fromAccount: 'EXTERNAL',
      toAccount: externalEscrowAccount,
      timestamp: new Date(),
      status: 'COMPLETED',
      externalReference: payment.externalReference
    };
  }

  // ═══════════════════════════════════════════════════════════
  // OUTBOUND PAYOUT EXECUTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Reserve liquidity for payout
   * MUST be called before sending to rail API
   */
  async reservePayoutLiquidity(
    payoutId: string,
    rail: PaymentRail,
    amountNgwee: Ngwee
  ): Promise<{ success: boolean; reason?: string }> {
    // Check liquidity
    const check = await this.checkLiquidity(rail, amountNgwee);

    if (!check.canPayout) {
      return {
        success: false,
        reason: check.reason
      };
    }

    // Reserve in database
    await this.supabase
      .from('treasury_reservations')
      .insert({
        payout_id: payoutId,
        rail,
        amount_ngwee: amountNgwee.toString(),
        reserved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min expiry
      });

    return { success: true };
  }

  /**
   * Release reserved liquidity (if payout fails)
   */
  async releasePayoutReservation(payoutId: string): Promise<void> {
    await this.supabase
      .from('treasury_reservations')
      .update({ released_at: new Date().toISOString() })
      .eq('payout_id', payoutId);
  }

  /**
   * Confirm payout completed (move from reserved to settled)
   */
  async confirmPayoutSettled(payout: OutboundPayout): Promise<TreasuryOperation> {
    const operationId = `outbound-${payout.payoutId}`;

    // LEDGER OPERATIONS (atomic):
    // 1. Debit contributor account
    // 2. Debit TREASURY_INTERNAL
    // 3. Debit EXTERNAL_ESCROW account (rail-specific)

    // Release reservation
    await this.releasePayoutReservation(payout.payoutId);

    return {
      operationId,
      type: TreasuryOperationType.OUTBOUND_PAYOUT,
      rail: payout.rail,
      amountNgwee: payout.amountNgwee,
      fromAccount: `contributor-${payout.contributorId}`,
      toAccount: 'EXTERNAL',
      timestamp: new Date(),
      status: 'COMPLETED',
      externalReference: payout.externalReference
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════

  private async getInternalRailBalance(rail: PaymentRail): Promise<Ngwee> {
    const accountId = this.getExternalEscrowAccount(rail);
    
    // In production, query ledger service
    // For now, return mock
    return ngwee(1000_00n); // 1000 ZMW
  }

  private async getExternalRailBalance(rail: PaymentRail): Promise<Ngwee> {
    // In production, call actual API (MTN, Airtel, etc.)
    // For now, return mock
    return ngwee(1000_00n);
  }

  private async getReservedAmount(rail: PaymentRail): Promise<Ngwee> {
    const { data } = await this.supabase
      .from('treasury_reservations')
      .select('amount_ngwee')
      .eq('rail', rail)
      .is('released_at', null)
      .gt('expires_at', new Date().toISOString());

    if (!data || data.length === 0) return ZERO_NGWEE;

    return data.reduce(
      (sum, r) => addNgwee(sum, ngwee(BigInt(r.amount_ngwee))),
      ZERO_NGWEE
    );
  }

  private async calculateReversalBuffer(rail: PaymentRail): Promise<Ngwee> {
    // Calculate buffer based on recent inbound payments within reversal window
    const bufferHours = this.getReversalBufferHours(rail);
    const cutoff = new Date(Date.now() - bufferHours * 60 * 60 * 1000);

    // In production, query recent inbound payments
    // For now, return conservative estimate
    return ngwee(100_00n); // 100 ZMW
  }

  private async findAlternativeRail(amount: Ngwee): Promise<PaymentRail | null> {
    for (const rail of Object.values(PaymentRail)) {
      const check = await this.checkLiquidity(rail, amount);
      if (check.canPayout) {
        return rail;
      }
    }
    return null;
  }

  private async getReserveBalance(accountType: TreasuryAccountType): Promise<Ngwee> {
    // In production, query ledger service
    return ngwee(50_00n); // Mock
  }

  private getMinimumBalance(rail: PaymentRail): Ngwee {
    switch (rail) {
      case PaymentRail.MTN:
        return this.config.mtnMinimumBalanceNgwee;
      case PaymentRail.AIRTEL:
        return this.config.airtelMinimumBalanceNgwee;
      case PaymentRail.BANK:
        return this.config.bankMinimumBalanceNgwee;
      case PaymentRail.STABLECOIN:
        return this.config.stablecoinMinimumBalanceNgwee;
    }
  }

  private getReversalBufferHours(rail: PaymentRail): number {
    switch (rail) {
      case PaymentRail.MTN:
        return this.config.mtnReversalBufferHours;
      case PaymentRail.AIRTEL:
        return this.config.airtelReversalBufferHours;
      case PaymentRail.BANK:
        return this.config.bankReversalBufferHours;
      case PaymentRail.STABLECOIN:
        return this.config.stablecoinReversalBufferHours;
    }
  }

  private getRailStatus(rail: PaymentRail, discrepancy: Ngwee): RailStatus {
    if (discrepancy > this.config.criticalDiscrepancyThreshold) {
      return RailStatus.SUSPENDED;
    }
    if (discrepancy > this.config.reconciliationToleranceNgwee) {
      return RailStatus.DEGRADED;
    }
    return RailStatus.ACTIVE;
  }

  private getExternalEscrowAccount(rail: PaymentRail): string {
    switch (rail) {
      case PaymentRail.MTN:
        return TreasuryAccountType.EXTERNAL_ESCROW_MTN;
      case PaymentRail.AIRTEL:
        return TreasuryAccountType.EXTERNAL_ESCROW_AIRTEL;
      case PaymentRail.BANK:
        return TreasuryAccountType.EXTERNAL_ESCROW_BANK;
      case PaymentRail.STABLECOIN:
        return TreasuryAccountType.EXTERNAL_ESCROW_STABLECOIN;
    }
  }
}