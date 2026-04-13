// server/routes/protocol.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[+\s\-\(\)]/g, '');
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fetch live USD/ZMW exchange rate.
 * Returns { rate: number | null, live: boolean }.
 * If API fails, rate is null and live is false.
 */
async function getLiveFXRate(): Promise<{ rate: number | null; live: boolean }> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  if (!API_KEY) {
    console.warn('[FX] No API key configured');
    return { rate: null, live: false };
  }

  try {
    const axios = (await import('axios')).default;
    const res = await axios.get(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`,
      { timeout: 5000 }
    );
    const rate = res.data?.conversion_rates?.ZMW;
    if (typeof rate === 'number' && rate > 0) {
      return { rate, live: true };
    }
    console.warn('[FX] Invalid rate in response');
    return { rate: null, live: false };
  } catch (err: any) {
    console.warn('[FX] Fetch failed:', err.message);
    return { rate: null, live: false };
  }
}

/**
 * Time‑based demand multiplier.
 * Transparent heuristic until real grid data becomes available.
 * Peak: 18:00–22:00 local
 * Off‑peak: 22:00–06:00 local
 * Standard: 06:00–18:00 local
 */
const getTimeBasedPremium = (hour: number): number => {
  if (hour >= 18 && hour <= 22) return 1.45;
  if (hour >= 22 || hour <= 6) return 0.85;
  return 1.05;
};

/**
 * GET /api/protocol/market-state
 *
 * Returns:
 * - FX index (USD→ZMW)
 * - Time-of-day premium band (heuristic only)
 * - Regulated tariff reference (from tariff_bands)
 * - Last cleared PCU price (from energy_value_audits)
 */
router.get('/market-state', async (req, res) => {
  try {
    const hour = new Date().getHours();
    const currentPremium = getTimeBasedPremium(hour);
    const temporalBand =
      hour >= 18 && hour <= 22
        ? 'peak'
        : hour >= 22 || hour <= 6
        ? 'off-peak'
        : 'standard';

    const [{ rate: fxRate, live }, tariffRes, auditRes] = await Promise.all([
      getLiveFXRate(),
      // Use the "current" residential reference tariff based on date
      supabase
        .from('tariff_bands')
        .select('code, band_name, rate_kz, start_date, end_date')
        .lte('start_date', new Date().toISOString().slice(0, 10))
        .gte('end_date', new Date().toISOString().slice(0, 10))
        .eq('category', 'residential') // add this column in tariff_bands if not present
        .order('kwh_min', { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Last value calculation as proxy for last PCU clearing price
      supabase
        .from('energy_value_audits')
        .select('net_value_zmw, delta_kwh, created_at')
        .gt('delta_kwh', 0)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const referenceTariff = tariffRes?.data ?? null;
    const lastAudit = (auditRes.data && auditRes.data[0]) || null;

    const lastPcuPriceKz =
      lastAudit && lastAudit.delta_kwh
        ? lastAudit.net_value_zmw / lastAudit.delta_kwh
        : null;

    res.json({
      fxRate,
      liveFx: live,
      currentPremium,
      temporalBand,
      // Regulated reference tariff (ZESCO/ERB-backed)
      zescoReferenceRate: referenceTariff?.rate_kz ?? null,
      zescoTariffCode: referenceTariff?.code ?? null,
      zescoTariffBand: referenceTariff?.band_name ?? null,
      zescoTariffValidFrom: referenceTariff?.start_date ?? null,
      zescoTariffValidTo: referenceTariff?.end_date ?? null,
      // Market truth: last protocol settlement
      lastPcuPriceKz,
      lastPcuWindowAt: lastAudit?.created_at ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[MARKET STATE ERROR]', err);
    res.status(500).json({ error: 'market_state_failed' });
  }
});

// POST /api/protocol/readings/ingest
router.post('/readings/ingest', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      clusterId,
      unitId,
      userId,
      readingKwh,
      meterType,
      photoUrl,
      confidence,
      signal,
      source,
    } = req.body;

    if (!clusterId || !unitId) {
      return res.status(400).json({ error: 'clusterId and unitId required' });
    }

    let actualUserId: string | null = null;
    let lookupMethod: 'uuid' | 'phone' | 'none' = 'none';

    if (userId) {
      if (isValidUUID(userId)) {
        actualUserId = userId;
        lookupMethod = 'uuid';
      } else {
        const phone = normalizePhone(userId);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, phone')
          .eq('phone', phone)
          .maybeSingle();

        if (!error && profile) {
          actualUserId = profile.id;
          lookupMethod = 'phone';
        }
      }
    }

    const { data, error } = await supabase
      .from('meter_readings')
      .insert({
        cluster_id: clusterId,
        unit_id: unitId,
        user_id: actualUserId,
        reading_kwh: typeof readingKwh === 'number' ? readingKwh : 0,
        meter_type: meterType || 'unit',
        photo_url: photoUrl || null,
        ocr_confidence: typeof confidence === 'number' ? confidence : null,
        signal: signal || null,
        source: source || 'telegram',
        reporting_period: getCurrentPeriod(),
      })
      .select()
      .single();

    if (error) throw error;

    const duration = Date.now() - startTime;

    res.status(201).json({
      status: 'reconciled',
      readingId: data.id,
      userLinked: !!actualUserId,
      lookupMethod,
      durationMs: duration,
    });
  } catch (err: any) {
    console.error('[INGEST ERROR]', err);
    res.status(202).json({
      status: 'pending_reconciliation',
      error: err.message,
    });
  }
});

export default router;