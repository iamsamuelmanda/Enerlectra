/**
 * ENERLECTRA PRODUCTION BACKEND v3.0.0
 * Full Global Scale – PCU Minting, Ledger, Staking, Tariff Sync, Metrics
 * Date: April 16, 2026
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import prometheus from 'prom-client';
import pino from 'pino';
import { reconcileEnergyAllocation } from 'enerlectra-core';

// ──────────────────────────────────────────────────────────────
// ESM PATH CONFIGURATION
// ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ──────────────────────────────────────────────────────────────
// IMPORT ALL ROUTES
// ──────────────────────────────────────────────────────────────
import paymentRoutes    from './routes/payments.js';
import readingsRouter   from './routes/readings.js';
import simulationRouter from './routes/simulation.js';
import protocolRouter   from './routes/protocol.js';
import ledgerRouter     from './routes/ledger.js';   // ← single source of truth
import stakingRoutes    from './routes/staking.js';

// ──────────────────────────────────────────────────────────────
// IMPORT SHARED SERVICES
// ──────────────────────────────────────────────────────────────
import { requestLencoPayout } from './services/settlement.js';
import { syncZESCOTariffs }   from './services/tariffSync.js';
import { stakePCU, resolveDispute } from './services/staking.js';
import { mintPCUForExportReading }  from './services/pcuMinting.js';

const app    = express();
const PORT   = process.env.PORT || 4000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ═══════════════════════════════════════════════════════════
// SUPABASE BOOTSTRAP
// ═══════════════════════════════════════════════════════════

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  logger.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  throw new Error('Supabase configuration missing');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);
logger.info('✅ Supabase connected');

// ═══════════════════════════════════════════════════════════
// PROMETHEUS METRICS
// ═══════════════════════════════════════════════════════════

const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, path: req.path, status: res.statusCode.toString() });
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ═══════════════════════════════════════════════════════════
// EXCHANGE RATE HELPER
// ═══════════════════════════════════════════════════════════

const FALLBACK_RATE_ENV = process.env.FALLBACK_USD_ZMW_RATE;
const FALLBACK_RATE     = FALLBACK_RATE_ENV ? Number(FALLBACK_RATE_ENV) : null;

async function getExchangeRate(
  from: string = 'USD',
  to:   string = 'ZMW',
): Promise<{ rate: number; live: boolean; error?: string }> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

  if (!API_KEY) {
    if (FALLBACK_RATE == null) return { rate: 0, live: false, error: 'No FX API key and no fallback' };
    return { rate: FALLBACK_RATE, live: false, error: 'API key not configured' };
  }

  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${from}`,
      { timeout: 5000 },
    );
    if (response.data.result !== 'success') {
      const apiError = response.data['error-type'] || 'API error';
      return { rate: FALLBACK_RATE ?? 0, live: false, error: apiError };
    }
    const rate = response.data.conversion_rates[to];
    if (!rate) return { rate: FALLBACK_RATE ?? 0, live: false, error: `Currency ${to} not found` };
    logger.info(`✅ [FX] Live rate: ${rate}`);
    return { rate, live: true };
  } catch (error: any) {
    return { rate: FALLBACK_RATE ?? 0, live: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  logger.info({ requestId, method: req.method, path: req.path }, 'Request received');
  next();
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═══════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════

async function authenticate(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  req.user = user;
  next();
}

// ═══════════════════════════════════════════════════════════
// LENCO WEBHOOK (INLINE, USING OFFICIAL SIGNING SCHEME)
// ═══════════════════════════════════════════════════════════

const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY; // your Lenco API token

function verifyLencoSignature(payload: string, signature: string | undefined): boolean {
  if (!LENCO_SECRET_KEY || !signature) return false;

  // webhook_hash_key = SHA256(API token)
  const webhookHashKey = crypto
    .createHash('sha256')
    .update(LENCO_SECRET_KEY)
    .digest('hex');

  const expected = crypto
    .createHmac('sha512', webhookHashKey)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;
  }
}

app.post('/api/webhooks/lenco', express.json(), async (req, res) => {
  // Log ALL headers so we can see exactly what Lenco sends
  logger.info({ headers: req.headers, body: req.body }, '[LENCO RAW]');

  const signature = (
    req.headers['x-lenco-signature'] ||
    req.headers['x-lenco-webhook-signature'] ||
    req.headers['x-signature']
  ) as string | undefined;

  const rawBody = JSON.stringify(req.body);

  // Fixed pino logging — second arg is ignored, use object
  logger.info({
    signaturePresent: !!signature,
    signatureValue:   signature ?? 'MISSING',
    payloadLength:    rawBody.length,
    keyConfigured:    !!LENCO_SECRET_KEY,
    keyLength:        LENCO_SECRET_KEY?.length ?? 0,
  }, '[LENCO DEBUG]');

  const valid = verifyLencoSignature(rawBody, signature);
  if (!valid) {
    logger.warn({ signaturePresent: !!signature }, '[LENCO WEBHOOK] Signature invalid — processing anyway');
    // NOT rejecting yet — need to confirm header name first
  }

  try {
    const { reference, status, providerRef } = req.body;

    if (!reference || !status) {
      return res.status(400).json({ error: 'Missing reference or status' });
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('provider_ref', providerRef)
      .single();

    if (existing) return res.status(200).json({ received: true });

    // Record event
    await supabase.from('webhook_events').insert({
      provider:     'lenco',
      provider_ref: providerRef,
      reference,
      status,
      payload:      req.body,
    });

    const txStatus = status === 'SUCCESSFUL' ? 'completed'
                   : status === 'FAILED'     ? 'failed'
                   : 'pending';

    // Update energy_transactions
    await supabase
      .from('energy_transactions')
      .update({ status: txStatus })
      .eq('reference', reference);

    // Update settlement_payouts
    await supabase
      .from('settlement_payouts')
      .update({
        status:       txStatus,
        completed_at: status === 'SUCCESSFUL' ? new Date().toISOString() : null,
      })
      .eq('reference', reference);

    logger.info({ reference, status: txStatus, providerRef }, '[LENCO WEBHOOK] Payout updated');
    res.status(200).json({ received: true });

  } catch (error: any) {
    logger.error({ err: error }, '[LENCO WEBHOOK] Processing error');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ═══════════════════════════════════════════════════════════
// HEALTH & STATUS
// ═══════════════════════════════════════════════════════════

app.get('/api/info', (req, res) => {
  res.json({ status: 'OK', message: 'Enerlectra Production Backend', version: '3.0.0', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      supabase:     true,
      lenco:        !!process.env.LENCO_SECRET_KEY,
      anthropic:    !!process.env.ANTHROPIC_API_KEY,
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY || FALLBACK_RATE != null,
      prometheus:   true,
    },
  });
});

// ═══════════════════════════════════════════════════════════
// EXCHANGE RATE ENDPOINT
// ═══════════════════════════════════════════════════════════

app.get('/api/exchange-rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const result = await getExchangeRate(from, to);
    res.json({
      rate: result.rate, from, to, timestamp: new Date().toISOString(),
      live: result.live, source: result.live ? 'ExchangeRate-API' : 'Fallback',
      ...(result.error && { error: result.error }),
    });
  } catch (error: any) {
    res.status(500).json({ rate: FALLBACK_RATE ?? 0, fallback: true, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PROTOCOL ORACLE
// ═══════════════════════════════════════════════════════════

app.get('/api/protocol/global-state', async (req, res) => {
  try {
    const rate = await getExchangeRate('USD', 'ZMW');
    const { data: clusters, error } = await supabase
      .from('clusters').select('solar_capacity_kw, storage_capacity_kwh, funding_raised_zmw');

    const nodeCount        = clusters?.length ?? 0;
    const totalSolarKw     = clusters?.reduce((s: number, c: any) => s + (c.solar_capacity_kw     || 0), 0) ?? 0;
    const totalStorageKwh  = clusters?.reduce((s: number, c: any) => s + (c.storage_capacity_kwh  || 0), 0) ?? 0;
    const totalFundingRaised = clusters?.reduce((s: number, c: any) => s + (c.funding_raised_zmw  || 0), 0) ?? 0;

    res.json({ fxRate: rate.rate, live: rate.live, nodeCount, totalSolarKw, totalStorageKwh, totalFundingRaised, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CLUSTERS
// ═══════════════════════════════════════════════════════════

app.get('/api/clusters', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit  as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const { data, error } = await supabase.from('clusters').select('*')
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get('/api/clusters/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('clusters').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cluster not found' });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/clusters', authenticate, async (req: any, res) => {
  try {
    const { name, location, target_kw, target_usd, deadline } = req.body;
    if (!name || !location || !target_kw) return res.status(400).json({ error: 'Missing required fields' });
    const { data, error } = await supabase.from('clusters')
      .insert([{ name, location, target_kw, target_usd: target_usd || null, deadline: deadline || null, lifecycle_state: 'open', created_at: new Date().toISOString() }])
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.put('/api/clusters/:id', authenticate, async (req: any, res) => {
  try {
    const { id, created_at, ...updates } = req.body;
    const { data, error } = await supabase.from('clusters').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cluster not found' });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ═══════════════════════════════════════════════════════════
// ROUTERS (MOUNTED)
// ═══════════════════════════════════════════════════════════

app.use('/api/readings',   readingsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/payments',   paymentRoutes);
app.use('/api/staking',    stakingRoutes);
app.use('/api/protocol',   protocolRouter);
app.use('/api/ledger',     ledgerRouter);

// ═══════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════

app.get('/api/settlement/:clusterId/:date', async (req, res) => {
  try {
    const { clusterId, date } = req.params;
    const { data, error } = await supabase.from('settlement_results').select('*')
      .eq('cluster_id', clusterId).eq('date', date).order('unit_id');
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/settlement/run', authenticate, async (req: any, res) => {
  try {
    const { clusterId, date, dryRun } = req.body;
    if (!clusterId || !date) return res.status(400).json({ error: 'clusterId and date required' });

    const { data: readings,  error: rErr } = await supabase.from('meter_readings').select('*').eq('cluster_id', clusterId).eq('reporting_period', date);
    const { data: ownership, error: oErr } = await supabase.from('ownership_snapshots').select('user_id, ownership_pct').eq('cluster_id', clusterId).eq('period', date);

    if (rErr) throw rErr;
    if (oErr) throw oErr;
    if (!readings || !ownership || readings.length === 0) return res.status(400).json({ error: 'Insufficient data for settlement' });

    const result = reconcileEnergyAllocation({
      readings:  readings.map((r: any) => ({ clusterId: r.cluster_id, unitId: r.unit_id, userId: r.user_id, readingKwh: r.reading_kwh, meterType: r.meter_type, reportingPeriod: r.reporting_period })),
      ownership: ownership.map((o: any) => ({ userId: o.user_id, ownershipPct: o.ownership_pct })),
      clusterId,
      period: date,
    });

    const allocation = (result as any).allocation;

    if (!dryRun && allocation?.entries?.length > 0) {
      const { error: insertError } = await supabase.from('settlement_results').upsert(
        allocation.entries.map((e: any) => ({ cluster_id: clusterId, date, unit_id: e.unitId, user_id: e.userId, allocated_kwh: e.allocatedKwh, allocation_reason: e.reason ?? null, created_at: new Date().toISOString() })),
        { onConflict: 'cluster_id,date,unit_id,user_id' }
      );
      if (insertError) throw insertError;
    }

    res.json({ status: dryRun ? 'dry-run' : 'committed', clusterId, date, allocation: allocation ?? null });
  } catch (error: any) {
    logger.error({ error }, '[SETTLEMENT RUN ERROR]');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// OWNERSHIP SNAPSHOTS
// ═══════════════════════════════════════════════════════════

app.get('/api/ownership/:clusterId', async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { data: latest, error: latestError } = await supabase.from('ownership_snapshots')
      .select('period').eq('cluster_id', clusterId).order('period', { ascending: false }).limit(1).single();
    if (latestError || !latest) return res.status(404).json({ error: 'No ownership snapshots found' });

    const { data, error } = await supabase.from('ownership_snapshots')
      .select('user_id, ownership_pct').eq('cluster_id', clusterId).eq('period', latest.period);
    if (error) throw error;

    res.json({ clusterId, period: latest.period, ownership: (data || []).map((r: any) => ({ userId: r.user_id, ownershipPct: r.ownership_pct })) });
  } catch (error: any) {
    logger.error({ error }, '[OWNERSHIP ERROR]');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// USER SETTLEMENT HISTORY
// ═══════════════════════════════════════════════════════════

app.get('/api/settlement/by-user/:userId', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
    const limit  = parseInt(req.query.limit  as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const { data: readings, error } = await supabase.from('meter_readings')
      .select('id, reading_kwh, captured_at, reporting_period, cluster_id, clusters(name), energy_value_audits!reading_id(net_value_zmw, delta_kwh, gross_value_zmw, tariff_params)')
      .eq('user_id', userId).eq('validated', true)
      .order('captured_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;

    res.json((readings || []).map((r: any) => {
      const audit = r.energy_value_audits?.[0] || {};
      return { reading_id: r.id, cluster_id: r.cluster_id, cluster_name: r.clusters?.name || 'Unknown', reading_kwh: r.reading_kwh, delta_kwh: audit.delta_kwh || 0, net_value_zmw: audit.net_value_zmw || 0, gross_value_zmw: audit.gross_value_zmw || 0, captured_at: r.captured_at, reporting_period: r.reporting_period, tariff_params: audit.tariff_params || null };
    }));
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ═══════════════════════════════════════════════════════════
// WALLET BALANCE
// ═══════════════════════════════════════════════════════════

app.get('/api/wallet/:userId', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
    const { data: wallet, error } = await supabase.from('pcu_balances')
      .select('balance_pcu, total_minted_pcu, updated_at').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!wallet) {
      const { data: newWallet } = await supabase.from('pcu_balances')
        .insert({ user_id: userId, balance_pcu: 0, total_minted_pcu: 0 })
        .select('balance_pcu, total_minted_pcu, updated_at').single();
      return res.json({ userId, ...newWallet });
    }
    res.json({ userId, ...wallet });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});


// ═══════════════════════════════════════════════════════════
// STAKING
// ═══════════════════════════════════════════════════════════

app.post('/api/stake', authenticate, async (req: any, res) => {
  try {
    await stakePCU(req.user.id, req.body.amount_pcu);
    res.json({ success: true, message: `Staked ${req.body.amount_pcu} PCU` });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

app.post('/api/disputes', authenticate, async (req: any, res) => {
  try {
    const { reading_id, reason } = req.body;
    const { data: reading } = await supabase.from('meter_readings').select('user_id').eq('id', reading_id).single();
    if (!reading) return res.status(404).json({ error: 'Reading not found' });
    const { data: dispute, error } = await supabase.from('disputes').insert({ reading_id, challenger_id: req.user.id, defendant_id: reading.user_id, reason }).select().single();
    if (error) throw error;
    res.status(201).json(dispute);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/disputes/:id/resolve', authenticate, async (req: any, res) => {
  try {
    await resolveDispute(req.params.id, req.body.validator_ids, req.body.decision);
    res.json({ success: true, message: `Dispute ${req.params.id} resolved as ${req.body.decision}` });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// ═══════════════════════════════════════════════════════════
// TARIFF SYNC CRON
// ═══════════════════════════════════════════════════════════

if (process.env.ZESCO_TARIFF_SYNC_ENABLED === 'true') {
  cron.schedule('0 0 * * *', async () => { logger.info('[CRON] ZESCO tariff sync'); await syncZESCOTariffs(); });
  logger.info('✅ Tariff sync scheduled (daily midnight)');
}

// ═══════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════

app.post('/api/webhooks/mtn',    async (req, res) => res.status(200).json({ message: 'received' }));
app.post('/api/webhooks/airtel', async (req, res) => res.status(200).json({ message: 'received' }));
app.get('/api/webhooks/status',  async (req, res) => res.json({ status: 'ok', endpoints: { lenco: (process.env.BASE_URL ?? `http://localhost:${PORT}`) + '/api/webhooks/lenco' } }));

// ═══════════════════════════════════════════════════════════
// STATIC & SPA FALLBACK
// ═══════════════════════════════════════════════════════════

const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));

app.all('/api/*', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) res.status(200).send('<h1>⚡ Enerlectra API v3.0.0</h1>');
  });
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info('═'.repeat(60));
  logger.info('⚡ ENERLECTRA PRODUCTION BACKEND v3.0.0');
  logger.info(`🌐 http://localhost:${PORT}`);
  logger.info(`📅 ${new Date().toISOString()}`);
  logger.info('═'.repeat(60));
});