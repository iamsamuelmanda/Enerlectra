import { SettlementState, SETTLEMENT_STATES } from "./settlementState";

export class Settlement {
  private state: SettlementState;

  constructor(initialState: SettlementState = SETTLEMENT_STATES.DRAFT) {
    this.state = initialState;
  }

  getState(): SettlementState {
    return this.state;
  }

  private assert(expected: SettlementState): void {
    if (this.state !== expected) {
      throw new Error(
        `Invalid state transition. Expected ${expected}, got ${this.state}`,
      );
    }
  }

  assertDraft(): void {
    this.assert(SETTLEMENT_STATES.DRAFT);
  }

  assertPreview(): void {
    this.assert(SETTLEMENT_STATES.PREVIEW);
  }

  assertFinal(): void {
    this.assert(SETTLEMENT_STATES.FINAL);
  }

  moveToPreview(): void {
    this.assertDraft();
    this.state = SETTLEMENT_STATES.PREVIEW;
  }

  finalize(): void {
    this.assertPreview();
    this.state = SETTLEMENT_STATES.FINAL;
  }
}
