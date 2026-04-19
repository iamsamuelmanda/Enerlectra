// src/routes/settlement.ts
import { Router } from 'express';
import { supabase } from '../../../enerlectra-core/src/lib/supabase';
import {
  insertSettlements,
  getSettlementsForUser,
  getSettlementsForCluster,
  getNetForUserFromDb,
} from '../services/settlementSupabase';
import { getFinalDistributionFromDb } from '../services/distributionSupabase';

const router = Router();

interface SettlementInstruction {
  distributionId: string;
  clusterId: string;
  userId: string;
  allocatedKwh: number;
  amountZMW: number;
  supersedesSettlementId?: string;
}

/**
 * POST /settlement/generate
 */
router.post('/generate', async (req, res) => {
  const { distributionId, rateZMWPerKwh, supersedesSettlementId } = req.body;

  if (!distributionId || rateZMWPerKwh == null) {
    return res.status(400).json({
      error: 'distributionId and rateZMWPerKwh are required',
    });
  }

  if (rateZMWPerKwh <= 0) {
    return res.status(400).json({
      error: 'rateZMWPerKwh must be > 0',
    });
  }

  let distribution;
  try {
    const dbDist = await getFinalDistributionFromDb(distributionId);
    if (!dbDist) {
      return res.status(404).json({ error: 'No finalized distribution found' });
    }

    distribution = {
      distributionId: dbDist.id,
      clusterId: dbDist.cluster_id,
      snapshotId: dbDist.snapshot_id,
      totalKwh: dbDist.total_kwh,
      allocations: dbDist.allocations,
    };
  } catch (err: any) {
    console.error('getFinalDistributionFromDb failed', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to load finalized distribution' });
  }

  // Self-contained settlement generation
  const settlements: SettlementInstruction[] = distribution.allocations.map((alloc: any) => ({
    distributionId,
    clusterId: distribution.clusterId,
    userId: alloc.userId,
    allocatedKwh: alloc.kwh,
    amountZMW: alloc.kwh * rateZMWPerKwh,
    supersedesSettlementId,
  }));

  try {
    await insertSettlements(
      settlements.map((s) => ({
        distributionId: s.distributionId,
        clusterId: s.clusterId,
        userId: s.userId,
        kwh: s.allocatedKwh,
        amountZMW: s.amountZMW,
        supersedesSettlementId: s.supersedesSettlementId,
      })),
    );
  } catch (err: any) {
    console.error('insertSettlements failed', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to persist settlements' });
  }

  // Audit log
  try {
    await supabase.from('audit_events').insert({
      event_type: 'SETTLEMENT_GENERATED',
      cluster_id: distribution.clusterId,
      payload: {
        distributionId,
        rateZMWPerKwh,
        supersedesSettlementId: supersedesSettlementId || null,
        count: settlements.length,
      },
    });
  } catch (err) {
    console.error('Failed to append audit event:', err);
  }

  return res.status(201).json({
    distributionId,
    rateZMWPerKwh,
    settlements,
  });
});

// Read endpoints unchanged
router.get('/by-user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const records = await getSettlementsForUser(userId);
    return res.json({ userId, settlements: records });
  } catch (err: any) {
    console.error('getSettlementsForUser failed', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to load settlements for user' });
  }
});

router.get('/by-cluster/:clusterId', async (req, res) => {
  const { clusterId } = req.params;
  try {
    const records = await getSettlementsForCluster(clusterId);
    return res.json({ clusterId, settlements: records });
  } catch (err: any) {
    console.error('getSettlementsForCluster failed', err);
    return res.status(500).json({
      error: err.message ?? 'Failed to load settlements for cluster',
    });
  }
});

router.get('/net/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const net = await getNetForUserFromDb(userId);
    return res.json(net);
  } catch (err: any) {
    console.error('getNetForUserFromDb failed', err);
    return res
      .status(500)
      .json({ error: err.message ?? 'Failed to compute net for user' });
  }
});

export default router;