// server/src/routes/ownership.ts
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../enerlectra-core/src/lib/supabase.js';
const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
}
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const CONTRIBUTIONS_FILE = path.join(dataDir, 'contributions.json');

// Simple state machine
const ALLOWED_SNAPSHOT_STATES = ['DRAFT', 'PILOT'];

type BaseContribution = {
  contributionId: string;
  clusterId: string;
  userId: string;
  units: number;
  timestamp: string;
};

type OwnershipSnapshot = {
  snapshotId: string;
  version: number;
  baseOwnership: Array<{
    userId: string;
    baseUnits: number;
    basePct: number;
  }>;
  effectiveOwnership: Array<{
    userId: string;
    effectiveUnits: number;
    effectivePct: number;
  }>;
  totals: {
    totalBaseUnits: number;
    totalEffectiveUnits: number;
  };
};

// Self-contained ownership computation (no external engine imports)
function computeOwnershipSnapshot(
  contributions: BaseContribution[],
  clusterId: string,
  multipliers: { confidenceMultiplier: number; campaignMultiplier: number } = { confidenceMultiplier: 1, campaignMultiplier: 1 }
): OwnershipSnapshot {
  // Filter contributions for this cluster
  const clusterContributions = contributions.filter(c => c.clusterId === clusterId);
  
  // Compute base units (simple sum for now, add weighting logic as needed)
  const totalBaseUnits = clusterContributions.reduce((sum, c) => sum + c.units, 0);
  
  // Calculate base ownership
  const baseOwnership = clusterContributions
    .reduce((acc: OwnershipSnapshot['baseOwnership'], c) => {
      const basePct = totalBaseUnits > 0 ? (c.units / totalBaseUnits) * 100 : 0;
      acc.push({ userId: c.userId, baseUnits: c.units, basePct: Math.round(basePct * 100) / 100 });
      return acc;
    }, []);

  // Effective ownership (apply multipliers - placeholder logic)
  const totalEffectiveUnits = totalBaseUnits * multipliers.confidenceMultiplier * multipliers.campaignMultiplier;
  const effectiveOwnership = baseOwnership.map(o => ({
    userId: o.userId,
    effectiveUnits: o.baseUnits * multipliers.confidenceMultiplier * multipliers.campaignMultiplier,
    effectivePct: o.basePct // Simplified - apply vesting/dilution logic here
  }));

  return {
    snapshotId: `snap_${clusterId}_${Date.now()}`,
    version: 1, // Will be updated from DB
    baseOwnership,
    effectiveOwnership,
    totals: { totalBaseUnits, totalEffectiveUnits }
  };
}

/**
 * GET /ownership/clusters/:id
 * Computes AND persists a new ownership snapshot.
 */
router.get('/clusters/:id', async (req, res) => {
  const { id: clusterId } = req.params;

  try {
    // Load contributions from legacy JSON (replace with Supabase query when ready)
    let contributions: BaseContribution[] = [];
    if (fs.existsSync(CONTRIBUTIONS_FILE)) {
      const rawData = fs.readFileSync(CONTRIBUTIONS_FILE, 'utf8');
      contributions = JSON.parse(rawData);
    }

    const snapshot = computeOwnershipSnapshot(contributions, clusterId);

    // Get latest snapshot version from Supabase
    const { data: latestSnapshots } = await supabase
      .from('ownership_snapshots')
      .select('version, state')
      .eq('clusterId', clusterId)
      .order('version', { ascending: false })
      .limit(1);

    const latestVersion = latestSnapshots?.[0]?.version ?? 0;
    const nextVersion = latestVersion + 1;

    if (latestSnapshots?.[0]?.state && !ALLOWED_SNAPSHOT_STATES.includes(latestSnapshots[0].state as string)) {
      return res.status(409).json({ error: 'Snapshot computation blocked: latest snapshot is locked' });
    }

    // Persist to Supabase
    const insertData = {
      ...snapshot,
      version: nextVersion,
      state: 'DRAFT' as const
    };

    const { data: record, error } = await supabase
      .from('ownership_snapshots')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Failed to insert snapshot:', error);
      return res.status(500).json({ error: 'Failed to persist snapshot' });
    }

    // Log audit event (FIXED: use try/catch instead of .catch())
    try {
      await supabase.from('audit_events').insert({
        event_type: 'SNAPSHOT_COMPUTED',
        cluster_id: clusterId,
        payload: {
          snapshot_id: record.snapshotId,
          version: record.version,
          contributors: snapshot.baseOwnership.length,
          ...snapshot.totals
        }
      });
    } catch (auditError) {
      console.error('Audit logging failed:', auditError);
    }

    res.json(record);
  } catch (error) {
    console.error('Ownership route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
