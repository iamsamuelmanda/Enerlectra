// server/services/snapshotsSupabase.ts
import { supabase } from '../lib/supabase';
import {
  ClusterSnapshot,
} from '../../enerlectra-core/src/domain/marketplace/engines/SnapshotEngine';
import { LifecycleState } from '../../enerlectra-core/src/domain/lifecycle/types';

function mapRow(row: any): ClusterSnapshot {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    version: row.version,
    lifecycleState: row.lifecycle_state as LifecycleState,
    timestamp: new Date(row.created_at),
    triggeredBy: row.triggered_by,

    targetUSD: Number(row.target_usd),
    currentUSD: Number(row.current_usd),
    fundingPct: Number(row.funding_pct),
    totalPCUs: Number(row.total_pcus),

    targetKw: Number(row.target_kw),
    monthlyKwh: Number(row.monthly_kwh),

    participantCount: row.participant_count,
    participants: (row.participants || []).map((p: any) => ({
      userId: p.userId,
      userName: p.userName,
      userClass: p.userClass,
      pcus: Number(p.pcus),
      ownershipPct: Number(p.ownershipPct),
      kwhPerMonth: Number(p.kwhPerMonth),
      monthlyValueZMW: Number(p.monthlyValueZMW),
      contributionCount: p.contributionCount,
      firstContributionAt: new Date(p.firstContributionAt),
      lastContributionAt: new Date(p.lastContributionAt),
      earlyInvestorBonus: Number(p.earlyInvestorBonus),
    })),

    giniCoefficient: Number(row.gini_coefficient),
    herfindahlIndex: Number(row.herfindahl_index),
    largestOwnershipPct: Number(row.largest_ownership_pct),

    calculationTrace: row.calculation_trace,

    previousSnapshotId: row.previous_snapshot_id,
    hash: row.hash,

    metadata: row.metadata,
  };
}

/**
 * Create snapshot (append-only)
 */
export async function createSnapshot(
  snapshot: ClusterSnapshot,
): Promise<ClusterSnapshot> {
  // Insert snapshot
  const { data: snapData, error: snapError } = await supabase
    .from('snapshots')
    .insert({
      id: snapshot.id,
      cluster_id: snapshot.clusterId,
      version: snapshot.version,
      lifecycle_state: snapshot.lifecycleState,
      triggered_by: snapshot.triggeredBy,
      target_usd: snapshot.targetUSD,
      current_usd: snapshot.currentUSD,
      funding_pct: snapshot.fundingPct,
      total_pcus: snapshot.totalPCUs,
      target_kw: snapshot.targetKw,
      monthly_kwh: snapshot.monthlyKwh,
      participant_count: snapshot.participantCount,
      gini_coefficient: snapshot.giniCoefficient,
      herfindahl_index: snapshot.herfindahlIndex,
      largest_ownership_pct: snapshot.largestOwnershipPct,
      calculation_trace: snapshot.calculationTrace,
      previous_snapshot_id: snapshot.previousSnapshotId,
      hash: snapshot.hash,
      metadata: snapshot.metadata ?? null,
    })
    .select('*')
    .single();

  if (snapError) {
    console.error('createSnapshot snapshot insert error', snapError);
    throw snapError;
  }

  // Insert participants
  if (snapshot.participants && snapshot.participants.length > 0) {
    const participantsRows = snapshot.participants.map((p) => ({
      snapshot_id: snapshot.id,
      user_id: p.userId,
      user_name: p.userName,
      user_class: p.userClass,
      pcus: p.pcus,
      ownership_pct: p.ownershipPct,
      kwh_per_month: p.kwhPerMonth,
      monthly_value_zmw: p.monthlyValueZMW,
      contribution_count: p.contributionCount,
      first_contribution_at: p.firstContributionAt,
      last_contribution_at: p.lastContributionAt,
      early_investor_bonus: p.earlyInvestorBonus,
    }));

    const { error: partError } = await supabase
      .from('snapshot_participants')
      .insert(participantsRows);

    if (partError) {
      console.error('createSnapshot participants insert error', partError);
      throw partError;
    }
  }

  // Return the full snapshot including participants
  return snapshot;
}

/**
 * Get snapshot by ID (with participants)
 */
