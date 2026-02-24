// server/services/settlementsSupabase.ts
import { supabase } from '../lib/supabase';
import {
  Settlement,
  ParticipantSettlement,
} from '../../enerlectra-core/src/domain/marketplace/engines/SettlementEngine';

function mapSettlementRow(row: any): Settlement {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    snapshotId: row.snapshot_id,
    lifecycleState: row.lifecycle_state,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    timestamp: row.created_at,

    allocatedKwh: Number(row.allocated_kwh),
    actualKwhGenerated: Number(row.actual_kwh_generated),
    utilizationPct: Number(row.utilization_pct),
    surplusKwh: Number(row.surplus_kwh),

    totalValueZMW: Number(row.total_value_zmw),
    distributedValueZMW: Number(row.distributed_value_zmw),
    surplusValueZMW: Number(row.surplus_value_zmw),

    participantCount: row.participant_count,
    settlements: (row.participant_settlements || []).map((ps: any) => ({
      userId: ps.userId,
      userName: ps.userName,
      allocatedKwh: Number(ps.allocatedKwh),
      actualKwh: Number(ps.actualKwh),
      valueZMW: Number(ps.valueZMW),
      distributionMethod: ps.distributionMethod,
      status: ps.status,
      transactionId: ps.transactionId,
    })),

    status: row.status,
    completedAt: row.completed_at,

    calculationTrace: row.calculation_trace,

    previousSettlementId: row.previous_settlement_id,
    hash: row.hash,

    metadata: row.metadata,
  };
}

/**
 * Create settlement (append-only) + participant_settlements
 */
export async function createSettlement(
  settlement: Settlement,
): Promise<Settlement> {
  // Insert settlement
  const { error: setError } = await supabase.from('settlements').insert({
    id: settlement.id,
    cluster_id: settlement.clusterId,
    snapshot_id: settlement.snapshotId,
    lifecycle_state: settlement.lifecycleState,
    period_start: settlement.periodStart,
    period_end: settlement.periodEnd,
    allocated_kwh: settlement.allocatedKwh,
    actual_kwh_generated: settlement.actualKwhGenerated,
    utilization_pct: settlement.utilizationPct,
    surplus_kwh: settlement.surplusKwh,
    total_value_zmw: settlement.totalValueZMW,
    distributed_value_zmw: settlement.distributedValueZMW,
    surplus_value_zmw: settlement.surplusValueZMW,
    participant_count: settlement.participantCount,
    status: settlement.status,
    calculation_trace: settlement.calculationTrace,
    previous_settlement_id: settlement.previousSettlementId,
    hash: settlement.hash,
    metadata: settlement.metadata ?? null,
  });

  if (setError) {
    console.error('createSettlement settlement insert error', setError);
    throw setError;
  }

  // Insert participant settlements
  if (settlement.settlements && settlement.settlements.length > 0) {
    const participantRows = settlement.settlements.map((p) => ({
      settlement_id: settlement.id,
      user_id: p.userId,
      user_name: p.userName,
      allocated_kwh: p.allocatedKwh,
      actual_kwh: p.actualKwh,
      value_zmw: p.valueZMW,
      distribution_method: p.distributionMethod,
      status: p.status,
      transaction_id: p.transactionId ?? null,
    }));

    const { error: partError } = await supabase
      .from('participant_settlements')
      .insert(participantRows);

    if (partError) {
      console.error(
        'createSettlement participant_settlements insert error',
        partError,
      );
      throw partError;
    }
  }

  return settlement;
}

/**
 * Update settlement status (PROCESSING | COMPLETED | FAILED)
 */
export async function updateSettlementStatus(
  settlementId: string,
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
): Promise<Settlement> {
  const { data, error } = await supabase
    .from('settlements')
    .update({
      status,
      completed_at:
        status === 'COMPLETED' || status === 'FAILED'
          ? new Date().toISOString()
          : undefined,
    })
    .eq('id', settlementId)
    .select('*')
    .single();

  if (error || !data) {
    console.error('updateSettlementStatus error', error);
    throw new Error(`Settlement ${settlementId} not found`);
  }

  // Load with participants
  const full = await getSettlementById(settlementId);
  if (!full) throw new Error(`Settlement ${settlementId} not found after update`);
  return full;
}

