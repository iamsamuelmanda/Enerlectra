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
// Ellie / Telegram bot posts here
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
      transactionReference   // ← NEW: Link from Lenco payment
    } = req.body;

    if (!['grid', 'solar', 'unit'].includes(meterType)) {
      return res.status(400).json({ error: 'Invalid meter_type. Use grid|solar|unit' });
    }

    const reportingPeriod = period || getCurrentPeriod();

    const { data: reading, error } = await supabase
      .from('meter_readings')
      .insert({
        cluster_id: clusterId,
        unit_id: unitId,
        user_id: userId,
        reading_kwh: readingKwh,
        meter_type: meterType,
        photo_url: photoUrl,
        ocr_confidence: confidence,
        reporting_period: reportingPeriod,
        source: 'telegram',
        transaction_reference: transactionReference || null   // Link payment to reading
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-trigger reconciliation if we now have enough data
    const canReconcile = await checkReconciliationReady(clusterId, reportingPeriod);
    
    if (canReconcile) {
      await triggerReconciliation(clusterId, reportingPeriod);
    }

    res.json({
      status: 'stored',
      readingId: reading.id,
      reconciliationTriggered: canReconcile,
      message: `Reading saved: ${readingKwh} kWh`
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

    const hasGrid = readings?.some(r => r.meter_type === 'grid');
    const hasSolar = readings?.some(r => r.meter_type === 'solar');
    const unitReadings = readings?.filter(r => r.meter_type === 'unit') || [];

    res.json({
      period: targetPeriod,
      completeness: {
        grid: hasGrid,
        solar: hasSolar,
        units: {
          submitted: unitReadings.length,
          expected: 4, // TODO: Pull from cluster config later
          missing: Math.max(0, 4 - unitReadings.length)
        }
      },
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
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('meter_type')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  const hasGrid = readings?.some(r => r.meter_type === 'grid');
  const hasSolar = readings?.some(r => r.meter_type === 'solar');
  
  return Boolean(hasGrid && hasSolar);
}

async function triggerReconciliation(clusterId: string, period: string) {
  // Fetch all readings for this period
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('cluster_id', clusterId)
    .eq('reporting_period', period);

  // Fetch ownership snapshot
  const { data: ownership } = await supabase
    .from('ownership_snapshots')
    .select('user_id, ownership_pct')
    .eq('cluster_id', clusterId)
    .eq('period', period);

  if (!readings || !ownership) {
    throw new Error('Missing data for reconciliation');
  }

  const formattedReadings = readings.map(r => ({
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

  const formattedOwnership = ownership.map(o => ({
    userId: o.user_id,
    ownershipPct: o.ownership_pct
  }));

  // Run your real engine
  const result = reconcileEnergyAllocation({
    readings: formattedReadings,
    ownership: formattedOwnership,
    clusterId,
    period
  });

  // Store allocation
  const { data: allocation } = await supabase
    .from('energy_allocations')
    .insert({
      cluster_id: result.allocation.clusterId,
      period: result.allocation.period,
      grid_total_kwh: result.allocation.gridTotalKwh,
      solar_total_kwh: result.allocation.solarTotalKwh,
      solar_self_consumed: result.allocation.solarSelfConsumed,
      grid_purchased: result.allocation.gridPurchased
    })
    .select()
    .single();

  // Store unit shares
  const shares = result.unitShares.map(s => ({
    allocation_id: allocation.id,
    unit_id: s.unitId,
    user_id: s.userId,
    ownership_pct: s.ownershipPct,
    actual_kwh: s.actualKwh,
    solar_allocation_kwh: s.solarAllocationKwh,
    grid_allocation_kwh: s.gridAllocationKwh,
    grid_surplus_deficit: s.gridSurplusDeficit,
    solar_credit: s.solarCredit,
    grid_charge: s.gridCharge,
    net_amount: s.netAmount
  }));

  await supabase.from('unit_energy_shares').insert(shares);

  console.log(`[RECONCILE] Completed for cluster ${clusterId} in period ${period}`);
  return result;
}

export default router;