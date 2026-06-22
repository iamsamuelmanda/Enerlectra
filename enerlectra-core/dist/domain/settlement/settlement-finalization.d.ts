/**
 * Settlement Finalization (Production-Grade)
 * State machine enforcement with invariant validation
 * Infrastructure-grade settlement logic
 */
import { SettlementCycle, SettlementState } from './settlement-cycle-hardened';
export declare class IllegalStateTransition extends Error {
    constructor(from: SettlementState, to: SettlementState);
}
/**
 * Check if state is terminal (no further transitions allowed)
 */
export declare function isTerminalState(state: SettlementState): boolean;
/**
 * Transition cycle to RECONCILED state
 * Prerequisites:
 * - Current state must be OPEN
 * - Must have obligations and entitlements
 * - Must pass invariant checks
 */
export declare function transitionToReconciled(cycle: SettlementCycle): SettlementCycle;
/**
 * Transition cycle to NETTED state
 * Prerequisites:
 * - Current state must be RECONCILED
 * - Must have netted transfers computed
 * - Must pass invariant checks
 */
export declare function transitionToNetted(cycle: SettlementCycle, nettedTransfers: SettlementCycle['nettedTransfers']): SettlementCycle;
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
export declare function transitionToFinalized(cycle: SettlementCycle, previousCycleHash?: string): SettlementCycle;
/**
 * Transition cycle to ANCHORED state
 * Prerequisites:
 * - Current state must be FINALIZED
 * - Must have cycle hash
 * - Blockchain anchor transaction must exist
 */
export declare function transitionToAnchored(cycle: SettlementCycle, anchorTxHash: string): SettlementCycle;
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
export declare function finalizeSettlementCycle(cycle: SettlementCycle, nettedTransfers: SettlementCycle['nettedTransfers'], previousCycleHash?: string): Promise<FinalizationResult>;
/**
 * Check if cycle can be safely finalized
 * Returns validation errors if any
 */
export declare function canFinalizeCycle(cycle: SettlementCycle): {
    canFinalize: boolean;
    reasons: string[];
};
/**
 * Create corrective cycle (for handling errors)
 * Used when original settlement had issues
 */
export declare function createCorrectiveCycle(originalCycleId: string, clusterId: string, startTimestamp: number, endTimestamp: number): SettlementCycle;
/**
 * Verify settlement cycle integrity
 * Checks all invariants + hash
 */
export declare function verifySettlementIntegrity(cycle: SettlementCycle): {
    valid: boolean;
    issues: string[];
};
/**
 * Export settlement proof for external verification
 */
export declare function exportSettlementProof(cycle: SettlementCycle): {
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
};

