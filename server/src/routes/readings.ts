import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { validateReading } from '../services/validation.js';
import { mintPCUForExportReading } from '../services/pcuMinting.js';
import { reconcileEnergyAllocation } from 'enerlectra-core';
import { authenticate } from '../middleware/auth.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const router = Router();

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

router.post('/ingest', authenticate, async (req: any, res) => {
  const {
    cluster_id,
    unit_id,
    reading_kwh,
    meter_type,
    photo_url,
    confidence,
    source = 'telegram',
    reading_key,
  } = req.body;

  const userId = req.user.id;

  if (!cluster_id || !unit_id || reading_kwh == null || !meter_type) {
    return res.status(400).json({ error: 'cluster_id, unit_id, reading_kwh, and meter_type are required' });
  }

  if (!reading_key) {
    return res.status(400).json({ error: 'reading_key is required for idempotency' });
  }

  try {
    const { data: membership, error: membershipError } = await supabase
      .from('cluster_members')
      .select('cluster_id, unit_id')
      .eq('user_id', userId)
      .eq('cluster_id', cluster_id)
      .eq('unit_id', unit_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return res.status(403).json({ error: 'You are not authorized to submit readings for this unit' });
    }

    const validation = await validateReading({
      userId,
      clusterId: cluster_id,
      newKwh: reading_kwh,
      confidence: confidence ?? 1.0,
      meterType: meter_type,
      requestId: req.id,
      logger,
    });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    const { data: existing, error: existingError } = await supabase
      .from('meter_readings')
      .select('id, meter_type')
      .eq('reading_key', reading_key)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return res.status(200).json({ success: true, duplicate: true, reading_id: existing.id, meter_type: existing.meter_type });
    }

    const { data: reading, error: insertError } = await supabase
      .from('meter_readings')
      .insert({
        reading_key,
        user_id: userId,
        cluster_id,
        unit_id,
        reading_kwh,
        meter_type,
        photo_url: photo_url || null,
        ocr_confidence: confidence ?? null,
        validated: true,
        captured_at: new Date().toISOString(),
        reporting_period: getCurrentPeriod(),
        source,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    if (reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation') {
      await mintPCUForExportReading(reading);
    }

    return res.status(201).json({
      success: true,
      reading_id: reading.id,
      delta_kwh: validation.delta,
      meter_type: reading.meter_type,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Ingest reading failed');
    return res.status(500).json({ error: error.message });
  }
});

router.post('/clusters/:clusterId/reconcile', authenticate, async (req: any, res) => {
  const { clusterId } = req.params;
  const { period } = req.body;
  const targetPeriod = period || getCurrentPeriod();
  const userId = req.user.id;

  try {
    const { data: admin, error: adminError } = await supabase
      .from('cluster_members')
      .select('role')
      .eq('user_id', userId)
      .eq('cluster_id', clusterId)
      .maybeSingle();

    if (adminError) throw adminError;
    if (!admin || !['admin', 'owner'].includes(admin.role)) {
      return res.status(403).json({ error: 'Not authorized to reconcile this cluster' });
    }

    const { data: readings, error: readingsError } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('reporting_period', targetPeriod)
      .eq('validated', true);

    if (readingsError) throw readingsError;
    if (!readings?.length) {
      return res.status(400).json({ error: 'No validated readings found for this period' });
    }

    const { data: ownership, error: ownershipError } = await supabase
      .from('ownership_snapshots')
      .select('user_id, ownership_pct')
      .eq('cluster_id', clusterId)
      .eq('period', targetPeriod);

    if (ownershipError) throw ownershipError;
    if (!ownership?.length) {
      return res.status(400).json({ error: 'No ownership snapshot found for this period' });
    }

    const reconciliationResult = reconcileEnergyAllocation({
      readings: readings.map((r: any) => ({
        clusterId: r.cluster_id,
        unitId: r.unit_id,
        userId: r.user_id,
        readingKwh: r.reading_kwh,
        meterType: r.meter_type,
        reportingPeriod: r.reporting_period,
      })),
      ownership: ownership.map((o: any) => ({
        userId: o.user_id,
        ownershipPct: o.ownership_pct,
      })),
      clusterId,
      period: targetPeriod,
    });

    const allocations = (reconciliationResult as any).allocations || [];
    if (allocations.length > 0) {
      const rows = allocations.map((alloc: any) => ({
        id: `stl_${clusterId}_${alloc.userId}_${targetPeriod}`,
        user_id: alloc.userId,
        cluster_id: clusterId,
        period: targetPeriod,
        delta_kwh: alloc.netKwh ?? 0,
        rate_per_kwh: 1.35,
        amount_zmw: Math.abs(alloc.netKwh ?? 0) * 1.35,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('settlement_ledger')
        .upsert(rows, { onConflict: 'id' });

      if (upsertError) throw upsertError;
    }

    return res.json({
      success: true,
      clusterId,
      period: targetPeriod,
      allocations,
    });
  } catch (error: any) {
    logger.error({ err: error, clusterId, period }, 'Reconciliation failed');
    return res.status(500).json({ error: error.message });
  }
});

export default router;