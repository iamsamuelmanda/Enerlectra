/**
 * Settlement Cycle (Hardened)
 * BigInt-based settlement cycle model
 * Infrastructure-grade arithmetic
 */
import { ngwee, wattHours, ZERO_NGWEE, ZERO_WH } from './settlement-types';
// ═══════════════════════════════════════════════════════════════
// SETTLEMENT STATE MACHINE
// ═══════════════════════════════════════════════════════════════
export var SettlementState;
(function (SettlementState) {
    SettlementState["OPEN"] = "OPEN";
    SettlementState["RECONCILED"] = "RECONCILED";
    SettlementState["NETTED"] = "NETTED";
    SettlementState["FINALIZED"] = "FINALIZED";
    SettlementState["ANCHORED"] = "ANCHORED";
})(SettlementState || (SettlementState = {}));
// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
export function createSettlementCycle(id, clusterId, startTimestamp, endTimestamp) {
    return {
        id,
        clusterId,
        startTimestamp,
        endTimestamp,
        state: SettlementState.OPEN,
        buyerObligations: [],
        contributorEntitlements: [],
        totalBuyerGrossNgwee: ZERO_NGWEE,
        totalContributorGrossNgwee: ZERO_NGWEE,
        totalFeesNgwee: ZERO_NGWEE,
        totalEnergyWh: ZERO_WH,
        nettedTransfers: []
    };
}
export function createBuyerObligation(buyerId, energyWh, grossAmountNgwee, feesNgwee) {
    return {
        buyerId,
        energyWh,
        grossAmountNgwee,
        feesNgwee,
        netPayableNgwee: (grossAmountNgwee - feesNgwee)
    };
}
export function createContributorEntitlement(contributorId, energyWh, grossAmountNgwee, feesNgwee) {
    return {
        contributorId,
        energyWh,
        grossAmountNgwee,
        feesNgwee,
        netReceivableNgwee: (grossAmountNgwee - feesNgwee)
    };
}
export function serializeSettlementCycle(cycle) {
    return {
        id: cycle.id,
        clusterId: cycle.clusterId,
        startTimestamp: cycle.startTimestamp,
        endTimestamp: cycle.endTimestamp,
        state: cycle.state,
        buyerObligations: cycle.buyerObligations.map(o => ({
            buyerId: o.buyerId,
            energyWh: o.energyWh.toString(),
            grossAmountNgwee: o.grossAmountNgwee.toString(),
            feesNgwee: o.feesNgwee.toString(),
            netPayableNgwee: o.netPayableNgwee.toString()
        })),
        contributorEntitlements: cycle.contributorEntitlements.map(e => ({
            contributorId: e.contributorId,
            energyWh: e.energyWh.toString(),
            grossAmountNgwee: e.grossAmountNgwee.toString(),
            feesNgwee: e.feesNgwee.toString(),
            netReceivableNgwee: e.netReceivableNgwee.toString()
        })),
        totalBuyerGrossNgwee: cycle.totalBuyerGrossNgwee.toString(),
        totalContributorGrossNgwee: cycle.totalContributorGrossNgwee.toString(),
        totalFeesNgwee: cycle.totalFeesNgwee.toString(),
        totalEnergyWh: cycle.totalEnergyWh.toString(),
        nettedTransfers: cycle.nettedTransfers.map(t => ({
            fromAccountId: t.fromAccountId,
            toAccountId: t.toAccountId,
            amountNgwee: t.amountNgwee.toString()
        })),
        previousCycleHash: cycle.previousCycleHash,
        cycleHash: cycle.cycleHash
    };
}
export function deserializeSettlementCycle(data) {
    return {
        id: data.id,
        clusterId: data.clusterId,
        startTimestamp: data.startTimestamp,
        endTimestamp: data.endTimestamp,
        state: data.state,
        buyerObligations: data.buyerObligations.map(o => ({
            buyerId: o.buyerId,
            energyWh: wattHours(BigInt(o.energyWh)),
            grossAmountNgwee: ngwee(BigInt(o.grossAmountNgwee)),
            feesNgwee: ngwee(BigInt(o.feesNgwee)),
            netPayableNgwee: ngwee(BigInt(o.netPayableNgwee))
        })),
        contributorEntitlements: data.contributorEntitlements.map(e => ({
            contributorId: e.contributorId,
            energyWh: wattHours(BigInt(e.energyWh)),
            grossAmountNgwee: ngwee(BigInt(e.grossAmountNgwee)),
            feesNgwee: ngwee(BigInt(e.feesNgwee)),
            netReceivableNgwee: ngwee(BigInt(e.netReceivableNgwee))
        })),
        totalBuyerGrossNgwee: ngwee(BigInt(data.totalBuyerGrossNgwee)),
        totalContributorGrossNgwee: ngwee(BigInt(data.totalContributorGrossNgwee)),
        totalFeesNgwee: ngwee(BigInt(data.totalFeesNgwee)),
        totalEnergyWh: wattHours(BigInt(data.totalEnergyWh)),
        nettedTransfers: data.nettedTransfers.map(t => ({
            fromAccountId: t.fromAccountId,
            toAccountId: t.toAccountId,
            amountNgwee: ngwee(BigInt(t.amountNgwee))
        })),
        previousCycleHash: data.previousCycleHash,
        cycleHash: data.cycleHash
    };
}
