/**
 * Settlement Cycle (Hardened)
 * BigInt-based settlement cycle model
 * Infrastructure-grade arithmetic
 */
import { Ngwee, WattHours } from './settlement-types';
export declare enum SettlementState {
    OPEN = "OPEN",
    RECONCILED = "RECONCILED",
    NETTED = "NETTED",
    FINALIZED = "FINALIZED",
    ANCHORED = "ANCHORED"
}
export interface BuyerObligation {
    buyerId: string;
    energyWh: WattHours;
    grossAmountNgwee: Ngwee;
    feesNgwee: Ngwee;
    netPayableNgwee: Ngwee;
}
export interface ContributorEntitlement {
    contributorId: string;
    energyWh: WattHours;
    grossAmountNgwee: Ngwee;
    feesNgwee: Ngwee;
    netReceivableNgwee: Ngwee;
}
export interface NettedTransfer {
    fromAccountId: string;
    toAccountId: string;
    amountNgwee: Ngwee;
}
export interface SettlementCycle {
    id: string;
    clusterId: string;
    startTimestamp: number;
    endTimestamp: number;
    state: SettlementState;
    buyerObligations: BuyerObligation[];
    contributorEntitlements: ContributorEntitlement[];
    totalBuyerGrossNgwee: Ngwee;
    totalContributorGrossNgwee: Ngwee;
    totalFeesNgwee: Ngwee;
    totalEnergyWh: WattHours;
    nettedTransfers: NettedTransfer[];
    previousCycleHash?: string;
    cycleHash?: string;
}
export declare function createSettlementCycle(id: string, clusterId: string, startTimestamp: number, endTimestamp: number): SettlementCycle;
export declare function createBuyerObligation(buyerId: string, energyWh: WattHours, grossAmountNgwee: Ngwee, feesNgwee: Ngwee): BuyerObligation;
export declare function createContributorEntitlement(contributorId: string, energyWh: WattHours, grossAmountNgwee: Ngwee, feesNgwee: Ngwee): ContributorEntitlement;
export interface SerializedBuyerObligation {
    buyerId: string;
    energyWh: string;
    grossAmountNgwee: string;
    feesNgwee: string;
    netPayableNgwee: string;
}
export interface SerializedContributorEntitlement {
    contributorId: string;
    energyWh: string;
    grossAmountNgwee: string;
    feesNgwee: string;
    netReceivableNgwee: string;
}
export interface SerializedSettlementCycle {
    id: string;
    clusterId: string;
    startTimestamp: number;
    endTimestamp: number;
    state: SettlementState;
    buyerObligations: SerializedBuyerObligation[];
    contributorEntitlements: SerializedContributorEntitlement[];
    totalBuyerGrossNgwee: string;
    totalContributorGrossNgwee: string;
    totalFeesNgwee: string;
    totalEnergyWh: string;
    nettedTransfers: {
        fromAccountId: string;
        toAccountId: string;
        amountNgwee: string;
    }[];
    previousCycleHash?: string;
    cycleHash?: string;
}
export declare function serializeSettlementCycle(cycle: SettlementCycle): SerializedSettlementCycle;
export declare function deserializeSettlementCycle(data: SerializedSettlementCycle): SettlementCycle;

