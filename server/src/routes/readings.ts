// server/src/routes/readings.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
// ESM Fix: Ensure the path is correct for your build structure. 
// If using a monorepo, ensure this package is built or linked.
import { reconcileEnergyAllocation } from '../../enerlectra-core/src/engines/reconciliation.js';

const router = Router();

// Robust Supabase Initialization
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function normalizePhone(phone: string): string {
  // Enhanced normalization for Zambian numbers (+260, 097, etc.)
  return phone.replace(/[\+\s\-\(\)]/g, '');
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────

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
      transactionReference,
      signal
    } = req.body;

    if (!clusterId || !unitId) {
      return res.status(400).json({ error: 'clusterId and unitId are required' });
    }

    let actualUserId: string | null = null;

    if (userId) {
      if (isValidUUID(userId)) {
        actualUserId = userId;
      } else {
        const normalizedPhone = normalizePhone(userId);
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', normalizedPhone)
          .single();

        actualUserId = profile?.id || null;
      }
    }

    const reportingPeriod = period || getCurrentPeriod();

    const { data: reading, error } = await supabase
      .from('meter_readings')
      .insert({
        cluster_id: clusterId,
        unit_id: unitId,
        user_id: actualUserId,
        reading_kwh: readingKwh || 0,
        meter_type: meterType || 'unit',
        photo_url: photoUrl || null,
        ocr_confidence: confidence || null,
        reporting_period: reportingPeriod,
        source: 'telegram', // Defaulting to Telegram for current Pilot
        transaction_reference: transactionReference || null,
        signal: signal || null
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`📊 [READING] Ingested: Cluster ${clusterId}, Unit ${unitId}`);

    res.json({
      status: 'stored',
      readingId: reading.id,
      userLinked: !!actualUserId,
      userId: actualUserId
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

    const { data: readings, error } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', targetPeriod);

    if (error) throw error;

    res.json({
      period: targetPeriod,
      readings: readings || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/readings/clusters/:clusterId/reconcile
router.post('/clusters/:clusterId/reconcile', async (req, res) => {
  const { clusterId } = req.params;
  const { period } = req.body;

  try {
    const targetPeriod = period || getCurrentPeriod();
    
    // Fetch Data
    const { data: readings } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', targetPeriod);

    const { data: ownership } = await supabase
      .from('ownership_snapshots')
      .select('user_id, ownership_pct')
      .eq('cluster_id', clusterId)
      .eq('period', targetPeriod);

    if (!readings || !ownership || readings.length === 0) {
      return res.status(400).json({ error: 'Missing or insufficient data for reconciliation' });
    }

    // Format for Core Engine
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

    // Trigger Reconciliation Engine
    const result = reconcileEnergyAllocation({
      readings: formattedReadings,
      ownership: formattedOwnership,
      clusterId,
      period: targetPeriod
    });

    console.log(`✅ [RECONCILE] Completed for ${clusterId} - Period: ${targetPeriod}`);
    res.json(result);
  } catch (error: any) {
    console.error('[RECONCILE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;