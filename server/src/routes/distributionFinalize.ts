import { Router } from 'express';
import { distributeOutcome } from '../../enerlectra-core/src/engines/distribution.ts';
import { SettlementPolicy } from '../../enerlectra-core/src/domain/settlementPolicy';
import {
  getClusterState,
  setClusterState,
} from '../services/settlementStateSupabase';
import { SETTLEMENT_STATES } from '../../enerlectra-core/src/domain/settlementState';
import {
  getSnapshotById,
  isSnapshotFinalized,
  finalizeSnapshot,
} from '../../enerlectra-core/src/engines/snapshot/snapshotStore.ts';
import { appendAuditEvent } from '../../enerlectra-core/src/engines/audit/auditLog.ts';
import {
  insertFinalDistribution,
  hasFinalDistributionForSnapshot,
  getFinalDistributionFromDb,
} from '../services/distributionSupabase.ts';

const router = Router();

router.post('/finalize', async (req, res) => {
  const { clusterId, snapshotId, totalKwh } = req.body;
  const state = await getClusterState(clusterId);
if (!SettlementPolicy.canFinalize(state)) {
  return res.status(409).json({
    error: `Cannot finalize distribution while cluster is in ${state} state. Expected PREVIEW.`,
  });
}


  if (!clusterId || !snapshotId || totalKwh == null) {
    return res.status(400).json({
      error: 'clusterId, snapshotId, and totalKwh are required',
    });
  }

  const total = Number(totalKwh);
  if (!Number.isFinite(total) || total <= 0) {
    return res.status(400).json({
      error: 'totalKwh must be a number > 0',
    });
  }

  const snapId = String(snapshotId);

  // 1) Idempotency: if already finalized, return existing distribution
  if (isSnapshotFinalized(clusterId, snapId)) {
    try {
      const existing = await getFinalDistributionFromDbBySnapshot(snapId);
      if (!existing) {
        return res.status(500).json({
          error: `Snapshot ${snapId} marked finalized but no distribution record found`,
        });
      }

      return res.status(409).json({
        error: 'Distribution already finalized for this snapshot',
        distribution: existing,
      });
    } catch (err: any) {
      console.error('getFinalDistributionFromDbBySnapshot failed', err);
      return res.status(500).json({
        error:
          err.message ??
          'Failed to load finalized distribution for this snapshot',
      });
    }
  }

  try {
    const already = await hasFinalDistributionForSnapshot(snapId);
    if (already) {
      return res.status(409).json({
        error: 'Distribution already finalized for this snapshot',
      });
    }
  } catch (err: any) {
    console.error('hasFinalDistributionForSnapshot failed', err);
    return res.status(500).json({
      error:
        err.message ?? 'Failed to check existing final distribution for snapshot',
    });
  }

  // 2) Ensure snapshot exists and belongs to this cluster
  let snapshot;
  try {
    snapshot = getSnapshotById(clusterId, snapId);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }

  const ownership = snapshot.effectiveOwnership.map((o: any) => ({
    userId: o.userId,
    pct: o.pct,
  }));

  // 3) Deterministic distribution for this snapshot
  const distribution = distributeOutcome(ownership, total);

  const allocations = distribution.map((d: any) => ({
    userId: d.userId,
    allocatedKwh: d.kwh,
    ownershipPct: d.pct,
  }));

  const distributionId = `dist_${Math.random().toString(36).slice(2, 10)}`;

  // 4) Persist final distribution FIRST (Supabase)
  let record;
  try {
    record = await insertFinalDistribution({
      distributionId,
      clusterId,
      snapshotId: snapId,
      totalKwh: total,
      allocations,
    });
  } catch (err: any) {
    console.error('insertFinalDistribution failed', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to persist final distribution' });
  }

  // 5) Lock snapshot AFTER distribution exists
  try {
    finalizeSnapshot(clusterId, snapId);
  } catch (err: any) {
    console.error('finalizeSnapshot failed', err);
    // You may decide to return an error or just log it; for now, log only.
  }

  // 6) Audit
  try {
    appendAuditEvent({
      eventType: 'DISTRIBUTION_FINALIZED',
      clusterId,
      payload: {
        snapshotId: snapId,
        distributionId: record.id,
        totalKwh: total,
        recipients: distribution.length,
      },
    });
  } catch (err) {
    console.error('Failed to append audit event:', err);
  }
  try {
    await setClusterState(clusterId, SETTLEMENT_STATES.FINAL);
  } catch (err: any) {
    console.error('Failed to move cluster to FINAL:', err);
  }
  

  return res.status(201).json({
    distributionId: record.id,
    finalizedAt: record.finalized_at,
    clusterId: record.cluster_id,
    snapshotId: record.snapshot_id,
    totalKwh: record.total_kwh,
    allocations: record.allocations,
  });
});

/**
 * Helper to load a final distribution by snapshot, from Supabase.
 */
async function getFinalDistributionFromDbBySnapshot(snapshotId: string) {
  const { id } =
    (await getFinalDistributionFromDb(snapshotId)) || ({} as any);
  if (!id) return null;
  return getFinalDistributionFromDb(id);
}

export default router;
