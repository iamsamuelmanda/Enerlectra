/**
 * Settlement State Enum
 * Defines the states in the Enerlectra Engine (EE) state machine
 */
export declare enum EEState {
    OPERATIONAL = "OPERATIONAL",
    PRODUCTION_REPORTED = "PRODUCTION_REPORTED",
    VALUE_COMPUTED = "VALUE_COMPUTED",
    ENTITLEMENTS_ALLOCATED = "ENTITLEMENTS_ALLOCATED",
    SETTLEMENT_COMPUTED = "SETTLEMENT_COMPUTED",
    BALANCES_NETTED = "BALANCES_NETTED",
    RECONCILIATION_COMPLETE = "RECONCILIATION_COMPLETE",
    FINALITY_PENDING = "FINALITY_PENDING",
    SETTLEMENT_FINALIZED = "SETTLEMENT_FINALIZED"
}
/**
 * Allowed state transitions
 * Enforces deterministic state machine behavior
 */
export declare const ALLOWED_TRANSITIONS: Record<EEState, EEState[]>;
/**
 * Validate a state transition
 */
export declare function validateTransition(current: EEState, next: EEState): void;
/**
 * Check if a state is terminal
 */
export declare function isTerminalState(state: EEState): boolean;
/**
 * Check if a state allows challenge
 */
export declare function isChallengeableState(state: EEState): boolean;