export async function getSnapshotById(
  snapshotId: string,
): Promise<ClusterSnapshot | null> {
  const { data, error } = await supabase
    .from('snapshots')
    .select(
      `
      *,
      snapshot_participants (
        user_id,
        user_name,
        user_class,
        pcus,
        ownership_pct,
        kwh_per_month,
        monthly_value_zmw,
        contribution_count,
        first_contribution_at,
        last_contribution_at,
        early_investor_bonus
      )
    `,
    )
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) {
    console.error('getSnapshotById error', error);
    throw error;
  }

  if (!data) return null;

  const row: any = {
    ...data,
    participants: (data.snapshot_participants || []).map((sp: any) => ({
      userId: sp.user_id,
      userName: sp.user_name,
      userClass: sp.user_class,
      pcus: sp.pcus,
      ownershipPct: sp.ownership_pct,
      kwhPerMonth: sp.kwh_per_month,
      monthlyValueZMW: sp.monthly_value_zmw,
      contributionCount: sp.contribution_count,
      firstContributionAt: sp.first_contribution_at,
      lastContributionAt: sp.last_contribution_at,
      earlyInvestorBonus: sp.early_investor_bonus,
    })),
  };

  return mapRow(row);
}

/**
 * Get latest snapshot for cluster
 */
export async function getLatestSnapshotForCluster(
  clusterId: string,
): Promise<ClusterSnapshot | null> {
  const { data, error } = await supabase
    .from('snapshots')
    .select(
      `
      *,
      snapshot_participants (
        user_id,
        user_name,
        user_class,
        pcus,
        ownership_pct,
        kwh_per_month,
        monthly_value_zmw,
        contribution_count,
        first_contribution_at,
        last_contribution_at,
        early_investor_bonus
      )
    `,
    )
    .eq('cluster_id', clusterId)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getLatestSnapshotForCluster error', error);
    throw error;
  }

  if (!data) return null;

  const row: any = {
    ...data,
    participants: (data.snapshot_participants || []).map((sp: any) => ({
      userId: sp.user_id,
      userName: sp.user_name,
      userClass: sp.user_class,
      pcus: sp.pcus,
      ownershipPct: sp.ownership_pct,
      kwhPerMonth: sp.kwh_per_month,
      monthlyValueZMW: sp.monthly_value_zmw,
      contributionCount: sp.contribution_count,
      firstContributionAt: sp.first_contribution_at,
      lastContributionAt: sp.last_contribution_at,
      earlyInvestorBonus: sp.early_investor_bonus,
    })),
  };

  return mapRow(row);
}

/**
 * Get snapshot history for cluster
 */
export async function getSnapshotHistoryForCluster(
  clusterId: string,
  limit: number = 10,
): Promise<ClusterSnapshot[]> {
  const { data, error } = await supabase
    .from('snapshots')
    .select(
      `
      *,
      snapshot_participants (
        user_id,
        user_name,
        user_class,
        pcus,
        ownership_pct,
        kwh_per_month,
        monthly_value_zmw,
        contribution_count,
        first_contribution_at,
        last_contribution_at,
        early_investor_bonus
      )
    `,
    )
    .eq('cluster_id', clusterId)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getSnapshotHistoryForCluster error', error);
    throw error;
  }

  return (data || []).map((row: any) =>
    mapRow({
      ...row,
      participants: (row.snapshot_participants || []).map((sp: any) => ({
        userId: sp.user_id,
        userName: sp.user_name,
        userClass: sp.user_class,
        pcus: sp.pcus,
        ownershipPct: sp.ownership_pct,
        kwhPerMonth: sp.kwh_per_month,
        monthlyValueZMW: sp.monthly_value_zmw,
        contributionCount: sp.contribution_count,
        firstContributionAt: sp.first_contribution_at,
        lastContributionAt: sp.last_contribution_at,
        earlyInvestorBonus: sp.early_investor_bonus,
      })),
    }),
  );
}

/**
 * Get snapshots by lifecycle state transition
 */
export async function getSnapshotsByStateTransition(
  clusterId: string,
  toState: LifecycleState,
): Promise<ClusterSnapshot[]> {
  const { data, error } = await supabase
    .from('snapshots')
    .select(
      `
      *,
      snapshot_participants (
        user_id,
        user_name,
        user_class,
        pcus,
        ownership_pct,
        kwh_per_month,
        monthly_value_zmw,
        contribution_count,
        first_contribution_at,
        last_contribution_at,
        early_investor_bonus
      )
    `,
    )
    .eq('cluster_id', clusterId)
    .eq('lifecycle_state', toState)
    .eq('triggered_by', 'STATE_TRANSITION')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getSnapshotsByStateTransition error', error);
    throw error;
  }

  return (data || []).map((row: any) =>
    mapRow({
      ...row,
      participants: (row.snapshot_participants || []).map((sp: any) => ({
        userId: sp.user_id,
        userName: sp.user_name,
        userClass: sp.user_class,
        pcus: sp.pcus,
        ownershipPct: sp.ownership_pct,
        kwhPerMonth: sp.kwh_per_month,
        monthlyValueZMW: sp.monthly_value_zmw,
        contributionCount: sp.contribution_count,
        firstContributionAt: sp.first_contribution_at,
        lastContributionAt: sp.last_contribution_at,
        earlyInvestorBonus: sp.early_investor_bonus,
      })),
    }),
  );
}
