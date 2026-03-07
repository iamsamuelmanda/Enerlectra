/**
 * Settlement Cycle (Hardened)
 * BigInt-based settlement cycle model
 * Infrastructure-grade arithmetic
 */

import {
    Ngwee,
    WattHours,
    ngwee,
    wattHours,
    ZERO_NGWEE,
    ZERO_WH
  } from './settlement-types';
  
  // ═══════════════════════════════════════════════════════════════
  // SETTLEMENT STATE MACHINE
  // ═══════════════════════════════════════════════════════════════
  
  export enum SettlementState {
    OPEN = 'OPEN',
    RECONCILED = 'RECONCILED',
    NETTED = 'NETTED',
    FINALIZED = 'FINALIZED',
    ANCHORED = 'ANCHORED'
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CORE DATA STRUCTURES
  // ═══════════════════════════════════════════════════════════════
  
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
  
    // Totals (BigInt)
    totalBuyerGrossNgwee: Ngwee;
    totalContributorGrossNgwee: Ngwee;
    totalFeesNgwee: Ngwee;
    totalEnergyWh: WattHours;
  
    nettedTransfers: NettedTransfer[];
  
    // Hash chain
    previousCycleHash?: string;
    cycleHash?: string;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FACTORY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════
  
  export function createSettlementCycle(
    id: string,
    clusterId: string,
    startTimestamp: number,
    endTimestamp: number
  ): SettlementCycle {
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
  
  export function createBuyerObligation(
    buyerId: string,
    energyWh: WattHours,
    grossAmountNgwee: Ngwee,
    feesNgwee: Ngwee
  ): BuyerObligation {
    return {
      buyerId,
      energyWh,
      grossAmountNgwee,
      feesNgwee,
      netPayableNgwee: (grossAmountNgwee - feesNgwee) as Ngwee
    };
  }
  
  export function createContributorEntitlement(
    contributorId: string,
    energyWh: WattHours,
    grossAmountNgwee: Ngwee,
    feesNgwee: Ngwee
  ): ContributorEntitlement {
    return {
      contributorId,
      energyWh,
      grossAmountNgwee,
      feesNgwee,
      netReceivableNgwee: (grossAmountNgwee - feesNgwee) as Ngwee
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SERIALIZATION (For database storage)
  // ═══════════════════════════════════════════════════════════════
  
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
    nettedTransfers: { fromAccountId: string; toAccountId: string; amountNgwee: string }[];
    previousCycleHash?: string;
    cycleHash?: string;
  }
  
  export function serializeSettlementCycle(cycle: SettlementCycle): SerializedSettlementCycle {
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
  
  export function deserializeSettlementCycle(data: SerializedSettlementCycle): SettlementCycle {
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