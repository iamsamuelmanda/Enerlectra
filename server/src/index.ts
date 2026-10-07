// Enerlectra production backend — canonical runtime composition root.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import prometheus from 'prom-client';
import pino from 'pino';
import { posthog } from './services/posthog.js';
import { setupExpressRequestContext, setupExpressErrorHandler } from 'posthog-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createCustomerOperationalIssuesRouter } from './routes/customerOperationalIssues.js';
import { createActionsRouter } from './routes/actions.js';
import { createVerificationsRouter } from './routes/verifications.js';
import { createOperationsRouter } from './routes/operations.js';
import { createOrganizationContextRouter } from './routes/organizationContext.js';
import { createResourcesRouter } from './routes/resources.js';
import { createEllieRouter } from './routes/ellie.js';

const app = express();
const PORT = process.env.PORT || 4000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Canonical Supabase boundary. Enerlectra is one platform; database configuration
// is not versioned by environment variable name.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required; refusing to start without the canonical database boundary.',
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
logger.info('Canonical Supabase connected');

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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(cors());
app.use(express.json());

setupExpressRequestContext(posthog, app);

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  logger.info({ requestId, method: req.method, path: req.path }, 'Request received');
  next();
});

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

app.get('/api/info', (_req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (_req, res) => {
  const databaseCheck = await supabase
    .from('organizations')
    .select('id')
    .limit(1);

  const databaseHealthy = !databaseCheck.error;
  const statusCode = databaseHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: databaseHealthy ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      supabase: databaseHealthy,
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY,
      prometheus: true,
      posthog: true,
    },
    ...(databaseCheck.error
      ? { databaseError: 'Canonical database health check failed' }
      : {}),
  });
});

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

app.get('/api/docs', (_req, res) => {
  res.json({
    name: 'Enerlectra API',
    endpoints: [
      'GET /api/health',
      'POST /api/operational-issues',
      'POST /api/actions',
      'POST /api/actions/:id/authorize',
      'POST /api/actions/:id/transition',
      'POST /api/actions/:id/attempts',
      'POST /api/actions/:id/attempts/:attemptId/transition',
      'GET /api/operations/queue',
      'GET /api/organization/context',
      'PUT /api/organization/context',
      'GET /api/resources/customers',
      'POST /api/resources/customers',
      'GET /api/resources/sites',
      'POST /api/resources/sites',
      'GET /api/resources/assets',
      'POST /api/resources/assets',
      'POST /api/verifications',
      'POST /api/intelligence/ellie',
      'POST /api/intelligence/ellie/:recommendationId/feedback',
      'GET /metrics',
    ],
    note: 'All operational endpoints require authenticated tenant context.',
  });
});

app.use('/api/operational-issues', createCustomerOperationalIssuesRouter(supabase));
app.use('/api/actions', createActionsRouter(supabase));
app.use('/api/operations', createOperationsRouter(supabase));
app.use('/api/organization/context', createOrganizationContextRouter(supabase));
app.use('/api/resources', createResourcesRouter(supabase));
app.use('/api/verifications', createVerificationsRouter(supabase));
app.use('/api/intelligence', createEllieRouter(supabase));

app.post('/api/webhooks/whatsapp', (_req, res) => {
  res.status(503).json({ error: 'WhatsApp channel adapter not configured' });
});

app.post('/api/webhooks/mtn', async (_req, res) => {
  res.status(200).json({ message: 'received' });
});

app.post('/api/webhooks/airtel', async (_req, res) => {
  res.status(200).json({ message: 'received' });
});

app.get('/api/webhooks/status', (_req, res) => {
  res.json({ status: 'ok', enabled: ['whatsapp-canonical-adapter-pending'] });
});

const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <h1>⚡ Enerlectra API</h1>
        <p>Production Backend is Live and Healthy.</p>
      `);
    }
  });
});

setupExpressErrorHandler(posthog, app);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM intercept caught. Compiling final analytics payload flush...');
  await posthog.shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info('═'.repeat(70));
  logger.info('⚡ ENERLECTRA BACKEND – OPERATIONAL KERNEL');
  logger.info('═'.repeat(70));
  logger.info(`🌐 Server: http://localhost:${PORT}`);
  logger.info(`📅 Started: ${new Date().toISOString()}`);
  logger.info('📊 SERVICES: Canonical Supabase, Prometheus, PostHog');
  logger.info('═'.repeat(70));
});
