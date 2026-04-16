/**
 * Payment Intent Types
 * State machine for buyer payment orchestration
 */
// ═══════════════════════════════════════════════════════════════
// PAYMENT INTENT STATE MACHINE
// ═══════════════════════════════════════════════════════════════
export var PaymentIntentState;
(function (PaymentIntentState) {
    PaymentIntentState["CREATED"] = "CREATED";
    PaymentIntentState["RESERVED"] = "RESERVED";
    PaymentIntentState["INITIATED"] = "INITIATED";
    PaymentIntentState["AWAITING_CONFIRMATION"] = "AWAITING_CONFIRMATION";
    PaymentIntentState["CONFIRMED"] = "CONFIRMED";
    PaymentIntentState["SETTLED"] = "SETTLED";
    PaymentIntentState["FAILED"] = "FAILED";
    PaymentIntentState["EXPIRED"] = "EXPIRED";
    PaymentIntentState["CANCELLED"] = "CANCELLED"; // User cancelled before initiation
})(PaymentIntentState || (PaymentIntentState = {}));
// ═══════════════════════════════════════════════════════════════
// STATE TRANSITIONS (Enforced by state machine)
// ═══════════════════════════════════════════════════════════════
export const ALLOWED_PAYMENT_TRANSITIONS = {
    [PaymentIntentState.CREATED]: [
        PaymentIntentState.RESERVED,
        PaymentIntentState.CANCELLED
    ],
    [PaymentIntentState.RESERVED]: [
        PaymentIntentState.INITIATED,
        PaymentIntentState.EXPIRED,
        PaymentIntentState.CANCELLED
    ],
    [PaymentIntentState.INITIATED]: [
        PaymentIntentState.AWAITING_CONFIRMATION,
        PaymentIntentState.FAILED
    ],
    [PaymentIntentState.AWAITING_CONFIRMATION]: [
        PaymentIntentState.CONFIRMED,
        PaymentIntentState.FAILED,
        PaymentIntentState.EXPIRED
    ],
    [PaymentIntentState.CONFIRMED]: [
        PaymentIntentState.SETTLED
    ],
    [PaymentIntentState.SETTLED]: [], // Terminal
    [PaymentIntentState.FAILED]: [], // Terminal
    [PaymentIntentState.EXPIRED]: [], // Terminal
    [PaymentIntentState.CANCELLED]: [] // Terminal
};
// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
export function isTerminalState(state) {
    return ALLOWED_PAYMENT_TRANSITIONS[state].length === 0;
}
export function isSuccessState(state) {
    return state === PaymentIntentState.SETTLED;
}
export function isFailureState(state) {
    return state === PaymentIntentState.FAILED ||
        state === PaymentIntentState.EXPIRED ||
        state === PaymentIntentState.CANCELLED;
}
export function canTransitionTo(currentState, targetState) {
    return ALLOWED_PAYMENT_TRANSITIONS[currentState].includes(targetState);
}
