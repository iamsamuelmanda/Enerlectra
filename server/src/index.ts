/**
 * ENERLECTRA PRODUCTION BACKEND v3.0.0
 * Full Global Scale – PCU Minting, Ledger, Staking, Tariff Sync, Metrics
 * Date: April 16, 2026
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import prometheus from 'prom-client';
import pino from 'pino';

// ──────────────────────────────────────────────────────────────
// ESM PATH CONFIGURATION
// ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────
// IMPORT ALL ROUTES
// ──────────────────────────────────────────────────────────────
import paymentRoutes from './routes/payments.js';
import readingsRouter from './routes/readings.js';
import simulationRouter from './routes/simulation.js';
import protocolRouter from './routes/protocol.js';

// ──────────────────────────────────────────────────────────────
// IMPORT SHARED SERVICES
// ──────────────────────────────────────────────────────────────
import { requestLencoPayout } from './services/settlement.js';
import { syncZESCOTariffs } from './services/tariffSync.js';
import { stakePCU, resolveDispute } from './services/staking.js';
import { mintPCUForExportReading } from './services/pcuMinting.js';

// Test import for enerlectra-core (remove after verification)

const app = express();
const PORT = process.env.PORT || 4000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ═══════════════════════════════════════════════════════════
// INITIALIZE SERVICES
// ═══════════════════════════════════════════════════════════

let supabase: any = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    logger.info('✅ Supabase connected');
  } catch (error) {
    logger.warn('⚠️ Supabase not configured, using demo mode');
  }
}

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

async function getExchangeRate(
  from: string = 'USD',
  to: string = 'ZMW'
): Promise<{ rate: number; live: boolean; error?: string }> {
  const FALLBACK_RATE = 28.45;
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

  if (!API_KEY) {
    logger.warn('⚠️ EXCHANGE_RATE_API_KEY not configured, using fallback');
    return { rate: FALLBACK_RATE, live: false, error: 'API key not configured' };
  }

  try {
    const axios = (await import('axios')).default;
    const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${from}`;
    const response = await axios.get(url, { timeout: 5000 });

    if (response.data.result !== 'success') {
      return { rate: FALLBACK_RATE, live: false, error: response.data['error-type'] || 'API error' };
    }

    const rate = response.data.conversion_rates[to];
    if (!rate) {
      return { rate: FALLBACK_RATE, live: false, error: `Currency ${to} not found` };
    }

    logger.info(`✅ [EXCHANGE RATE] Live rate: ${rate}`);
    return { rate, live: true };
  } catch (error: any) {
    logger.error('[EXCHANGE RATE ERROR]', error.message);
    return { rate: FALLBACK_RATE, live: false, error: error.message || 'Unknown error' };
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
// AUTHENTICATION MIDDLEWARE (FOR SUPABASE JWT - FRONTEND)
// Note: Telegram bot uses telegram_users table via resolveUserId
// ═══════════════════════════════════════════════════════════

async function authenticate(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  if (!supabase) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
  req.user = user;
  next();
}

// ═══════════════════════════════════════════════════════════
// LENCO WEBHOOK (WITH SIGNATURE VERIFICATION)
// ═══════════════════════════════════════════════════════════

const LENCO_WEBHOOK_SECRET = process.env.LENCO_WEBHOOK_SECRET!;

function verifyLencoSignature(payload: string, signature: string): boolean {
  if (!LENCO_WEBHOOK_SECRET) return true;
  const expected = crypto.createHmac('sha256', LENCO_WEBHOOK_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post('/api/webhooks/lenco', express.json(), async (req, res) => {
  const signature = req.headers['x-lenco-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifyLencoSignature(rawBody, signature)) {
    logger.warn('[LENCO WEBHOOK] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { reference, status, providerRef } = req.body;

  // Idempotency check
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider_ref', providerRef)
    .single();

  if (existing) {
    return res.status(200).json({ received: true });
  }

  await supabase.from('webhook_events').insert({
    provider: 'lenco',
    provider_ref: providerRef,
    reference,
    status,
    payload: req.body,
  });

  // Update settlement_payouts
  await supabase
    .from('settlement_payouts')
    .update({
      status: status === 'SUCCESSFUL' ? 'completed' : status === 'FAILED' ? 'failed' : 'processing',
      completed_at: status === 'SUCCESSFUL' ? new Date().toISOString() : null,
    })
    .eq('reference', reference);

  logger.info(`[LENCO WEBHOOK] Payout ${reference} ${status}`);
  res.status(200).json({ received: true });
});

// ═══════════════════════════════════════════════════════════
// HEALTH & STATUS
// ═══════════════════════════════════════════════════════════

app.get('/api/info', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      supabase: !!supabase,
      lenco: !!process.env.LENCO_SECRET_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY,
      prometheus: true,
    },
  });
});

// ═══════════════════════════════════════════════════════════
// EXCHANGE RATE
// ═══════════════════════════════════════════════════════════

app.get('/api/exchange-rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const result = await getExchangeRate(from, to);
    res.json({
      rate: result.rate,
      from,
      to,
      timestamp: new Date().toISOString(),
      live: result.live,
      source: result.live ? 'ExchangeRate-API' : 'Fallback',
      ...(result.error && { error: result.error }),
    });
  } catch (error: any) {
    res.status(500).json({ rate: 28.45, fallback: true, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PROTOCOL ORACLE
// ═══════════════════════════════════════════════════════════

app.get('/api/protocol/global-state', async (req, res) => {
  try {
    const rate = await getExchangeRate('USD', 'ZMW');
    let nodeCount = 0, totalSolarKw = 0, totalStorageKwh = 0, totalFundingRaised = 0;
    if (supabase) {
      const { data: clusters, error } = await supabase
        .from('clusters')
        .select('solar_capacity_kw, storage_capacity_kwh, funding_raised_zmw');
      if (!error) {
        nodeCount = clusters?.length || 0;
        totalSolarKw = clusters?.reduce((s: number, c: any) => s + (c.solar_capacity_kw || 0), 0) || 0;
        totalStorageKwh = clusters?.reduce((s: number, c: any) => s + (c.storage_capacity_kwh || 0), 0) || 0;
        totalFundingRaised = clusters?.reduce((s: number, c: any) => s + (c.funding_raised_zmw || 0), 0) || 0;
      }
    }
    res.json({
      fxRate: rate.rate,
      live: rate.live,
      nodeCount,
      totalSolarKw,
      totalStorageKwh,
      totalFundingRaised,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// OPENAPI DOCS
// ═══════════════════════════════════════════════════════════

app.get('/api/docs', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Enerlectra API v3.0.0</title></head><body style="font-family:system-ui;max-width:800px;margin:2rem auto;background:#0f172a;color:#e2e8f0;"><h1>⚡ Enerlectra API v3.0.0</h1><p>Full production endpoints available.</p><h2>Core Endpoints</h2><ul><li>GET /api/health</li><li>GET /api/protocol/global-state</li><li>GET /api/clusters</li><li>GET /api/settlement/by-user/:userId</li><li>GET /api/wallet/:userId</li><li>POST /api/payments/redeem</li><li>POST /api/stake</li><li>POST /api/disputes</li><li>GET /metrics</li></ul><p>Authenticated endpoints require Bearer token.</p></body></html>`);
});

// ═══════════════════════════════════════════════════════════
// CLUSTERS (with pagination)
// ═══════════════════════════════════════════════════════════

app.get('/api/clusters', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clusters/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(404).json({ error: 'Not found' });
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cluster not found' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clusters', authenticate, async (req: any, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { name, location, target_kw, target_usd, deadline } = req.body;
    if (!name || !location || !target_kw) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const { data, error } = await supabase
      .from('clusters')
      .insert([{ name, location, target_kw, target_usd: target_usd || null, deadline: deadline || null, lifecycle_state: 'open', created_at: new Date().toISOString() }])
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clusters/:id', authenticate, async (req: any, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { id, created_at, ...updates } = req.body;
    const { data, error } = await supabase
      .from('clusters')
      .update(updates)
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cluster not found' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTERS (MOUNTED)
// ═══════════════════════════════════════════════════════════

app.use('/api/readings', readingsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/protocol', protocolRouter);

// ═══════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════

app.get('/api/settlement/:clusterId/:date', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { clusterId, date } = req.params;
    const { data, error } = await supabase
      .from('settlement_results')
      .select('*')
      .eq('cluster_id', clusterId)
      .eq('date', date)
      .order('unit_id');
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// FIXED: Explicitly return 501 Not Implemented
app.post('/api/settlement/run', authenticate, async (req: any, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

// ═══════════════════════════════════════════════════════════
// OWNERSHIP (FIXED: Explicitly return 501 Not Implemented)
// ═══════════════════════════════════════════════════════════

app.get('/api/ownership/:clusterId', async (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

// ═══════════════════════════════════════════════════════════
// USER SETTLEMENT HISTORY (AUTHENTICATED + PAGINATED)
// ═══════════════════════════════════════════════════════════

app.get('/api/settlement/by-user/:userId', authenticate, async (req: any, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const { data: readings, error } = await supabase
      .from('meter_readings')
      .select(`id, reading_kwh, captured_at, reporting_period, cluster_id, clusters(name), energy_value_audits!reading_id(net_value_zmw, delta_kwh, gross_value_zmw, tariff_params)`)
      .eq('user_id', userId)
      .eq('validated', true)
      .order('captured_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const settlements = (readings || []).map((r: any) => {
      const audit = r.energy_value_audits?.[0] || {};
      return {
        reading_id: r.id,
        cluster_id: r.cluster_id,
        cluster_name: r.clusters?.name || 'Unknown',
        reading_kwh: r.reading_kwh,
        delta_kwh: audit.delta_kwh || 0,
        net_value_zmw: audit.net_value_zmw || 0,
        gross_value_zmw: audit.gross_value_zmw || 0,
        captured_at: r.captured_at,
        reporting_period: r.reporting_period,
        tariff_params: audit.tariff_params || null,
      };
    });
    res.json(settlements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// WALLET BALANCE (AUTHENTICATED)
// ═══════════════════════════════════════════════════════════

app.get('/api/wallet/:userId', authenticate, async (req: any, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
    const { data: wallet, error } = await supabase
      .from('energy_wallets')
      .select('available_pcu, lifetime_pcu, created_at')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!wallet) {
      const { data: newWallet } = await supabase
        .from('energy_wallets')
        .insert({ user_id: userId, available_pcu: 0, lifetime_pcu: 0 })
        .select('available_pcu, lifetime_pcu, created_at')
        .single();
      return res.json({ userId, ...newWallet });
    }
    res.json({ userId, ...wallet });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// REDEEM PCU (AUTHENTICATED + RATE LIMITED + IDEMPOTENT)
// FIXED: Use logger instead of console
// ═══════════════════════════════════════════════════════════

app.post('/api/payments/redeem', authenticate, sensitiveLimiter, async (req: any, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { amount_pcu, phone_number, idempotencyKey } = req.body;
    const userId = req.user.id;
    if (!amount_pcu || !phone_number) return res.status(400).json({ error: 'Missing required fields' });
    if (amount_pcu <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('energy_transactions')
        .select('id')
        .eq('metadata->>idempotencyKey', idempotencyKey)
        .single();
      if (existing) return res.status(409).json({ error: 'Duplicate request' });
    }

    const { data: wallet } = await supabase
      .from('energy_wallets')
      .select('available_pcu')
      .eq('user_id', userId)
      .single();
    if (!wallet || wallet.available_pcu < amount_pcu) {
      return res.status(400).json({ error: 'Insufficient PCU balance' });
    }

    const { data: membership } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(1)
      .single();
    const clusterId = membership?.cluster_id || 'clu_73x96b83';

    const rateResult = await getExchangeRate('USD', 'ZMW');
    const fxRate = rateResult.rate;
    const amount_zmw = amount_pcu * fxRate;

    const payout = await requestLencoPayout({
      userId, clusterId, amount: amount_zmw, phoneNumber: phone_number,
      narration: `PCU Redemption – ${amount_pcu} PCU → ZMW ${amount_zmw.toFixed(2)}`,
    }, logger); // FIXED: using proper logger

    await supabase
      .from('energy_wallets')
      .update({ available_pcu: wallet.available_pcu - amount_pcu, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    await supabase.from('energy_transactions').insert({
      from_user_id: userId, to_user_id: null, pcu_amount: amount_pcu, zmw_amount: amount_zmw,
      transaction_type: 'redeem', status: payout.status === 'processing' ? 'pending' : payout.status,
      reference: payout.reference, metadata: { phone_number, fx_rate: fxRate, provider_ref: payout.providerRef, idempotencyKey },
    });

    res.json({
      success: true, reference: payout.reference, status: payout.status,
      amount_pcu, amount_zmw, remaining_pcu: wallet.available_pcu - amount_pcu,
      message: `Redemption of ${amount_pcu} PCU initiated.`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// ═══════════════════════════════════════════════════════════
// STAKING ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.post('/api/stake', authenticate, async (req: any, res) => {
  try {
    const { amount_pcu } = req.body;
    const userId = req.user.id;
    await stakePCU(userId, amount_pcu);
    res.json({ success: true, message: `Staked ${amount_pcu} PCU` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/disputes', authenticate, async (req: any, res) => {
  try {
    const { reading_id, reason } = req.body;
    const challenger_id = req.user.id;

    const { data: reading } = await supabase
      .from('meter_readings')
      .select('user_id')
      .eq('id', reading_id)
      .single();
    if (!reading) return res.status(404).json({ error: 'Reading not found' });

    const { data: dispute, error } = await supabase
      .from('disputes')
      .insert({ reading_id, challenger_id, defendant_id: reading.user_id, reason })
      .select().single();
    if (error) throw error;

    res.status(201).json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disputes/:id/resolve', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { validator_ids, decision } = req.body;
    await resolveDispute(id, validator_ids, decision);
    res.json({ success: true, message: `Dispute ${id} resolved as ${decision}` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// TARIFF SYNC (CRON JOB)
// ═══════════════════════════════════════════════════════════

if (process.env.ZESCO_TARIFF_SYNC_ENABLED === 'true') {
  cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Running ZESCO tariff sync...');
    await syncZESCOTariffs();
  });
  logger.info('✅ Tariff sync cron job scheduled (daily at midnight)');
}

// ═══════════════════════════════════════════════════════════
// WEBHOOKS (MTN, AIRTEL)
// ═══════════════════════════════════════════════════════════

app.post('/api/webhooks/mtn', async (req, res) => {
  res.status(200).json({ message: 'received' });
});

app.post('/api/webhooks/airtel', async (req, res) => {
  res.status(200).json({ message: 'received' });
});

app.get('/api/webhooks/status', async (req, res) => {
  res.json({ status: 'ok', endpoints: { lenco: process.env.BASE_URL + '/api/webhooks/lenco' } });
});

// ═══════════════════════════════════════════════════════════
// STATIC ASSET SERVING & SPA FALLBACK (FIXED)
// ═══════════════════════════════════════════════════════════

const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));

// Catch API 404s
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve SPA for all other routes
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <h1>⚡ Enerlectra API v3.0.0</h1>
        <p>Production Backend is Live and Healthy.</p>
      `);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info('═'.repeat(70));
  logger.info(`⚡ ENERLECTRA PRODUCTION BACKEND v3.0.0 – GLOBAL SCALE`);
  logger.info('═'.repeat(70));
  logger.info(`🌐 Server: http://localhost:${PORT}`);
  logger.info(`📅 Started: ${new Date().toISOString()}`);
  logger.info('📊 SERVICES: Supabase, Lenco, Prometheus, Cron, Staking, Ledger');
  logger.info('═'.repeat(70));
});
