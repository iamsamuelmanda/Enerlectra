import type { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { reconcileEnergyAllocation } from 'enerlectra-core';
import { mintPCUForExportReading } from './pcuMinting.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export interface SettlementReadingRow {
  id: string;
  cluster_id: string;
  unit_id?: string | null;
  user_id: string;
  reading_kwh: number;
  meter_type: string;
  reporting_period: string;
  validated?: boolean | null;
  metadata?: Record<string, any> | null;
}

export interface OwnershipSnapshotRow {
  user_id: string;
  ownership_pct: number;
}

export interface ClusterAllocationResult {
  userId: string;
  netKwh: number;
  amountZmw: number;
  mintedPcu?: number;
  payoutTriggered?: boolean;
}

export interface ClusterSettlementResult {
  clusterId: string;
  period: string;
  totalGeneration: number;
  totalConsumption: number;
  netKwh: number;
  allocations: ClusterAllocationResult[];
}

export interface ClusterSettlementEngineDeps {
  supabase: SupabaseClient;
  getCurrentTariffRate?: (clusterId: string, period: string) => Promise<number>;
  recordPendingPayout?: (args: {
    userId: string;
    clusterId: string;
    period: string;
    amountZmw: number;
    netKwh: number;
    metadata?: Record<string, any> | null;
  }) => Promise<void>;
}

export class ClusterSettlementEngine {
  constructor(private deps: ClusterSettlementEngineDeps) {}

  async runClusterSettlement(clusterId: string, period: string): Promise<ClusterSettlementResult> {
    const { supabase } = this.deps;
    logger.info({ clusterId, period }, 'Starting cluster settlement');

    const { data: readings, error: readingsError } = await supabase
      .from('meter_readings')
      .select('id, cluster_id, unit_id, user_id, reading_kwh, meter_type, reporting_period, validated, metadata')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', period)
      .eq('validated', true);

    if (readingsError) throw readingsError;
    if (!readings?.length) throw new Error(`No validated readings for cluster ${clusterId} in ${period}`);

    const { data: ownership, error: ownershipError } = await supabase
      .from('ownership_snapshots')
      .select('user_id, ownership_pct')
      .eq('cluster_id', clusterId)
      .eq('period', period);

    if (ownershipError) throw ownershipError;
    if (!ownership?.length) throw new Error(`No ownership snapshot for cluster ${clusterId} in ${period}`);

    const reconciliation = reconcileEnergyAllocation({
      readings: readings.map((r: SettlementReadingRow) => ({
        clusterId: r.cluster_id,
        unitId: r.unit_id || r.user_id,
        userId: r.user_id,
        readingKwh: r.reading_kwh,
        meterType: r.meter_type as 'grid' | 'solar' | 'unit',
        reportingPeriod: r.reporting_period,
        source: 'manual' as const,
      })),
      ownership: ownership.map((o: OwnershipSnapshotRow) => ({
        userId: o.user_id,
        ownershipPct: o.ownership_pct,
      })),
      clusterId,
      period,
    });

    const tariffRate = await this.getTariffRate(clusterId, period);
    const allocations: ClusterAllocationResult[] = [];

    for (const share of reconciliation.unitShares) {
      const netKwh = Number(share.gridSurplusDeficit);
      const amountZmw = Math.abs(netKwh) * tariffRate;
      const entry: ClusterAllocationResult = { userId: share.userId, netKwh, amountZmw };

      if (netKwh > 0) {
        await mintPCUForExportReading({
          id: `settlement-${clusterId}-${period}-${share.userId}`,
          user_id: share.userId,
          cluster_id: clusterId,
          delta_kwh: netKwh,
          meter_type: 'solar_export',
          reporting_period: period,
          source: 'cluster_settlement',
          metadata: { clusterId, period, tariffRate, netKwh },
        } as any);
        entry.mintedPcu = netKwh;
      } else if (netKwh < 0) {
        await this.recordPendingPayout({
          userId: share.userId,
          clusterId,
          period,
          amountZmw,
          netKwh,
          metadata: { clusterId, period, tariffRate },
        });
        entry.payoutTriggered = true;
      }

      allocations.push(entry);
    }

    const settlementRows = allocations.map(a => ({
      cluster_id: clusterId,
      period,
      user_id: a.userId,
      net_kwh: a.netKwh,
      amount_zmw: a.amountZmw,
      status: 'SETTLED',
      updated_at: new Date().toISOString(),
    }));

    const { error: writeError } = await supabase
      .from('settlement_results')
      .upsert(settlementRows, { onConflict: 'cluster_id,period,user_id' });

    if (writeError) throw writeError;

    const totalGeneration = Number(reconciliation.allocation.solarTotalKwh || 0);
    const totalConsumption = Number(reconciliation.allocation.gridTotalKwh || 0);
    const netKwh = totalGeneration - totalConsumption;

    logger.info({ clusterId, period, netKwh }, 'Settlement complete');

    return { clusterId, period, totalGeneration, totalConsumption, netKwh, allocations };
  }

  private async getTariffRate(clusterId: string, period: string): Promise<number> {
    if (this.deps.getCurrentTariffRate) return this.deps.getCurrentTariffRate(clusterId, period);
    return 1.35;
  }

  private async recordPendingPayout(args: {
    userId: string;
    clusterId: string;
    period: string;
    amountZmw: number;
    netKwh: number;
    metadata?: Record<string, any> | null;
  }): Promise<void> {
    if (this.deps.recordPendingPayout) return this.deps.recordPendingPayout(args);

    const { error } = await this.deps.supabase.from('pending_settlement_payouts').insert({
      user_id: args.userId,
      cluster_id: args.clusterId,
      period: args.period,
      amount_zmw: args.amountZmw,
      net_kwh: args.netKwh,
      status: 'PENDING',
      metadata: args.metadata ?? {},
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

export async function runClusterSettlement(clusterId: string, period: string, deps: ClusterSettlementEngineDeps): Promise<ClusterSettlementResult> {
  return new ClusterSettlementEngine(deps).runClusterSettlement(clusterId, period);
}
