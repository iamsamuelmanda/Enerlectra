// server/routes/ownershipLedger.ts
import { Router } from "express";
import { getContributionsForCluster } from "../services/contributionsSupabase.ts";
import { aggregateOwnership } from "../../enerlectra-core/src/services/aggregateOwnership.ts";
import { explainOwnershipCalculation } from "../../enerlectra-core/src/services/explainCalculation.ts";
import { Transaction } from "../../enerlectra-core/src/domain/Transaction";
import { SettlementPolicy } from "../../enerlectra-core/src/domain/settlementPolicy";
import { getClusterState } from "../services/settlementStateSupabase";

const router = Router();

/**
 * GET /ownership-ledger/clusters/:id
 * Returns aggregated ownership per user + explanation text, derived from Supabase contributions.
 * Read-only; allowed in DRAFT, PREVIEW, FINAL.
 */
router.get("/clusters/:id", async (req, res) => {
  const { id: clusterId } = req.params;

  if (!clusterId) {
    return res.status(400).json({ error: "clusterId is required" });
  }

  // Ensure cluster exists / has a state (optional, but keeps behavior consistent)
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

    // Map Supabase rows → Transaction[]
    const txs: Transaction[] = dbContribs.map((c: any) => ({
      id: c.id,
      userId: c.contributor_id || c.contributor_name,
      clusterId: c.cluster_id,
      amountPCU: c.pcus,
      createdAt: c.created_at,
    }));

    const aggregated = aggregateOwnership(txs);
    const clusterTotal = aggregated.reduce((sum, a) => sum + a.totalPCU, 0);

    const entries = aggregated.map(a => ({
      userId: a.userId,
      totalPCU: a.totalPCU,
      percent: a.percent,
      explanation: explainOwnershipCalculation(a.totalPCU, clusterTotal),
    }));

    return res.json({
      clusterId,
      state,
      totalPCU: clusterTotal,
      entries,
    });
  } catch (err: any) {
    console.error("ownership-ledger failed:", err);
    return res.status(500).json({
      error: err.message ?? "Failed to compute ownership from ledger",
    });
  }
});

export default router;
