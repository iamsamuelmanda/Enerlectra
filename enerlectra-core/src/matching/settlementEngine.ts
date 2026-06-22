import { reconcileEnergyAllocation } from '../engines/reconciliation.js';
import type {
  ReconciliationInput,
  ReconciliationResult,
} from '../engines/reconciliation.js';

export type {
  ReconciliationInput,
  ReconciliationResult,
  MeterReading as CoreMeterReading,
  OwnershipEntry,
} from '../engines/reconciliation.js';

export type MeterReading = {
  userId: string;
  clusterId: string;
  timestamp: string;
  kwh: number;
};

export type UserSnapshot = {
  userId: string;
  clusterId: string;
  ownershipPct: number;
};

export type SettlementResult = {
  userId: string;
  clusterId: string;
  period: string;
  openingKwh: number;
  currentKwh: number;
  deltaKwh: number;
  entitledKwh: number;
  netKwh: number;
  amountZmw: number;
  direction: 'CREDIT' | 'DEBIT' | 'FLAT';
};

export type SettlementLedgerEntry = {
  id: string;
  userId: string;
  clusterId: string;
  period: string;
  deltaKwh: number;
  ratePerKwh: number;
  amountZmw: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  createdAt: string;
  txReference?: string;
};

function toCoreReadings(readings: MeterReading[]): ReconciliationInput['readings'] {
  return readings.map(r => ({
    clusterId: r.clusterId,
    unitId: 'default',
    userId: r.userId,
    readingKwh: r.kwh,
    meterType: 'unknown',
    reportingPeriod: r.timestamp.slice(0, 7),
  }));
}

function toCoreOwnership(users: UserSnapshot[]): ReconciliationInput['ownership'] {
  return users.map(u => ({
    userId: u.userId,
    ownershipPct: u.ownershipPct,
  }));
}

function makeLedgerId(clusterId: string, userId: string, period: string): string {
  return `stl_${clusterId}_${userId}_${period}_${Date.now()}`;
}

function getPeriod(readings: MeterReading[]): string {
  return readings[0]?.timestamp?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
}

export function computeSettlements(params: {
  readings: MeterReading[];
  previousReadings: Map<string, number>;
  users: UserSnapshot[];
  ratePerKwh: number;
  idempotencySet?: Set<string>;
}): {
  results: SettlementResult[];
  ledger: SettlementLedgerEntry[];
} {
  const { readings, previousReadings, users, ratePerKwh, idempotencySet } = params;

  if (!readings.length || !users.length || ratePerKwh <= 0) {
    return { results: [], ledger: [] };
  }

  const clusterIds = [...new Set(readings.map(r => r.clusterId))];
  const allResults: SettlementResult[] = [];
  const allLedger: SettlementLedgerEntry[] = [];

  for (const clusterId of clusterIds) {
    const clusterReadings = readings.filter(r => r.clusterId === clusterId);
    const clusterUsers = users.filter(u => u.clusterId === clusterId);

    if (clusterReadings.length === 0 || clusterUsers.length === 0) continue;

    const clusterOwnership = toCoreOwnership(clusterUsers);
    const coreReadings = toCoreReadings(clusterReadings);
    const period = getPeriod(clusterReadings);

    const coreResult: ReconciliationResult = reconcileEnergyAllocation({
      readings: coreReadings,
      ownership: clusterOwnership,
      clusterId,
      period,
    });

    for (const alloc of coreResult.allocations) {
      const currentKwh = alloc.allocatedKwh;
      const openingKwh = previousReadings.get(`${alloc.userId}:${clusterId}`) ?? 0;
      const deltaKwh = currentKwh - openingKwh;
      const netKwh = alloc.netKwh;
      const amountZmw = Math.abs(netKwh) * ratePerKwh;
      const direction: SettlementResult['direction'] =
        netKwh > 0 ? 'DEBIT' : netKwh < 0 ? 'CREDIT' : 'FLAT';

      const idempotencyKey = `${alloc.userId}-${clusterId}-${period}-${deltaKwh}-${netKwh}`;
      if (idempotencySet?.has(idempotencyKey)) continue;
      idempotencySet?.add(idempotencyKey);

      allResults.push({
        userId: alloc.userId,
        clusterId,
        period,
        openingKwh,
        currentKwh,
        deltaKwh,
        entitledKwh: currentKwh,
        netKwh,
        amountZmw,
        direction,
      });

      allLedger.push({
        id: makeLedgerId(clusterId, alloc.userId, period),
        userId: alloc.userId,
        clusterId,
        period,
        deltaKwh,
        ratePerKwh,
        amountZmw,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return { results: allResults, ledger: allLedger };
}
