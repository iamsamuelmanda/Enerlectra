/**
 * Treasury Types
 * External boundary accounts and payment rail definitions
 */
// ═══════════════════════════════════════════════════════════════
// PAYMENT RAILS
// ═══════════════════════════════════════════════════════════════
export var PaymentRail;
(function (PaymentRail) {
    PaymentRail["MTN"] = "MTN";
    PaymentRail["AIRTEL"] = "AIRTEL";
    PaymentRail["BANK"] = "BANK";
    PaymentRail["STABLECOIN"] = "STABLECOIN";
})(PaymentRail || (PaymentRail = {}));
export var RailStatus;
(function (RailStatus) {
    RailStatus["ACTIVE"] = "ACTIVE";
    RailStatus["DEGRADED"] = "DEGRADED";
    RailStatus["SUSPENDED"] = "SUSPENDED";
    RailStatus["DISABLED"] = "DISABLED";
})(RailStatus || (RailStatus = {}));
// ═══════════════════════════════════════════════════════════════
// TREASURY ACCOUNT TYPES (Extends existing AccountType)
// ═══════════════════════════════════════════════════════════════
export var TreasuryAccountType;
(function (TreasuryAccountType) {
    // External boundary accounts (per rail)
    TreasuryAccountType["EXTERNAL_ESCROW_MTN"] = "EXTERNAL_ESCROW_MTN";
    TreasuryAccountType["EXTERNAL_ESCROW_AIRTEL"] = "EXTERNAL_ESCROW_AIRTEL";
    TreasuryAccountType["EXTERNAL_ESCROW_BANK"] = "EXTERNAL_ESCROW_BANK";
    TreasuryAccountType["EXTERNAL_ESCROW_STABLECOIN"] = "EXTERNAL_ESCROW_STABLECOIN";
    // Internal anchor
    TreasuryAccountType["TREASURY_INTERNAL"] = "TREASURY_INTERNAL";
    // Reserve accounts
    TreasuryAccountType["FEE_RESERVE"] = "FEE_RESERVE";
    TreasuryAccountType["INSURANCE_RESERVE"] = "INSURANCE_RESERVE";
    TreasuryAccountType["OPERATIONAL_RESERVE"] = "OPERATIONAL_RESERVE";
})(TreasuryAccountType || (TreasuryAccountType = {}));
export var PayoutStatus;
(function (PayoutStatus) {
    PayoutStatus["RESERVED"] = "RESERVED";
    PayoutStatus["INITIATED"] = "INITIATED";
    PayoutStatus["PENDING"] = "PENDING";
    PayoutStatus["COMPLETED"] = "COMPLETED";
    PayoutStatus["FAILED"] = "FAILED";
    PayoutStatus["REVERSED"] = "REVERSED"; // Was completed, then reversed
})(PayoutStatus || (PayoutStatus = {}));
export var TreasuryOperationType;
(function (TreasuryOperationType) {
    TreasuryOperationType["INBOUND_SETTLEMENT"] = "INBOUND_SETTLEMENT";
    TreasuryOperationType["OUTBOUND_PAYOUT"] = "OUTBOUND_PAYOUT";
    TreasuryOperationType["RAIL_REBALANCE"] = "RAIL_REBALANCE";
    TreasuryOperationType["RESERVE_ALLOCATION"] = "RESERVE_ALLOCATION";
    TreasuryOperationType["RESERVE_RELEASE"] = "RESERVE_RELEASE"; // From reserves
})(TreasuryOperationType || (TreasuryOperationType = {}));
