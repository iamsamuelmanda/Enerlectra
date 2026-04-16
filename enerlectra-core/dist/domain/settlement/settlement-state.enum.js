/**
 * Settlement State Enum
 * Defines the states in the Enerlectra Engine (EE) state machine
 */
export var EEState;
(function (EEState) {
    // Initial operational state
    EEState["OPERATIONAL"] = "OPERATIONAL";
    // Production reporting and validation
    EEState["PRODUCTION_REPORTED"] = "PRODUCTION_REPORTED";
    // Economic value computation
    EEState["VALUE_COMPUTED"] = "VALUE_COMPUTED";
    // Entitlement allocation to contributors
    EEState["ENTITLEMENTS_ALLOCATED"] = "ENTITLEMENTS_ALLOCATED";
    // Settlement computation
    EEState["SETTLEMENT_COMPUTED"] = "SETTLEMENT_COMPUTED";
    // Ledger balance verification
    EEState["BALANCES_NETTED"] = "BALANCES_NETTED";
    // Reconciliation complete
    EEState["RECONCILIATION_COMPLETE"] = "RECONCILIATION_COMPLETE";
    // Finality window (24 hours)
    EEState["FINALITY_PENDING"] = "FINALITY_PENDING";
    // Final state - triggers payout
    EEState["SETTLEMENT_FINALIZED"] = "SETTLEMENT_FINALIZED";
})(EEState || (EEState = {}));
/**
 * Allowed state transitions
 * Enforces deterministic state machine behavior
 */
export const ALLOWED_TRANSITIONS = {
    [EEState.OPERATIONAL]: [EEState.PRODUCTION_REPORTED],
    [EEState.PRODUCTION_REPORTED]: [EEState.VALUE_COMPUTED],
    [EEState.VALUE_COMPUTED]: [EEState.ENTITLEMENTS_ALLOCATED],
    [EEState.ENTITLEMENTS_ALLOCATED]: [EEState.SETTLEMENT_COMPUTED],
    [EEState.SETTLEMENT_COMPUTED]: [EEState.BALANCES_NETTED],
    [EEState.BALANCES_NETTED]: [EEState.RECONCILIATION_COMPLETE],
    [EEState.RECONCILIATION_COMPLETE]: [EEState.FINALITY_PENDING],
    [EEState.FINALITY_PENDING]: [EEState.SETTLEMENT_FINALIZED],
    [EEState.SETTLEMENT_FINALIZED]: []
};
/**
 * Validate a state transition
 */
export function validateTransition(current, next) {
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
        throw new Error(`Invalid transition: ${current} → ${next}. Allowed: ${allowed.join(', ')}`);
    }
}
/**
 * Check if a state is terminal
 */
export function isTerminalState(state) {
    return state === EEState.SETTLEMENT_FINALIZED;
}
/**
 * Check if a state allows challenge
 */
export function isChallengeableState(state) {
    return state === EEState.FINALITY_PENDING;
}
