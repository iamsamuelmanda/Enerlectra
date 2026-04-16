import { SETTLEMENT_STATES } from "./settlementState";
export const SettlementPolicy = {
    canContribute(state) {
        return state === SETTLEMENT_STATES.DRAFT;
    },
    canUndo(state) {
        return state === SETTLEMENT_STATES.DRAFT;
    },
    canSimulate(state) {
        return state !== SETTLEMENT_STATES.FINAL;
    },
    canFinalize(state) {
        return state === SETTLEMENT_STATES.PREVIEW;
    },
};
