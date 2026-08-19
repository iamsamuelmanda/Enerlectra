// src/routes/lifecycle.ts
import { Router } from 'express';
import {
  getClusterState,
  setClusterState,
} from '../services/settlementStateSupabase.js';

type SettlementState = 'DRAFT' | 'PILOT' | 'ACTIVE' | 'SETTLED' | 'CLOSED' | 'PREVIEW';

const SETTLEMENT_STATES = {
  DRAFT: 'DRAFT' as SettlementState,
  PILOT: 'PILOT' as SettlementState,
  ACTIVE: 'ACTIVE' as SettlementState,
  SETTLED: 'SETTLED' as SettlementState,
  CLOSED: 'CLOSED' as SettlementState,
  PREVIEW: 'PREVIEW' as SettlementState,
} as const;

const router = Router();

/**
 * POST /lifecycle/clusters/:id/preview
 * Move cluster from DRAFT -> PREVIEW.
 */
router.post('/clusters/:id/preview', async (req, res) => {
  const { id: clusterId } = req.params;

  try {
    const current: SettlementState = await getClusterState(clusterId);
    if (current !== SETTLEMENT_STATES.DRAFT) {
      return res.status(409).json({
        error: `Can only move to PREVIEW from DRAFT. Current state: ${current}`,
      });
    }

    await setClusterState(clusterId, SETTLEMENT_STATES.PREVIEW);
    return res.json({ 
      clusterId, 
      state: SETTLEMENT_STATES.PREVIEW,
      transitionedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('preview lifecycle transition failed', err);
    return res.status(500).json({ 
      error: err.message ?? 'Internal error' 
    });
  }
});

/**
 * POST /lifecycle/clusters/:id/active
 * Move cluster from PREVIEW -> ACTIVE.
 */
router.post('/clusters/:id/active', async (req, res) => {
  const { id: clusterId } = req.params;

  try {
    const current: SettlementState = await getClusterState(clusterId);
    if (current !== SETTLEMENT_STATES.PREVIEW) {
      return res.status(409).json({
        error: `Can only move to ACTIVE from PREVIEW. Current state: ${current}`,
      });
    }

    await setClusterState(clusterId, SETTLEMENT_STATES.ACTIVE);
    return res.json({ 
      clusterId, 
      state: SETTLEMENT_STATES.ACTIVE,
      transitionedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('active lifecycle transition failed', err);
    return res.status(500).json({ 
      error: err.message ?? 'Internal error' 
    });
  }
});

export default router;
