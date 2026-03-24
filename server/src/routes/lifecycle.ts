import { Router } from "express";
import {
  getClusterState,
  setClusterState,
} from "../services/settlementStateSupabase";
import {
  SettlementState,
  SETTLEMENT_STATES,
} from "../../enerlectra-core/src/domain/settlementState";

const router = Router();

/**
 * POST /lifecycle/clusters/:id/preview
 * Move cluster from DRAFT -> PREVIEW.
 */
router.post("/clusters/:id/preview", async (req, res) => {
  const { id: clusterId } = req.params;

  try {
    const current: SettlementState = await getClusterState(clusterId);
    if (current !== SETTLEMENT_STATES.DRAFT) {
      return res.status(409).json({
        error: `Can only move to PREVIEW from DRAFT. Current state: ${current}`,
      });
    }

    await setClusterState(clusterId, SETTLEMENT_STATES.PREVIEW);
    return res.json({ clusterId, state: SETTLEMENT_STATES.PREVIEW });
  } catch (err: any) {
    console.error("preview lifecycle transition failed", err);
    return res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

export default router;
