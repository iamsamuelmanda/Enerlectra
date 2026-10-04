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
import { posthog } from './services/posthog.js';
import { setupExpressRequestContext, setupExpressErrorHandler } from 'posthog-node';

// ──────────────────────────────────────────────────────────────
// ESM path configuration
// ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────
// Import route modules
// ──────────────────────────────────────────────────────────────
import { createCustomerOperationalIssuesRouter } from './routes/customerOperationalIssues.js';
import { createActionsRouter } from './routes/actions.js';

// ──────────────────────────────────────────────────────────────
// Express app setup
// ──────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 4000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ──────────────────────────────────────────────────────────────
// V2 Supabase client
// ──────────────────────────────────────────────────────────────
const v2SupabaseUrl = process.env.V2_SUPABASE_URL;
const v2ServiceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;

if (!v2SupabaseUrl || !v2ServiceRoleKey) {
  throw new Error(
    'V2_SUPABASE_URL and V2_SUPABASE_SERVICE_ROLE_KEY are required; refusing to start without the V2 database boundary.',
  );
}

const supabase = createClient(v2SupabaseUrl, v2ServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
logger.info('V2 Supabase connected');

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

// Intercept incoming connection details context before route mounting
setupExpressRequestContext(posthog, app);

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

  // Scopes all telemetry operations happening inside this request frame to the user's explicit UUID
  posthog.withContext({ distinctId: user.id }, () => {
    next();
  });
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
    version: '4.0.0-v2',
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
      posthog: true,
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
// OpenAPI docs stub
// ──────────────────────────────────────────────────────────────
app.get('/api/docs', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Enerlectra API v3.1.0</title></head><body style="font-family:system-ui;max-width:800px;margin:2rem auto;background:#0f172a;color:#e2e8f0;"><h1>⚡ Enerlectra API v3.1.0</h1><p>Full production endpoints available.</p><h2>Core Endpoints</h2><ul><li>GET /api/health</li><li>GET /api/protocol/global-state</li><li>GET /api/clusters</li><li>GET /api/settlement/by-user/:userId</li><li>GET /api/wallet/:userId</li><li>POST /api/payments/redeem</li><li>POST /api/marketplace/listings</li><li>POST /api/marketplace/requests</li><li>POST /api/marketplace/match</li><li>POST /api/stake</li><li>POST /api/disputes</li><li>GET /metrics</li></ul><p>Authenticated endpoints require Bearer token.</p></body></html>`);
});

// ──────────────────────────────────────────────────────────────
// Mount route modules
// ──────────────────────────────────────────────────────────────
app.use('/api/operational-issues', createCustomerOperationalIssuesRouter(supabase));

// V2 Action boundary uses the clean V2 Supabase project. It is intentionally
// mounted separately from the legacy SUPABASE_* client during reconstruction.
app.use('/api/v2/actions', createActionsRouter(supabase));

// V2 WhatsApp adapter is intentionally fail-closed until canonical
// channel identity → Actor → Membership → Organization resolution is wired.
app.post('/api/webhooks/whatsapp', (_req, res) => {
  res.status(503).json({ error: 'WhatsApp V2 channel adapter not configured' });
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

// Catch route handling failure states and throw them straight into PostHog's exception monitor
setupExpressErrorHandler(posthog, app);

// Gracefully flush the remaining tracking commands stacked in the node lifecycle memory stack on runtime death
process.on('SIGTERM', async () => {
  logger.info('SIGTERM intercept caught. Compiling final analytics payload flush...');
  await posthog.shutdown();
  process.exit(0);
});

// ──────────────────────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info('═'.repeat(70));
  logger.info(`⚡ ENERLECTRA V2 BACKEND – OPERATIONAL KERNEL`);
  logger.info('═'.repeat(70));
  logger.info(`🌐 Server: http://localhost:${PORT}`);
  logger.info(`📅 Started: ${new Date().toISOString()}`);
  logger.info('📊 SERVICES: V2 Supabase, Prometheus, PostHog');
  logger.info('═'.repeat(70));
});
