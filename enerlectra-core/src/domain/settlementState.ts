export type SettlementState = "DRAFT" | "PREVIEW" | "FINAL";

export const SETTLEMENT_STATES: Record<SettlementState, SettlementState> = {
  DRAFT: "DRAFT",
  PREVIEW: "PREVIEW",
  FINAL: "FINAL",
};
