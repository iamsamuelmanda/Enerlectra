// server/src/routes/distribution.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase configuration missing for distribution routes');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Simple state machine (replace with your actual states)
const ALLOWED_SIMULATION_STATES = ['DRAFT', 'PILOT', 'RECONCILED'];

// Simulate distribution without persisting
router.get('/clusters/:id', async (req, res) => {
  const { id: clusterId } = req.params;
  
  try {
    // Check cluster state
    const { data: cluster } = await supabase
      .from('clusters')
      .select('settlement_state')
      .eq('id', clusterId)
      .single();

    const state = cluster?.settlement_state ?? 'DRAFT';
    if (!ALLOWED_SIMULATION_STATES.includes(state)) {
      return res.status(409).json({
        error: `Simulation not allowed while cluster is in ${state} state`,
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

    // Get ownership snapshot
    const { data: snapshot } = await supabase
      .from('ownership_snapshots')
      .select('id, user_id, ownership_pct')
      .eq('cluster_id', clusterId)
      .eq('id', snapshotId as string)
      .single();

    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    // Simple proportional distribution
    const ownership = [{ userId: snapshot.user_id, pct: snapshot.ownership_pct }];
    const distribution = ownership.map((o) => ({
      userId: o.userId,
      pct: o.pct,
      kwh: Math.round((o.pct / 100) * total * 100) / 100,
    }));

    // Log simulation audit
    await supabase.from('audit_events').insert({
      event_type: 'DISTRIBUTION_SIMULATED',
      cluster_id: clusterId,
      payload: {
        snapshotId,
        totalKwh: total,
        recipients: distribution.length,
      },
    });

    res.json({
      clusterId,
      snapshotId,
      totalKwh: total,
      distribution,
    });
  } catch (err: any) {
    console.error('[DISTRIBUTION SIM ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Finalize distribution (persists to DB)
router.post('/clusters/:id/finalize', async (req, res) => {
  const { id: clusterId } = req.params;
  const { snapshotId, totalKwh } = req.body;

  try {
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

    // Check for existing final distribution
    const { data: existing } = await supabase
      .from('final_distributions')
      .select('id')
      .eq('snapshot_id', snapId)
      .single();

    if (existing) {
      return res.status(400).json({
        error: 'This snapshot has already been finalized',
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
    const rawDistribution = ownership.map((o) => ({
      userId: o.userId,
      pct: o.pct,
      kwh: Math.round((o.pct / 100) * total * 100) / 100,
    }));

    const allocations = rawDistribution.map((d) => ({
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

    // Audit
    await supabase.from('audit_events').insert({
      event_type: 'DISTRIBUTION_FINALIZED',
      cluster_id: clusterId,
      payload: {
        snapshotId: snapId,
        distributionId,
        totalKwh: total,
        recipients: allocations.length,
      },
    });

    res.json({
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