import { Router } from 'express';
import { generateSettlementInstructions } from '../../enerlectra-core/src/engines/settlement/settlementEngine';
import { appendAuditEvent } from '../../enerlectra-core/src/engines/audit/auditLog';
import {
  insertSettlements,
  getSettlementsForUser,
  getSettlementsForCluster,
  getNetForUserFromDb,
} from '../services/settlementSupabase';
import { getFinalDistributionFromDb } from '../services/distributionSupabase';

const router = Router();

/**
 * POST /settlement/generate
 * Body:
 * {
 *   distributionId: string
 *   rateZMWPerKwh: number
 *   supersedesSettlementId?: string
 * }
 *
 * Effect:
 * - Reads immutable distribution (from Supabase)
 * - Generates settlement instructions
 * - Persists them in Supabase settlements table
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

  const settlements = generateSettlementInstructions({
    distributionId,
    clusterId: distribution.clusterId,
    allocations: distribution.allocations,
    rateZMWPerKwh,
    supersedesSettlementId,
  });

  console.log('settlements from engine', settlements);

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

  try {
    appendAuditEvent({
      eventType: 'SETTLEMENT_GENERATED',
      clusterId: distribution.clusterId,
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

/**
 * Read models – pure views over immutable Supabase log.
 * No writes, no side effects.
 */

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
