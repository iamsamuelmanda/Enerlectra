import { SettlementState, SETTLEMENT_STATES } from "./settlementState";

export const SettlementPolicy = {
  canContribute(state: SettlementState): boolean {
    return state === SETTLEMENT_STATES.DRAFT;
  },

  canUndo(state: SettlementState): boolean {
    return state === SETTLEMENT_STATES.DRAFT;
  },

  canSimulate(state: SettlementState): boolean {
    return state !== SETTLEMENT_STATES.FINAL;
  },

  canFinalize(state: SettlementState): boolean {
    return state === SETTLEMENT_STATES.PREVIEW;
  },
};
