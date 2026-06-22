import { SettlementState } from "./settlementState";
export declare class Settlement {
    private state;
    constructor(initialState?: SettlementState);
    getState(): SettlementState;
    private assert;
    assertDraft(): void;
    assertPreview(): void;
    assertFinal(): void;
    moveToPreview(): void;
    finalize(): void;
}

