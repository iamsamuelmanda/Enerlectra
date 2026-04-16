import { SettlementState } from "./settlementState";
export declare const SettlementPolicy: {
    canContribute(state: SettlementState): boolean;
    canUndo(state: SettlementState): boolean;
    canSimulate(state: SettlementState): boolean;
    canFinalize(state: SettlementState): boolean;
};
