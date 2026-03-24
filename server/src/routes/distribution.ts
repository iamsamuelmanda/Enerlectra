import { Router } from 'express';

// go up from server/routes -> server -> project root
import { SettlementPolicy } from '../../enerlectra-core/src/domain/settlementPolicy';
import { getClusterState } from '../services/settlementStateSupabase';
import { distributeOutcome } from '../../enerlectra-core/src/engines/distribution.ts';
import { getSnapshotById } from '../../enerlectra-core/src/engines/snapshot/snapshotStore.ts';
import { appendAuditEvent } from '../../enerlectra-core/src/engines/audit/auditLog.ts';
import {
  insertFinalDistribution,
  hasFinalDistributionForSnapshot,
} from '../services/distributionSupabase.ts';

const router = Router();

/**
 * GET /distribution/clusters/:id
 * Simulate a distribution without persisting.
 * Required query params:
 *  - snapshotId
 *  - totalKwh
 */
router.get('/clusters/:id', async (req, res) => {
  const { id: clusterId } = req.params;
  const state = await getClusterState(clusterId);
if (!SettlementPolicy.canSimulate(state)) {
  return res.status(409).json({
    error: `Simulation is not allowed while cluster is in ${state} state`,
  });
}

  const { snapshotId, totalKwh } = req.query;

  if (!snapshotId || !totalKwh) {
    return res.status(400).json({
      error: 'snapshotId and totalKwh are required',
    });
  }

  const total = Number(totalKwh);
  if (!Number.isFinite(total) || total <= 0) {
    return res.status(400).json({
      error: 'totalKwh must be a number > 0',
    });
  }

  let snapshot;
  try {
    snapshot = getSnapshotById(clusterId, String(snapshotId));
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }

  const ownership = snapshot.effectiveOwnership.map((o: any) => ({
    userId: o.userId,
    pct: o.pct,
  }));

  const distribution = distributeOutcome(ownership, total);

  appendAuditEvent({
    eventType: 'DISTRIBUTION_SIMULATED',
    clusterId,
    payload: {
      snapshotId,
      totalKwh: total,
      recipients: distribution.length,
    },
  });

  return res.json({
    clusterId,
    snapshotId,
    totalKwh: total,
    distribution,
  });
});

/**
 * POST /distribution/clusters/:id/finalize
 * Finalize and persist a distribution for a specific cluster, returning a real distributionId.
 * Body:
 *  - snapshotId (string)
 *  - totalKwh (number)
 */
router.post('/clusters/:id/finalize', async (req, res) => {
  const { id: clusterId } = req.params;
  const { snapshotId, totalKwh } = req.body;

  if (!snapshotId || totalKwh == null) {
    return res.status(400).json({
      error: 'snapshotId and totalKwh are required',
    });
  }

  const total = Number(totalKwh);
  if (!Number.isFinite(total) || total <= 0) {
    return res.status(400).json({
      error: 'totalKwh must be a number > 0',
    });
  }

  const snapId = String(snapshotId);

  // 1) Idempotency: check Supabase for existing final distribution for this snapshot
  try {
    const already = await hasFinalDistributionForSnapshot(snapId);
    if (already) {
      return res.status(400).json({
        error: 'This snapshot has already been finalized',
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

  // 3) Deterministic distribution
  const rawDistribution = distributeOutcome(ownership, total);

  const allocations = rawDistribution.map((d: any) => ({
    userId: d.userId,
    allocatedKwh: d.kwh,
    ownershipPct: d.pct,
  }));

  const distributionId = `dist_${Math.random().toString(36).slice(2, 10)}`;

  // 4) Persist final distribution in Supabase
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

  // 5) Audit
  try {
    appendAuditEvent({
      eventType: 'DISTRIBUTION_FINALIZED',
      clusterId,
      payload: {
        snapshotId: snapId,
        distributionId: record.id,
        totalKwh: total,
        recipients: allocations.length,
      },
    });
  } catch (err) {
    console.error('Failed to append audit event:', err);
  }

  return res.json({
    distributionId: record.id,
    finalizedAt: record.finalized_at,
    clusterId: record.cluster_id,
    snapshotId: record.snapshot_id,
    totalKwh: record.total_kwh,
    allocations: record.allocations,
  });
});

export default router;
