// server/src/index.ts
// ENERLECTRA PRODUCTION BACKEND v3.1.0 – Full Marketplace + Settlement Engine
// Entry point for the Enerlectra Protocol coordination layer.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import prometheus from 'prom-client';
import pino from 'pino';

// ──────────────────────────────────────────────────────────────
// ESM path configuration
// ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────
// Import route modules
// ──────────────────────────────────────────────────────────────
import paymentRoutes from './routes/payments.js';
import readingsRouter from './routes/readings.js';
import simulationRouter from './routes/simulation.js';
import protocolRouter from './routes/protocol.js';
import stakingRoutes from './routes/staking.js';
import ledgerRoutes from './routes/ledger.js';
import marketplaceRoutes from './routes/marketplace.js';
import settlementRoutes from './routes/settlement.js';

// ──────────────────────────────────────────────────────────────
// Import background jobs
// ──────────────────────────────────────────────────────────────
import './jobs/settlementCron.js';
import './jobs/matchingCron.js';
import './jobs/payoutProcessorCron.js';

// ──────────────────────────────────────────────────────────────
// Import shared services (used directly in endpoints)
// ──────────────────────────────────────────────────────────────
import { requestLencoPayout } from './services/settlement.js';
import { syncZESCOTariffs } from './services/tariffSync.js';
import { stakePCU, resolveDispute } from './services/staking.js';
import { mintPCUForExportReading } from './services/pcuMinting.js';
import { runClusterSettlement } from './services/clusterSettlementEngine.js';

// ──────────────────────────────────────────────────────────────
// Express app setup
// ──────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 4000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ──────────────────────────────────────────────────────────────
// Supabase client (service role – bypasses RLS)
// ──────────────────────────────────────────────────────────────
let supabase: any = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    logger.info('✅ Supabase connected');
  } catch (error) {
    logger.warn('⚠️ Supabase not configured, running in demo mode');
  }
}

// ──────────────────────────────────────────────────────────────
// Prometheus metrics
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Global middleware
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Authentication middleware (Supabase JWT – for frontend)
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Exchange rate helper (used across endpoints)
// ──────────────────────────────────────────────────────────────
async function getExchangeRate(from: string = 'USD', to: string = 'ZMW'): Promise<{ rate: number; live: boolean; error?: string }> {
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
    logger.error({ err: error?.message ?? error }, '[EXCHANGE RATE ERROR]');
    return { rate: FALLBACK_RATE, live: false, error: error.message || 'Unknown error' };
  }
}

// ──────────────────────────────────────────────────────────────
// Health & Info endpoints
// ──────────────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '3.1.0',
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

// ──────────────────────────────────────────────────────────────
// Exchange rate endpoint
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Protocol Oracle (global state for dashboard)
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// OpenAPI docs stub
// ──────────────────────────────────────────────────────────────
app.get('/api/docs', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Enerlectra API v3.1.0</title></head><body style="font-family:system-ui;max-width:800px;margin:2rem auto;background:#0f172a;color:#e2e8f0;"><h1>⚡ Enerlectra API v3.1.0</h1><p>Full production endpoints available.</p><h2>Core Endpoints</h2><ul><li>GET /api/health</li><li>GET /api/protocol/global-state</li><li>GET /api/clusters</li><li>GET /api/settlement/by-user/:userId</li><li>GET /api/wallet/:userId</li><li>POST /api/payments/redeem</li><li>POST /api/marketplace/listings</li><li>POST /api/marketplace/requests</li><li>POST /api/marketplace/match</li><li>POST /api/stake</li><li>POST /api/disputes</li><li>GET /metrics</li></ul><p>Authenticated endpoints require Bearer token.</p></body></html>`);
});

// ──────────────────────────────────────────────────────────────
// Clusters CRUD (with pagination)
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Mount route modules
// ──────────────────────────────────────────────────────────────
app.use('/api/readings', readingsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/protocol', protocolRouter);
app.use('/api/staking', stakingRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/settlement', settlementRoutes);

// ──────────────────────────────────────────────────────────────
// Lenco webhook (correct signature & payload)
// ──────────────────────────────────────────────────────────────
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY || '';

function verifyLencoSignature(payload: string, signature?: string): boolean {
  if (!LENCO_SECRET_KEY || !signature) return false;
  // SHA256 of the secret first, then HMAC-SHA512
  const webhookHashKey = crypto.createHash('sha256').update(LENCO_SECRET_KEY).digest('hex');
  const expected = crypto.createHmac('sha512', webhookHashKey).update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase()),
    Buffer.from(expected.toLowerCase())
  );
}

app.post('/api/webhooks/lenco', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-lenco-signature'] as string | undefined;
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body ?? '');

    if (!verifyLencoSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody || '{}');
    // Lenco nests data inside body.data
    const reference   = body.data?.reference   || body.reference;
    const status      = body.data?.status      || body.status;
    const providerRef = body.data?.lencoReference || body.id;

    if (!reference || !status || !providerRef) {
      return res.status(400).json({ error: 'Missing reference, status, or providerRef' });
    }

    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    // Idempotency check
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('provider_ref')
      .eq('provider', 'lenco')
      .eq('provider_ref', providerRef)
      .maybeSingle();

    if (existing) return res.status(200).json({ received: true });

    // Log the webhook event
    await supabase.from('webhook_events').insert({
      provider: 'lenco',
      provider_ref: providerRef,
      reference,
      status,
      payload: body,
    });

    // Update settlement payout status
    const payoutStatus = status === 'SUCCESSFUL' ? 'completed'
                      : status === 'FAILED'    ? 'failed'
                      : 'processing';

    await supabase
      .from('settlement_payouts')
      .update({
        status: payoutStatus,
        completed_at: status === 'SUCCESSFUL' ? new Date().toISOString() : null,
      })
      .eq('reference', reference);

    return res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, 'Lenco webhook error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// Other webhooks (MTN, Airtel) – stubs
// ──────────────────────────────────────────────────────────────
app.post('/api/webhooks/mtn', async (req, res) => {
  res.status(200).json({ message: 'received' });
});

app.post('/api/webhooks/airtel', async (req, res) => {
  res.status(200).json({ message: 'received' });
});

app.get('/api/webhooks/status', async (req, res) => {
  res.json({ status: 'ok', endpoints: { lenco: process.env.BASE_URL + '/api/webhooks/lenco' } });
});

// ──────────────────────────────────────────────────────────────
// SPA static serving & fallback
// ──────────────────────────────────────────────────────────────
const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <h1>⚡ Enerlectra API v3.1.0</h1>
        <p>Production Backend is Live and Healthy.</p>
      `);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info('═'.repeat(70));
  logger.info(`⚡ ENERLECTRA PRODUCTION BACKEND v3.1.0 – GLOBAL SCALE`);
  logger.info('═'.repeat(70));
  logger.info(`🌐 Server: http://localhost:${PORT}`);
  logger.info(`📅 Started: ${new Date().toISOString()}`);
  logger.info('📊 SERVICES: Supabase, Lenco, Prometheus, Cron, Staking, Ledger, Marketplace');
  logger.info('═'.repeat(70));
});
