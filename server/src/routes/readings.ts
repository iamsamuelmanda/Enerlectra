import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { createTenantContextResolver, TenantContextError } from '../platform/tenant/resolver.js';
import { validateReading } from '../services/validation.js';
import type { MeterType } from '../../../enerlectra-core/src/core/services/ocr.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const METER_TYPES: MeterType[] = ['grid_import','solar_import','solar_export','solar_generation','generator','unit_submeter','unknown'];

function bearer(req: any): string | null {
  const value = req.headers.authorization;
  if (typeof value !== 'string') return null;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function period() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function statusFor(error: unknown) {
  if (error instanceof TenantContextError) {
    return error.code === 'UNAUTHENTICATED' ? 401 : 403;
  }
  return 500;
}

export function createReadingsRouter(supabase: SupabaseClient): Router {
  const router = Router();
  const resolver = createTenantContextResolver(supabase);

  router.post('/ingest', async (req: any, res) => {
    const token = bearer(req);
    const organizationId = req.header('x-organization-id') || req.body?.organization_id;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    if (!organizationId) return res.status(400).json({ error: 'x-organization-id is required' });

    try {
      const tenant = await resolver.resolve({
        accessToken: token,
        organizationId,
        correlationId: req.header('x-correlation-id') || req.id,
        requestId: req.id,
        source: 'api',
      });

      if (!tenant.permissions.includes('observation.write')) {
        return res.status(403).json({ error: 'Missing observation.write permission' });
      }

      const {
        asset_id: assetId,
        reading_kwh: readingKwh,
        meter_type: meterType,
        photo_url: photoUrl,
        confidence = 1,
        source = 'manual',
        reading_key: readingKey,
        captured_at: capturedAt,
      } = req.body ?? {};

      if (!assetId || readingKwh == null || !meterType || !readingKey) {
        return res.status(400).json({ error: 'asset_id, reading_kwh, meter_type, and reading_key are required' });
      }
      if (!METER_TYPES.includes(meterType)) {
        return res.status(400).json({ error: 'Unsupported meter_type' });
      }

      const { data: asset, error: assetError } = await supabase
        .from('assets')
        .select('id, organization_id, site_id, customer_id, status, asset_type')
        .eq('id', assetId)
        .eq('organization_id', tenant.organizationId)
        .maybeSingle();

      if (assetError) throw assetError;
      if (!asset) return res.status(404).json({ error: 'Asset not found in active organization' });
      if (asset.status !== 'ACTIVE') return res.status(409).json({ error: 'Asset is not active' });

      const { data: existing, error: existingError } = await supabase
        .from('meter_readings')
        .select('id, meter_type, reading_kwh, delta_kwh, validation_status')
        .eq('organization_id', tenant.organizationId)
        .eq('reading_key', readingKey)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) return res.status(200).json({ success: true, duplicate: true, reading_id: existing.id, ...existing });

      const { data: history, error: historyError } = await supabase
        .from('meter_readings')
        .select('reading_kwh, captured_at, source, validation_status, metadata')
        .eq('organization_id', tenant.organizationId)
        .eq('asset_id', assetId)
        .eq('meter_type', meterType)
        .order('captured_at', { ascending: false })
        .limit(10);

      if (historyError) throw historyError;

      const validation = await validateReading({
        organizationId: tenant.organizationId,
        assetId,
        actorId: tenant.actorId,
        newKwh: readingKwh,
        confidence,
        meterType,
        imageUrl: photoUrl,
        requestId: req.id,
        logger,
        recentReadings: history ?? [],
        recordFraudSignal: async (signalType, severity, metadata) => {
          const { data: signal, error } = await supabase.from('fraud_signals').insert({
            organization_id: tenant.organizationId,
            actor_id: tenant.actorId,
            customer_id: asset.customer_id,
            site_id: asset.site_id,
            asset_id: asset.id,
            signal_type: signalType,
            severity,
            metadata,
          }).select('id').single();
          if (error) {
            logger.warn({ error, assetId }, 'Fraud signal write failed');
            return;
          }

          const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: signals } = await supabase.from('fraud_signals')
            .select('severity')
            .eq('organization_id', tenant.organizationId)
            .eq('asset_id', asset.id)
            .gte('created_at', windowStart);

          const score = (signals ?? []).reduce((sum, row) => sum + Number(row.severity ?? 0), 0);
          if (score >= 1) {
            await supabase.from('fraud_alerts').insert({
              organization_id: tenant.organizationId,
              actor_id: tenant.actorId,
              customer_id: asset.customer_id,
              site_id: asset.site_id,
              asset_id: asset.id,
              cumulative_score: score,
              status: 'OPEN',
              metadata: { triggering_signal_id: signal.id },
            });
          }
        },
      });

      if (!validation.valid) {
        return res.status(422).json({ error: validation.reason, flag: validation.flag });
      }

      const observedAt = capturedAt ? new Date(capturedAt) : new Date();
      if (Number.isNaN(observedAt.getTime())) return res.status(400).json({ error: 'Invalid captured_at' });

      const value = {
        reading_kwh: Number(readingKwh),
        meter_type: meterType,
        delta_kwh: validation.delta,
        confidence: Number(confidence),
        source,
        validation_status: 'VALIDATED',
        validation_flag: validation.flag ?? null,
        image_hash: validation.imageHash ?? null,
      };

      const { data: observation, error: observationError } = await supabase.from('observations').insert({
        organization_id: tenant.organizationId,
        actor_id: tenant.actorId,
        source,
        observation_type: 'METER_READING',
        observed_at: observedAt.toISOString(),
        customer_id: asset.customer_id,
        site_id: asset.site_id,
        asset_id: asset.id,
        value,
        provenance: {
          request_id: req.id,
          reading_key: readingKey,
          validation: { confidence: Number(confidence), flag: validation.flag ?? null, hamming_distance: validation.hammingDistance ?? null },
        },
        raw_reference: readingKey,
        correlation_id: req.header('x-correlation-id') || req.id,
      }).select('id').single();

      if (observationError) throw observationError;

      const { data: reading, error: insertError } = await supabase.from('meter_readings').insert({
        organization_id: tenant.organizationId,
        actor_id: tenant.actorId,
        customer_id: asset.customer_id,
        site_id: asset.site_id,
        asset_id: asset.id,
        observation_id: observation.id,
        reading_key: readingKey,
        reading_kwh: Number(readingKwh),
        meter_type: meterType,
        photo_url: photoUrl || null,
        ocr_confidence: confidence == null ? null : Number(confidence),
        validation_status: 'VALIDATED',
        delta_kwh: validation.delta,
        validation_flag: validation.flag ?? null,
        source,
        captured_at: observedAt.toISOString(),
        reporting_period: period(),
        metadata: {
          image_hash: validation.imageHash ?? null,
          hamming_distance: validation.hammingDistance ?? null,
          visual_mismatch: validation.visualMismatch ?? false,
          previous_kwh: validation.prevKwh ?? null,
          max_allowed_kwh: validation.maxAllowed ?? null,
        },
      }).select('id, reading_kwh, delta_kwh, meter_type, validation_status').single();

      if (insertError) throw insertError;

      return res.status(201).json({
        success: true,
        reading_id: reading.id,
        observation_id: observation.id,
        delta_kwh: validation.delta,
        meter_type: reading.meter_type,
        validation_status: reading.validation_status,
      });
    } catch (error) {
      logger.error({ err: error }, 'Canonical reading ingestion failed');
      return res.status(statusFor(error)).json({ error: error instanceof Error ? error.message : 'Reading ingestion failed' });
    }
  });

  return router;
}

export default createReadingsRouter;
