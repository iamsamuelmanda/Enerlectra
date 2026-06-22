// server/src/routes/distributionFinalize.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase configuration missing for distribution finalize routes');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Simple settlement states
const SETTLEMENT_STATES = {
  DRAFT: 'DRAFT',
  PILOT: 'PILOT',
  RECONCILED: 'RECONCILED',
  DISTRIBUTING: 'DISTRIBUTING',
  FINAL: 'FINAL',
} as const;

type SettlementState = typeof SETTLEMENT_STATES[keyof typeof SETTLEMENT_STATES];

const ALLOWED_FINALIZE_STATES = ['RECONCILED', 'DISTRIBUTING'];

router.post('/finalize', async (req, res) => {
  const { clusterId, snapshotId, totalKwh } = req.body;

  try {
    // Check cluster state
    const { data: cluster } = await supabase
      .from('clusters')
      .select('settlement_state')
      .eq('id', clusterId)
      .single();

    const state = cluster?.settlement_state ?? 'DRAFT';
    if (!ALLOWED_FINALIZE_STATES.includes(state)) {
      return res.status(409).json({
        error: `Cannot finalize while cluster is in ${state} state. Expected ${ALLOWED_FINALIZE_STATES.join(', ')}.`,
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

    // Check if already finalized
    const { data: existing } = await supabase
      .from('final_distributions')
      .select('id')
      .eq('snapshot_id', snapId)
      .single();

    if (existing) {
      const { data: fullRecord } = await supabase
        .from('final_distributions')
        .select('*')
        .eq('id', existing.id)
        .single();

      return res.status(409).json({
        error: 'Distribution already finalized for this snapshot',
        distribution: fullRecord,
      });
    }

    // Get snapshot
    const { data: snapshot } = await supabase
      .from('ownership_snapshots')
      .select('id, user_id, ownership_pct')
      .eq('cluster_id', clusterId)
      .eq('id', snapId)
      .single();

    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    // Compute distribution
    const ownership = [{ userId: snapshot.user_id, pct: snapshot.ownership_pct }];
    const distribution = ownership.map((o) => ({
      userId: o.userId,
      pct: o.pct,
      kwh: Math.round((o.pct / 100) * total * 100) / 100,
    }));

    const allocations = distribution.map((d) => ({
      userId: d.userId,
      allocatedKwh: d.kwh,
      ownershipPct: d.pct,
    }));

    const distributionId = `dist_${Date.now()}`;

    // Persist final distribution
    const { data: record, error } = await supabase
      .from('final_distributions')
      .insert({
        id: distributionId,
        cluster_id: clusterId,
        snapshot_id: snapId,
        total_kwh: total,
        allocations,
        finalized_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update cluster state
    await supabase
      .from('clusters')
      .update({ settlement_state: SETTLEMENT_STATES.FINAL })
      .eq('id', clusterId);

    // Audit
    await supabase.from('audit_events').insert({
      event_type: 'DISTRIBUTION_FINALIZED',
      cluster_id: clusterId,
      payload: {
        snapshotId: snapId,
        distributionId,
        totalKwh: total,
        recipients: distribution.length,
      },
    });

    res.status(201).json({
      distributionId: record.id,
      finalizedAt: record.finalized_at,
      clusterId: record.cluster_id,
      snapshotId: record.snapshot_id,
      totalKwh: record.total_kwh,
      allocations: record.allocations,
    });
  } catch (err: any) {
    console.error('[DISTRIBUTION FINALIZE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
