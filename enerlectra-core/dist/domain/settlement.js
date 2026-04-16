import { SETTLEMENT_STATES } from "./settlementState";
export class Settlement {
    constructor(initialState = SETTLEMENT_STATES.DRAFT) {
        this.state = initialState;
    }
    getState() {
        return this.state;
    }
    assert(expected) {
        if (this.state !== expected) {
            throw new Error(`Invalid state transition. Expected ${expected}, got ${this.state}`);
        }
    }
    assertDraft() {
        this.assert(SETTLEMENT_STATES.DRAFT);
    }
    assertPreview() {
        this.assert(SETTLEMENT_STATES.PREVIEW);
    }
    assertFinal() {
        this.assert(SETTLEMENT_STATES.FINAL);
    }
    moveToPreview() {
        this.assertDraft();
        this.state = SETTLEMENT_STATES.PREVIEW;
    }
    finalize() {
        this.assertPreview();
        this.state = SETTLEMENT_STATES.FINAL;
    }
}
