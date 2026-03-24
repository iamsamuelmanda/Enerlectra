import { Router } from 'express';
import fs from 'fs';

import { storeFile } from '../../enerlectra-core/src/engines/storePath.ts';
import { computeOwnershipSnapshot } from '../../enerlectra-core/src/engines/ownership/ownershipSnapshotEngine.ts';
import { BaseContribution } from '../../enerlectra-core/src/engines/ownership/baseOwnership.ts';
import { appendSnapshot } from '../../enerlectra-core/src/engines/snapshot/snapshotStore.ts';
import { appendAuditEvent } from '../../enerlectra-core/src/engines/audit/auditLog.ts';
import { getContributionsForCluster } from '../services/contributionsSupabase.ts';
import { SettlementPolicy } from '../../enerlectra-core/src/domain/settlementPolicy';
import { getClusterState } from '../services/settlementStateSupabase';


const router = Router();

// Legacy JSON path (kept only so the file import still compiles; no longer used here)
const CONTRIBUTIONS_FILE = storeFile('contributions.json');

function loadContributions(): BaseContribution[] {
  if (!fs.existsSync(CONTRIBUTIONS_FILE)) return [];

  try {
    const raw = fs.readFileSync(CONTRIBUTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Contributions file is not an array');
    }

    return parsed.map((c: any) => ({
      contributionId: String(c.contributionId),
      clusterId: String(c.clusterId),
      userId: String(c.userId),
      units: Number(c.amountZMW) || 0,
      timestamp: c.timestamp ? String(c.timestamp) : new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Failed to load contributions:', err);
    throw new Error('Failed to load contributions data');
  }
}

/**
 * GET /ownership/clusters/:id
 * Computes AND persists a new ownership snapshot.
 * 🔒 Will fail if the previous snapshot is locked.
 */
router.get('/clusters/:id', async (req, res) => {
  const { id: clusterId } = req.params;
  const state = await getClusterState(clusterId);
if (!SettlementPolicy.canSimulate(state)) {
  return res.status(409).json({
    error: `Ownership snapshot computation is not allowed while cluster is in ${state} state`,
  });
}


  if (!clusterId) {
    return res.status(400).json({ error: 'clusterId is required' });
  }

  let clusterContributions: BaseContribution[];

  try {
    // Load contributions for this cluster from Supabase (source of truth)
    const dbContribs = await getContributionsForCluster(clusterId);

    if (!dbContribs || dbContribs.length === 0) {
      return res.status(404).json({
        error: `No contributions found for cluster ${clusterId}`,
      });
    }

    clusterContributions = dbContribs.map((c) => ({
      contributionId: c.id,
      clusterId: c.cluster_id,
      userId: c.contributor_id || c.contributor_name,
      units: c.pcus,
      timestamp: c.created_at,
    }));
  } catch (err: any) {
    console.error('Failed to load Supabase contributions:', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to load contributions' });
  }

  let snapshot;
  try {
    snapshot = computeOwnershipSnapshot(clusterContributions, clusterId, {
      confidenceMultiplier: 1,
      campaignMultiplier: 1,
    });
  } catch (err: any) {
    console.error('Snapshot computation failed:', err);
    return res.status(500).json({
      error: err.message ?? 'Failed to compute ownership snapshot',
    });
  }

  let record;
  try {
    record = appendSnapshot(clusterId, {
      baseOwnership: snapshot.baseOwnership,
      effectiveOwnership: snapshot.effectiveOwnership,
      totals: {
        totalBaseUnits: snapshot.totals.baseUnits,
        totalEffectiveUnits: snapshot.totals.effectiveUnits,
      },
    });
  } catch (err: any) {
    return res.status(409).json({
      error: err.message ?? 'Snapshot is locked and cannot be modified',
    });
  }

  try {
    appendAuditEvent({
      eventType: 'OWNERSHIP_SNAPSHOT_COMPUTED',
      clusterId,
      payload: {
        snapshotId: record.snapshotId,
        version: record.version,
        contributors: snapshot.baseOwnership.length,
        ...snapshot.totals,
      },
    });
  } catch (err) {
    console.error('Failed to append audit event:', err);
  }

  return res.json(record);
});

export default router;
