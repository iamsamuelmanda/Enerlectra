/**
 * Account Domain Model
 * Core types for double-entry ledger system
 */
export var AccountType;
(function (AccountType) {
    AccountType["CONTRIBUTOR"] = "CONTRIBUTOR";
    AccountType["CLUSTER_POOL"] = "CLUSTER_POOL";
    AccountType["RESERVE"] = "RESERVE";
    AccountType["IMBALANCE"] = "IMBALANCE";
    AccountType["SYSTEM"] = "SYSTEM";
})(AccountType || (AccountType = {}));
export var AccountUnit;
(function (AccountUnit) {
    AccountUnit["KWH"] = "KWH";
    AccountUnit["ZMW"] = "ZMW";
})(AccountUnit || (AccountUnit = {}));
