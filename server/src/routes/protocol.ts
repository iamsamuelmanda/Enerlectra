// server/routes/protocol.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Validate env vars
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// UUID validation helper
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Normalize phone number
function normalizePhone(phone: string): string {
  return phone.replace(/[\+\s\-\(\)]/g, '');
}

// Get reporting period helper
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// FX Rate fetcher
async function getFXRate(): Promise<number> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  const FALLBACK = 28.45;
  
  if (!API_KEY) {
    console.warn('[FX] No API key, using fallback');
    return FALLBACK;
  }
  
  try {
    const axios = (await import('axios')).default;
    const res = await axios.get(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`,
      { timeout: 3000 }
    );
    return res.data?.conversion_rates?.ZMW || FALLBACK;
  } catch (err: any) {
    console.warn('[FX] Fetch failed:', err.message);
    return FALLBACK;
  }
}

// GET /api/protocol/market-state
router.get('/market-state', async (req, res) => {
  const hour = new Date().getHours();
  
  // Temporal Engine
  const getPremium = (h: number) => {
    if (h >= 18 && h <= 22) return 1.45;
    if (h >= 22 || h <= 6) return 0.85;
    return 1.05;
  };

  const fxRate = await getFXRate();
  const currentPremium = getPremium(hour);
  
  // Protocol constants (documented for auditability)
  const PCU_PEG_USD = 1.00;
  const KWH_PER_PCU = 1.00;

  res.json({
    // Protocol foundation
    pcuPegUsd: PCU_PEG_USD,
    kwhPerPcu: KWH_PER_PCU,
    
    // Market reality
    fxRate,
    currentPremium,
    temporalBand: hour >= 18 && hour <= 22 ? 'peak' : hour >= 22 || hour <= 6 ? 'off-peak' : 'standard',
    
    // Computed
    pcuValueZMW: fxRate * PCU_PEG_USD * currentPremium,
    
    timestamp: new Date().toISOString()
  });
});

// POST /api/protocol/readings/ingest
router.post('/readings/ingest', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { clusterId, unitId, userId, readingKwh, meterType, photoUrl, confidence, signal } = req.body;
    
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
        reading_kwh: readingKwh || 0,
        meter_type: meterType || 'unit',
        photo_url: photoUrl || null,
        ocr_confidence: confidence || null,
        signal: signal || null,
        source: 'telegram',
        reporting_period: getCurrentPeriod()
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
      durationMs: duration
    });

  } catch (err: any) {
    console.error('[INGEST ERROR]', err);
    res.status(202).json({ 
      status: 'pending_reconciliation',
      error: err.message
    });
  }
});

export default router;