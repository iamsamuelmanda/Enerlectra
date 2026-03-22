// server/routes/readings.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { reconcileEnergyAllocation } from '../../enerlectra-core/src/engines/reconciliation';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// POST /api/readings/ingest
router.post('/ingest', async (req, res) => {
  try {
    const {
      clusterId,
      unitId,
      userId,
      readingKwh,
      meterType,
      photoUrl,
      confidence,
      period,
      transactionReference
    } = req.body;

    if (!clusterId || !unitId) {
      return res.status(400).json({ error: 'clusterId and unitId are required' });
    }

    const reportingPeriod = period || getCurrentPeriod();

    const { data: reading, error } = await supabase
      .from('meter_readings')
      .insert({
        cluster_id: clusterId,
        unit_id: unitId,
        user_id: userId || null,
        reading_kwh: readingKwh || 0,
        meter_type: meterType || 'unit',
        photo_url: photoUrl || null,
        ocr_confidence: confidence || null,
        reporting_period: reportingPeriod,
        source: 'telegram',
        transaction_reference: transactionReference || null
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[INGEST SUCCESS] Saved reading for cluster ${clusterId}`);

    // Auto-trigger reconciliation if data is ready
    const canReconcile = await checkReconciliationReady(clusterId, reportingPeriod);
    if (canReconcile) {
      await triggerReconciliation(clusterId, reportingPeriod);
    }

    res.json({
      status: 'stored',
      readingId: reading.id,
      reconciliationTriggered: canReconcile
    });

  } catch (error: any) {
    console.error('[READINGS INGEST ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/readings/clusters/:clusterId/status
router.get('/clusters/:clusterId/status', async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.query;

  try {
    const targetPeriod = (period as string) || getCurrentPeriod();

    const { data: readings } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', targetPeriod);

    res.json({
      period: targetPeriod,
      readings: readings || []
    });
  } catch (error: any) {
    console.error('[STATUS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/readings/clusters/:clusterId/reconcile
router.post('/clusters/:clusterId/reconcile', async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.body;

  try {
    const result = await triggerReconciliation(clusterId, period || getCurrentPeriod());
    res.json(result);
  } catch (error: any) {
    console.error('[RECONCILE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function checkReconciliationReady(clusterId: string, period: string): Promise<boolean> {
  const { data } = await supabase
    .from('meter_readings')
    .select('meter_type')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  const hasGrid = data?.some((r: any) => r.meter_type === 'grid');
  const hasSolar = data?.some((r: any) => r.meter_type === 'solar');
  
  return Boolean(hasGrid && hasSolar);
}

async function triggerReconciliation(clusterId: string, period: string) {
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  const { data: ownership } = await supabase
    .from('ownership_snapshots')
    .select('user_id, ownership_pct')
    .eq('cluster_id', clusterId)
    .eq('period', period);

  if (!readings || !ownership) {
    throw new Error('Missing data for reconciliation');
  }

  const formattedReadings = readings.map((r: any) => ({
    clusterId: r.cluster_id,
    unitId: r.unit_id,
    userId: r.user_id,
    readingKwh: r.reading_kwh,
    meterType: r.meter_type,
    photoUrl: r.photo_url,
    ocrConfidence: r.ocr_confidence,
    reportingPeriod: r.reporting_period,
    source: r.source
  }));

  const formattedOwnership = ownership.map((o: any) => ({
    userId: o.user_id,
    ownershipPct: o.ownership_pct
  }));

  const result = reconcileEnergyAllocation({
    readings: formattedReadings,
    ownership: formattedOwnership,
    clusterId,
    period
  });

  console.log(`[RECONCILE] Completed for cluster ${clusterId} in period ${period}`);
  return result;
}

export default router;