/**
 * Update participant settlement status
 */
export async function updateParticipantSettlementStatus(
  participantSettlementId: string,
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
  transactionId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('participant_settlements')
    .update({
      status,
      transaction_id: transactionId ?? undefined,
      completed_at:
        status === 'COMPLETED' || status === 'FAILED'
          ? new Date().toISOString()
          : undefined,
    })
    .eq('id', participantSettlementId);

  if (error) {
    console.error('updateParticipantSettlementStatus error', error);
    throw error;
  }
}

/**
 * Get settlement by ID (with participants)
 */
export async function getSettlementById(
  settlementId: string,
): Promise<Settlement | null> {
  const { data, error } = await supabase
    .from('settlements')
    .select(
      `
      *,
      participant_settlements (
        user_id,
        user_name,
        allocated_kwh,
        actual_kwh,
        value_zmw,
        distribution_method,
        status,
        transaction_id
      )
    `,
    )
    .eq('id', settlementId)
    .maybeSingle();

  if (error) {
    console.error('getSettlementById error', error);
    throw error;
  }

  if (!data) return null;

  const row: any = {
    ...data,
    participant_settlements: (data.participant_settlements || []).map(
      (ps: any) => ({
        userId: ps.user_id,
        userName: ps.user_name,
        allocatedKwh: ps.allocated_kwh,
        actualKwh: ps.actual_kwh,
        valueZMW: ps.value_zmw,
        distributionMethod: ps.distribution_method,
        status: ps.status,
        transactionId: ps.transaction_id,
      }),
    ),
  };

  return mapSettlementRow(row);
}

/**
 * Get latest settlement for a cluster
 */
export async function getLatestSettlementForCluster(
  clusterId: string,
): Promise<Settlement | null> {
  const { data, error } = await supabase
    .from('settlements')
    .select(
      `
      *,
      participant_settlements (
        user_id,
        user_name,
        allocated_kwh,
        actual_kwh,
        value_zmw,
        distribution_method,
        status,
        transaction_id
      )
    `,
    )
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getLatestSettlementForCluster error', error);
    throw error;
  }

  if (!data) return null;

  const row: any = {
    ...data,
    participant_settlements: (data.participant_settlements || []).map(
      (ps: any) => ({
        userId: ps.user_id,
        userName: ps.user_name,
        allocatedKwh: ps.allocated_kwh,
        actualKwh: ps.actual_kwh,
        valueZMW: ps.value_zmw,
        distributionMethod: ps.distribution_method,
        status: ps.status,
        transactionId: ps.transaction_id,
      }),
    ),
  };

  return mapSettlementRow(row);
}

/**
 * Get settlement history for cluster
 */
export async function getSettlementHistoryForCluster(
  clusterId: string,
  limit: number = 10,
): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select(
      `
      *,
      participant_settlements (
        user_id,
        user_name,
        allocated_kwh,
        actual_kwh,
        value_zmw,
        distribution_method,
        status,
        transaction_id
      )
    `,
    )
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getSettlementHistoryForCluster error', error);
    throw error;
  }

  return (data || []).map((row: any) =>
    mapSettlementRow({
      ...row,
      participant_settlements: (row.participant_settlements || []).map(
        (ps: any) => ({
          userId: ps.user_id,
          userName: ps.user_name,
          allocatedKwh: ps.allocated_kwh,
          actualKwh: ps.actual_kwh,
          valueZMW: ps.value_zmw,
          distributionMethod: ps.distribution_method,
          status: ps.status,
          transactionId: ps.transaction_id,
        }),
      ),
    }),
  );
}

/**
 * Get user settlement history (flat ParticipantSettlement list)
 */
export async function getUserSettlements(
  userId: string,
  limit: number = 10,
): Promise<ParticipantSettlement[]> {
  const { data, error } = await supabase
    .from('participant_settlements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getUserSettlements error', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    userId: row.user_id,
    userName: row.user_name,
    allocatedKwh: Number(row.allocated_kwh),
    actualKwh: Number(row.actual_kwh),
    valueZMW: Number(row.value_zmw),
    distributionMethod: row.distribution_method,
    status: row.status,
    transactionId: row.transaction_id,
  }));
}
