/**
 * Settlement Transitions
 * Handles state machine transitions with invariant enforcement
 */
import { EEState } from './settlement-state.enum';
import { SettlementCycle } from './settlement-cycle';
/**
 * Transition settlement cycle to next state
 * Enforces state machine rules and updates timestamps
 */
export declare function transitionState(cycle: SettlementCycle, next_state: EEState): SettlementCycle;
/**
 * Assert value computation is correct
 * Invariant: total_value === kwh_verified * price_per_kwh
 */
export declare function assertValueComputation(cycle: SettlementCycle): void;
/**
 * Verify state hash integrity
 */
export declare function verifyStateHash(cycle: SettlementCycle): boolean;
/**
 * Check if cycle can transition to finalized
 */
export declare function canFinalize(cycle: SettlementCycle): boolean;
