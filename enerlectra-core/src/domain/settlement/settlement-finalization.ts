/**
 * Settlement Finalization (Production-Grade)
 * State machine enforcement with invariant validation
 * Infrastructure-grade settlement logic
 */

import {
    SettlementCycle,
    SettlementState,
    createSettlementCycle
  } from './settlement-cycle-hardened';
  import {
    validateCycleInvariants,
    SettlementInvariantViolation
  } from './settlement-invariants';
  import {
    computeCycleHash,
    computeCycleHashWithPrevious,
    verifyCycleHash
  } from './settlement-hash';
  
  // ═══════════════════════════════════════════════════════════════
  // STATE TRANSITION RULES
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Legal state transitions
   * NO SKIPPING. NO REVERSING.
   */
  const ALLOWED_TRANSITIONS: Record<SettlementState, SettlementState[]> = {
    [SettlementState.OPEN]: [SettlementState.RECONCILED],
    [SettlementState.RECONCILED]: [SettlementState.NETTED],
    [SettlementState.NETTED]: [SettlementState.FINALIZED],
    [SettlementState.FINALIZED]: [SettlementState.ANCHORED],
    [SettlementState.ANCHORED]: [] // Terminal state
  };
  
  export class IllegalStateTransition extends Error {
    constructor(from: SettlementState, to: SettlementState) {
      super(
        `Illegal state transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: ${ALLOWED_TRANSITIONS[from].join(', ')}`
      );
      this.name = 'IllegalStateTransition';
    }
  }
  
  /**
   * Validate state transition is legal
   */
  function validateStateTransition(
    currentState: SettlementState,
    nextState: SettlementState
  ): void {
    const allowed = ALLOWED_TRANSITIONS[currentState];
    
    if (!allowed.includes(nextState)) {
      throw new IllegalStateTransition(currentState, nextState);
    }
  }
  
  /**
   * Check if state is terminal (no further transitions allowed)
   */
  export function isTerminalState(state: SettlementState): boolean {
    return ALLOWED_TRANSITIONS[state].length === 0;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STATE TRANSITION OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Transition cycle to RECONCILED state
   * Prerequisites:
   * - Current state must be OPEN
   * - Must have obligations and entitlements
   * - Must pass invariant checks
   */
  export function transitionToReconciled(cycle: SettlementCycle): SettlementCycle {
    validateStateTransition(cycle.state, SettlementState.RECONCILED);
  
    // Validate cycle has content
    if (cycle.buyerObligations.length === 0) {
      throw new Error('Cannot reconcile cycle with no buyer obligations');
    }
  
    if (cycle.contributorEntitlements.length === 0) {
      throw new Error('Cannot reconcile cycle with no contributor entitlements');
    }
  
    // Validate invariants
    validateCycleInvariants(cycle);
  
    // Transition state
    return {
      ...cycle,
      state: SettlementState.RECONCILED
    };
  }
  
  /**
   * Transition cycle to NETTED state
   * Prerequisites:
   * - Current state must be RECONCILED
   * - Must have netted transfers computed
   * - Must pass invariant checks
   */
  export function transitionToNetted(
    cycle: SettlementCycle,
    nettedTransfers: SettlementCycle['nettedTransfers']
  ): SettlementCycle {
    validateStateTransition(cycle.state, SettlementState.NETTED);
  
    // Validate netted transfers provided
    if (nettedTransfers.length === 0) {
      throw new Error('Cannot net cycle with no transfers');
    }
  
    const updated = {
      ...cycle,
      nettedTransfers,
      state: SettlementState.NETTED
    };
  
    // Validate invariants with netted transfers
    validateCycleInvariants(updated);
  
    return updated;
  }
  
  /**
   * Transition cycle to FINALIZED state
   * Prerequisites:
   * - Current state must be NETTED
   * - Must pass all invariant checks
   * - Must compute and store cycle hash
   * 
   * THIS IS THE CRITICAL TRANSITION.
   * After this, cycle is immutable and ready for payout.
   */
  export function transitionToFinalized(
    cycle: SettlementCycle,
    previousCycleHash?: string
  ): SettlementCycle {
    validateStateTransition(cycle.state, SettlementState.FINALIZED);
  
    // Final invariant validation
    validateCycleInvariants(cycle);
  
    // Compute cycle hash (with previous hash linkage)
    const cycleHash = computeCycleHashWithPrevious(cycle, previousCycleHash);
  
    // Transition state
    return {
      ...cycle,
      state: SettlementState.FINALIZED,
      previousCycleHash: previousCycleHash || undefined,
      cycleHash
    };
  }
  
  /**
   * Transition cycle to ANCHORED state
   * Prerequisites:
   * - Current state must be FINALIZED
   * - Must have cycle hash
   * - Blockchain anchor transaction must exist
   */
  export function transitionToAnchored(
    cycle: SettlementCycle,
    anchorTxHash: string
  ): SettlementCycle {
    validateStateTransition(cycle.state, SettlementState.ANCHORED);
  
    if (!cycle.cycleHash) {
      throw new Error('Cannot anchor cycle without hash');
    }
  
    // Verify cycle hash is still valid
    if (!verifyCycleHash(cycle)) {
      throw new Error('Cycle hash verification failed - cycle may be corrupted');
    }
  
    // Transition to terminal state
    return {
      ...cycle,
      state: SettlementState.ANCHORED
      // Note: anchorTxHash would be stored separately in database
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FINALIZATION ORCHESTRATOR
  // ═══════════════════════════════════════════════════════════════
  
  export interface FinalizationResult {
    success: boolean;
    cycle: SettlementCycle;
    cycleHash: string;
    operations: string[];
    errors?: string[];
  }
  
  /**
   * Finalize settlement cycle (complete state machine execution)
   * 
   * This is the main entry point for settlement finalization.
   * Executes all state transitions and validations.
   */
  export async function finalizeSettlementCycle(
    cycle: SettlementCycle,
    nettedTransfers: SettlementCycle['nettedTransfers'],
    previousCycleHash?: string
  ): Promise<FinalizationResult> {
    const operations: string[] = [];
    const errors: string[] = [];
  
    try {
      // STEP 1: Transition to RECONCILED
      operations.push('Transitioning to RECONCILED...');
      let updated = transitionToReconciled(cycle);
      operations.push(`✓ RECONCILED: ${updated.buyerObligations.length} buyers, ${updated.contributorEntitlements.length} contributors`);
  
      // STEP 2: Transition to NETTED
      operations.push('Transitioning to NETTED...');
      updated = transitionToNetted(updated, nettedTransfers);
      operations.push(`✓ NETTED: ${updated.nettedTransfers.length} transfers`);
  
      // STEP 3: Transition to FINALIZED
      operations.push('Transitioning to FINALIZED...');
      updated = transitionToFinalized(updated, previousCycleHash);
      operations.push(`✓ FINALIZED: cycle_hash=${updated.cycleHash}`);
  
      return {
        success: true,
        cycle: updated,
        cycleHash: updated.cycleHash!,
        operations
      };
  
    } catch (error: any) {
      if (error instanceof SettlementInvariantViolation) {
        errors.push(`Invariant violation: ${error.message}`);
      } else if (error instanceof IllegalStateTransition) {
        errors.push(`State transition error: ${error.message}`);
      } else {
        errors.push(`Finalization error: ${error.message}`);
      }
  
      return {
        success: false,
        cycle,
        cycleHash: cycle.cycleHash || '',
        operations,
        errors
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // RECOVERY & ROLLBACK
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Check if cycle can be safely finalized
   * Returns validation errors if any
   */
  export function canFinalizeCycle(cycle: SettlementCycle): {
    canFinalize: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
  
    // Check state
    if (cycle.state !== SettlementState.OPEN &&
        cycle.state !== SettlementState.RECONCILED &&
        cycle.state !== SettlementState.NETTED) {
      reasons.push(`Cycle already in state: ${cycle.state}`);
    }
  
    // Check has obligations
    if (cycle.buyerObligations.length === 0) {
      reasons.push('No buyer obligations');
    }
  
    // Check has entitlements
    if (cycle.contributorEntitlements.length === 0) {
      reasons.push('No contributor entitlements');
    }
  
    // Check invariants
    try {
      validateCycleInvariants(cycle);
    } catch (error: any) {
      reasons.push(`Invariant validation failed: ${error.message}`);
    }
  
    return {
      canFinalize: reasons.length === 0,
      reasons
    };
  }
  
  /**
   * Create corrective cycle (for handling errors)
   * Used when original settlement had issues
   */
  export function createCorrectiveCycle(
    originalCycleId: string,
    clusterId: string,
    startTimestamp: number,
    endTimestamp: number
  ): SettlementCycle {
    // Create new cycle with reference to original
    const correctiveCycleId = `${originalCycleId}-corrective-${Date.now()}`;
    
    return createSettlementCycle(
      correctiveCycleId,
      clusterId,
      startTimestamp,
      endTimestamp
    );
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FINALITY VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Verify settlement cycle integrity
   * Checks all invariants + hash
   */
  export function verifySettlementIntegrity(cycle: SettlementCycle): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
  
    // Check state
    if (cycle.state !== SettlementState.FINALIZED &&
        cycle.state !== SettlementState.ANCHORED) {
      issues.push(`Cycle not finalized (state: ${cycle.state})`);
    }
  
    // Check has hash
    if (!cycle.cycleHash) {
      issues.push('Cycle missing hash');
    } else {
      // Verify hash
      if (!verifyCycleHash(cycle)) {
        issues.push('Cycle hash verification failed');
      }
    }
  
    // Validate invariants
    try {
      validateCycleInvariants(cycle);
    } catch (error: any) {
      issues.push(`Invariant violation: ${error.message}`);
    }
  
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Export settlement proof for external verification
   */
  export function exportSettlementProof(cycle: SettlementCycle): {
    cycleId: string;
    clusterId: string;
    state: SettlementState;
    cycleHash: string;
    previousCycleHash?: string;
    totalEnergyWh: string;
    totalValueNgwee: string;
    obligationCount: number;
    entitlementCount: number;
    timestamp: number;
  } {
    if (!cycle.cycleHash) {
      throw new Error('Cannot export proof for cycle without hash');
    }
  
    return {
      cycleId: cycle.id,
      clusterId: cycle.clusterId,
      state: cycle.state,
      cycleHash: cycle.cycleHash,
      previousCycleHash: cycle.previousCycleHash,
      totalEnergyWh: cycle.totalEnergyWh.toString(),
      totalValueNgwee: cycle.totalBuyerGrossNgwee.toString(),
      obligationCount: cycle.buyerObligations.length,
      entitlementCount: cycle.contributorEntitlements.length,
      timestamp: Date.now()
    };
  }