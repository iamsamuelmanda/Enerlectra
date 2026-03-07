/**
 * Settlement Invariants (Production-Grade)
 * BigInt-safe validation with zero tolerance
 * Infrastructure-grade correctness enforcement
 */

import {
    Ngwee,
    WattHours,
    addNgwee,
    addWh,
    ngweeEquals,
    whEquals,
    ZERO_NGWEE,
    ZERO_WH
  } from './settlement-types';
  import { SettlementCycle, SettlementState } from './settlement-cycle-hardened';
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT VALIDATION
  // ═══════════════════════════════════════════════════════════════
  
  export class SettlementInvariantViolation extends Error {
    constructor(message: string) {
      super(`Settlement Invariant Violation: ${message}`);
      this.name = 'SettlementInvariantViolation';
    }
  }
  
  /**
   * Validate all settlement cycle invariants
   * Throws SettlementInvariantViolation if any invariant fails
   * 
   * CRITICAL: Uses exact BigInt arithmetic - no tolerance
   */
  export function validateCycleInvariants(cycle: SettlementCycle): void {
    validateEnergyConservation(cycle);
    validateMonetaryConservation(cycle);
    validateFeeAccounting(cycle);
    validateNetPayables(cycle);
    validateNonNegativeValues(cycle);
    validateStateConsistency(cycle);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 1: Energy Conservation
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: Total buyer energy === Total contributor energy
   * 
   * Σ(buyer.energyWh) === Σ(contributor.energyWh)
   * 
   * NO TOLERANCE. EXACT EQUALITY.
   */
  function validateEnergyConservation(cycle: SettlementCycle): void {
    // Compute buyer total
    let totalBuyerEnergyWh: WattHours = ZERO_WH;
    for (const buyer of cycle.buyerObligations) {
      totalBuyerEnergyWh = addWh(totalBuyerEnergyWh, buyer.energyWh);
    }
  
    // Compute contributor total
    let totalContributorEnergyWh: WattHours = ZERO_WH;
    for (const contributor of cycle.contributorEntitlements) {
      totalContributorEnergyWh = addWh(totalContributorEnergyWh, contributor.energyWh);
    }
  
    // EXACT equality check
    if (!whEquals(totalBuyerEnergyWh, totalContributorEnergyWh)) {
      throw new SettlementInvariantViolation(
        `Energy not conserved: ` +
        `buyers=${totalBuyerEnergyWh} Wh, ` +
        `contributors=${totalContributorEnergyWh} Wh, ` +
        `diff=${totalBuyerEnergyWh - totalContributorEnergyWh} Wh`
      );
    }
  
    // Verify against stored total
    if (!whEquals(totalBuyerEnergyWh, cycle.totalEnergyWh)) {
      throw new SettlementInvariantViolation(
        `Stored total energy mismatch: ` +
        `computed=${totalBuyerEnergyWh} Wh, ` +
        `stored=${cycle.totalEnergyWh} Wh`
      );
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 2: Monetary Conservation (Pre-Fee)
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: Total buyer gross === Total contributor gross
   * 
   * Σ(buyer.grossAmountNgwee) === Σ(contributor.grossAmountNgwee)
   * 
   * NO TOLERANCE. EXACT EQUALITY.
   */
  function validateMonetaryConservation(cycle: SettlementCycle): void {
    // Compute buyer gross total
    let totalBuyerGrossNgwee: Ngwee = ZERO_NGWEE;
    for (const buyer of cycle.buyerObligations) {
      totalBuyerGrossNgwee = addNgwee(totalBuyerGrossNgwee, buyer.grossAmountNgwee);
    }
  
    // Compute contributor gross total
    let totalContributorGrossNgwee: Ngwee = ZERO_NGWEE;
    for (const contributor of cycle.contributorEntitlements) {
      totalContributorGrossNgwee = addNgwee(
        totalContributorGrossNgwee,
        contributor.grossAmountNgwee
      );
    }
  
    // EXACT equality check
    if (!ngweeEquals(totalBuyerGrossNgwee, totalContributorGrossNgwee)) {
      throw new SettlementInvariantViolation(
        `Monetary not conserved: ` +
        `buyers=${totalBuyerGrossNgwee} ngwee, ` +
        `contributors=${totalContributorGrossNgwee} ngwee, ` +
        `diff=${totalBuyerGrossNgwee - totalContributorGrossNgwee} ngwee`
      );
    }
  
    // Verify against stored totals
    if (!ngweeEquals(totalBuyerGrossNgwee, cycle.totalBuyerGrossNgwee)) {
      throw new SettlementInvariantViolation(
        `Stored buyer gross mismatch: ` +
        `computed=${totalBuyerGrossNgwee}, ` +
        `stored=${cycle.totalBuyerGrossNgwee}`
      );
    }
  
    if (!ngweeEquals(totalContributorGrossNgwee, cycle.totalContributorGrossNgwee)) {
      throw new SettlementInvariantViolation(
        `Stored contributor gross mismatch: ` +
        `computed=${totalContributorGrossNgwee}, ` +
        `stored=${cycle.totalContributorGrossNgwee}`
      );
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 3: Fee Accounting Integrity
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: Buyer gross === Contributor net + Fees
   * 
   * Σ(buyer.grossAmountNgwee) === Σ(contributor.netReceivableNgwee) + Σ(fees)
   * 
   * NO TOLERANCE. EXACT EQUALITY.
   */
  function validateFeeAccounting(cycle: SettlementCycle): void {
    // Compute total fees
    let totalFeesNgwee: Ngwee = ZERO_NGWEE;
    for (const buyer of cycle.buyerObligations) {
      totalFeesNgwee = addNgwee(totalFeesNgwee, buyer.feesNgwee);
    }
  
    // Compute contributor net total
    let totalContributorNetNgwee: Ngwee = ZERO_NGWEE;
    for (const contributor of cycle.contributorEntitlements) {
      totalContributorNetNgwee = addNgwee(
        totalContributorNetNgwee,
        contributor.netReceivableNgwee
      );
    }
  
    // Check: Buyer gross === Contributor net + Fees
    const expectedGross = addNgwee(totalContributorNetNgwee, totalFeesNgwee);
  
    if (!ngweeEquals(cycle.totalBuyerGrossNgwee, expectedGross)) {
      throw new SettlementInvariantViolation(
        `Fee accounting broken: ` +
        `buyerGross=${cycle.totalBuyerGrossNgwee}, ` +
        `contributorNet=${totalContributorNetNgwee}, ` +
        `fees=${totalFeesNgwee}, ` +
        `expected=${expectedGross}`
      );
    }
  
    // Verify against stored total
    if (!ngweeEquals(totalFeesNgwee, cycle.totalFeesNgwee)) {
      throw new SettlementInvariantViolation(
        `Stored fees mismatch: ` +
        `computed=${totalFeesNgwee}, ` +
        `stored=${cycle.totalFeesNgwee}`
      );
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 4: Net Payables Consistency
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: Each obligation/entitlement computes net correctly
   * 
   * buyer.netPayableNgwee === buyer.grossAmountNgwee - buyer.feesNgwee
   * contributor.netReceivableNgwee === contributor.grossAmountNgwee - contributor.feesNgwee
   */
  function validateNetPayables(cycle: SettlementCycle): void {
    // Validate buyer net payables
    for (const buyer of cycle.buyerObligations) {
      const expectedNet = (buyer.grossAmountNgwee - buyer.feesNgwee) as Ngwee;
      if (!ngweeEquals(buyer.netPayableNgwee, expectedNet)) {
        throw new SettlementInvariantViolation(
          `Buyer ${buyer.buyerId} net payable incorrect: ` +
          `expected=${expectedNet}, ` +
          `actual=${buyer.netPayableNgwee}`
        );
      }
    }
  
    // Validate contributor net receivables
    for (const contributor of cycle.contributorEntitlements) {
      const expectedNet = (contributor.grossAmountNgwee - contributor.feesNgwee) as Ngwee;
      if (!ngweeEquals(contributor.netReceivableNgwee, expectedNet)) {
        throw new SettlementInvariantViolation(
          `Contributor ${contributor.contributorId} net receivable incorrect: ` +
          `expected=${expectedNet}, ` +
          `actual=${contributor.netReceivableNgwee}`
        );
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 5: Non-Negative Values
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: All values must be non-negative
   * Negative values indicate corruption
   */
  function validateNonNegativeValues(cycle: SettlementCycle): void {
    // Check buyers
    for (const buyer of cycle.buyerObligations) {
      if (buyer.energyWh < 0n) {
        throw new SettlementInvariantViolation(
          `Buyer ${buyer.buyerId} has negative energy: ${buyer.energyWh}`
        );
      }
      if (buyer.grossAmountNgwee < 0n) {
        throw new SettlementInvariantViolation(
          `Buyer ${buyer.buyerId} has negative gross: ${buyer.grossAmountNgwee}`
        );
      }
      if (buyer.feesNgwee < 0n) {
        throw new SettlementInvariantViolation(
          `Buyer ${buyer.buyerId} has negative fees: ${buyer.feesNgwee}`
        );
      }
    }
  
    // Check contributors
    for (const contributor of cycle.contributorEntitlements) {
      if (contributor.energyWh < 0n) {
        throw new SettlementInvariantViolation(
          `Contributor ${contributor.contributorId} has negative energy: ${contributor.energyWh}`
        );
      }
      if (contributor.grossAmountNgwee < 0n) {
        throw new SettlementInvariantViolation(
          `Contributor ${contributor.contributorId} has negative gross: ${contributor.grossAmountNgwee}`
        );
      }
      if (contributor.feesNgwee < 0n) {
        throw new SettlementInvariantViolation(
          `Contributor ${contributor.contributorId} has negative fees: ${contributor.feesNgwee}`
        );
      }
    }
  
    // Check totals
    if (cycle.totalBuyerGrossNgwee < 0n) {
      throw new SettlementInvariantViolation(
        `Total buyer gross is negative: ${cycle.totalBuyerGrossNgwee}`
      );
    }
    if (cycle.totalContributorGrossNgwee < 0n) {
      throw new SettlementInvariantViolation(
        `Total contributor gross is negative: ${cycle.totalContributorGrossNgwee}`
      );
    }
    if (cycle.totalFeesNgwee < 0n) {
      throw new SettlementInvariantViolation(
        `Total fees is negative: ${cycle.totalFeesNgwee}`
      );
    }
    if (cycle.totalEnergyWh < 0n) {
      throw new SettlementInvariantViolation(
        `Total energy is negative: ${cycle.totalEnergyWh}`
      );
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // INVARIANT 6: State Consistency
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * INVARIANT: Cycle state must be consistent with data
   */
  function validateStateConsistency(cycle: SettlementCycle): void {
    // OPEN state: Should have no obligations/entitlements yet
    if (cycle.state === SettlementState.OPEN) {
      if (cycle.buyerObligations.length > 0 || cycle.contributorEntitlements.length > 0) {
        throw new SettlementInvariantViolation(
          `OPEN cycle should have no obligations/entitlements`
        );
      }
    }
  
    // FINALIZED state: Must have hash
    if (cycle.state === SettlementState.FINALIZED) {
      if (!cycle.cycleHash) {
        throw new SettlementInvariantViolation(
          `FINALIZED cycle must have cycleHash`
        );
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // QUICK CHECKS (For monitoring)
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Quick validation (throws on first error)
   * Use for fast fail-fast checks
   */
  export function quickValidate(cycle: SettlementCycle): boolean {
    try {
      validateCycleInvariants(cycle);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Detailed validation (collects all errors)
   * Use for auditing
   */
  export function detailedValidate(cycle: SettlementCycle): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
  
    try {
      validateEnergyConservation(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    try {
      validateMonetaryConservation(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    try {
      validateFeeAccounting(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    try {
      validateNetPayables(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    try {
      validateNonNegativeValues(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    try {
      validateStateConsistency(cycle);
    } catch (e: any) {
      errors.push(e.message);
    }
  
    return {
      valid: errors.length === 0,
      errors
    };
  }