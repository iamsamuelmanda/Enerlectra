// src/routes/ownershipLedger.ts
import { Router } from 'express';
import { supabase } from '../../../enerlectra-core/src/lib/supabase.js';
import { getContributionsForCluster } from '../services/contributionsSupabase.js';

const router = Router();

type SettlementState = 'DRAFT' | 'PILOT' | 'ACTIVE' | 'SETTLED' | 'CLOSED';

interface OwnershipEntry {
  userId: string;
  totalPCU: number;
  percent: number;
}

async function getClusterState(clusterId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('clusters')
      .select('state')
      .eq('id', clusterId)
      .single();
    return data?.state || null;
  } catch {
    return null;
  }
}

/**
 * GET /ownership-ledger/clusters/:id
 * Returns aggregated ownership per user + explanation text, derived from Supabase contributions.
 */
router.get('/clusters/:id', async (req, res) => {
  const { id: clusterId } = req.params;

  if (!clusterId) {
    return res.status(400).json({ error: 'clusterId is required' });
  }

  let state: string | null = null;
  try {
    state = await getClusterState(clusterId);
  } catch {
    // ignore; purely read-only
  }

  try {
    const dbContribs = await getContributionsForCluster(clusterId);

    if (!dbContribs || dbContribs.length === 0) {
      return res.status(404).json({
        error: `No contributions found for cluster ${clusterId}`,
      });
    }

    // Self-contained aggregation
    const userTotals: Record<string, number> = {};
    dbContribs.forEach((c: any) => {
      const userId = c.contributor_id || c.user_id || c.contributor_name || 'unknown';
      userTotals[userId] = (userTotals[userId] || 0) + (c.pcus || c.units || 0);
    });

    const aggregated: OwnershipEntry[] = Object.entries(userTotals).map(([userId, totalPCU]) => {
      const clusterTotal = Object.values(userTotals).reduce((sum: number, v: number) => sum + v, 0);
      const percent = clusterTotal > 0 ? (totalPCU / clusterTotal) * 100 : 0;
      return { userId, totalPCU, percent: Math.round(percent * 100) / 100 };
    });

    const clusterTotal = aggregated.reduce((sum: number, entry: OwnershipEntry) => sum + entry.totalPCU, 0);

    const entries = aggregated.map(entry => ({
      userId: entry.userId,
      totalPCU: entry.totalPCU,
      percent: entry.percent,
      explanation: `User contributed ${entry.totalPCU.toLocaleString()} PCU (${entry.percent}%) of cluster total`,
    }));

    return res.json({
      clusterId,
      state,
      totalPCU: clusterTotal,
      entries,
    });
  } catch (err: any) {
    console.error('ownership-ledger failed:', err);
    return res.status(500).json({
      error: err.message ?? 'Failed to compute ownership from ledger',
    });
  }
});

export default router;
