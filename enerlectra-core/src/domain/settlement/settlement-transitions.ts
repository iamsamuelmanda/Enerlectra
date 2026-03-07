/**
 * Settlement Transitions
 * Handles state machine transitions with invariant enforcement
 */

import { EEState, validateTransition } from './settlement-state.enum';
import { SettlementCycle, computeStateHash } from './settlement-cycle';

/**
 * Transition settlement cycle to next state
 * Enforces state machine rules and updates timestamps
 */
export function transitionState(
  cycle: SettlementCycle,
  next_state: EEState
): SettlementCycle {
  // Validate transition is allowed
  validateTransition(cycle.state, next_state);

  // Clone cycle
  const updated = { ...cycle };
  updated.state = next_state;

  // Update timestamps based on state
  const now = new Date();

  switch (next_state) {
    case EEState.PRODUCTION_REPORTED:
      updated.production_reported_at = now;
      break;

    case EEState.RECONCILIATION_COMPLETE:
      updated.reconciliation_complete_at = now;
      // Set challenge window (24 hours)
      updated.challenge_window_end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;

    case EEState.FINALITY_PENDING:
      updated.finality_pending_at = now;
      break;

    case EEState.SETTLEMENT_FINALIZED:
      updated.finalized_at = now;
      break;
  }

  // Recompute state hash
  updated.state_hash = computeStateHash(updated);

  return updated;
}

/**
 * Assert value computation is correct
 * Invariant: total_value === kwh_verified * price_per_kwh
 */
export function assertValueComputation(cycle: SettlementCycle): void {
  const computed_value = cycle.kwh_verified * cycle.price_per_kwh;
  
  // Allow tiny floating point error
  if (Math.abs(computed_value - cycle.total_value) > 0.000001) {
    throw new Error(
      `Value computation invariant violated: ` +
      `computed=${computed_value}, stored=${cycle.total_value}`
    );
  }
}

/**
 * Verify state hash integrity
 */
export function verifyStateHash(cycle: SettlementCycle): boolean {
  if (!cycle.state_hash) return false;
  
  const computed_hash = computeStateHash(cycle);
  return computed_hash === cycle.state_hash;
}

/**
 * Check if cycle can transition to finalized
 */
export function canFinalize(cycle: SettlementCycle): boolean {
  if (cycle.state !== EEState.FINALITY_PENDING) return false;
  if (!cycle.challenge_window_end) return false;
  
  return Date.now() >= cycle.challenge_window_end.getTime();
}