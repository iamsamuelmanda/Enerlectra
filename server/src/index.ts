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
import paymentRoutes from './routes/payments.js';
import readingsRouter from './routes/readings.js';
import simulationRouter from './routes/simulation.js';
import protocolRouter from './routes/protocol.js';
import stakingRoutes from './routes/staking.js';
import ledgerRoutes from './routes/ledger.js';
import marketplaceRoutes from './routes/marketplace.js';
import settlementRoutes from './routes/settlement.js';
import { createCustomerOperationalIssuesRouter } from './routes/customerOperationalIssues.js';
import { createActionsRouter } from './routes/actions.js';

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
// Decoupled Core Infrastructure & Intelligence Imports
// ──────────────────────────────────────────────────────────────

// 1. EventPublisher (Fixed: Import the Class, not a variable)
import * as eventPublisherModule from '../../enerlectra-core/src/core/eventing/event-publisher.js';
const EventPublisher = (
  (eventPublisherModule as any).EventPublisher ?? 
  (eventPublisherModule as any).default?.EventPublisher ?? 
  (eventPublisherModule as any).default
);

// 2. WhatsAppWebhookHandler (Safe ESM wrapper)
import * as waWebhookModule from '../../enerlectra-core/src/adapters/whatsapp/webhook-handler.js';
const WhatsAppWebhookHandler = (
  (waWebhookModule as any).WhatsAppWebhookHandler ?? 
  (waWebhookModule as any).default?.WhatsAppWebhookHandler ?? 
  (waWebhookModule as any).default
);

// 3. Kernel Composition Root
import { createKernel } from '../../enerlectra-core/src/bootstrap/create-kernel.js';
import { IncomingMessageEvent } from '../../enerlectra-core/src/core/contracts/incoming-message.js';

// 4. whatsAppClient (Safe ESM wrapper)
import * as waSenderModule from '../../enerlectra-core/src/adapters/whatsapp/sender.js';
const whatsAppClient = (
  (waSenderModule as any).whatsAppClient ?? 
  (waSenderModule as any).default?.whatsAppClient ?? 
  (waSenderModule as any).default
);


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

const kernel = createKernel();
// Initialized with the composed kernel's workflow engine
const whatsAppHandler = new WhatsAppWebhookHandler(supabase, kernel.workflowEngine);

/** Thin adapter: text + phone → EllieWorker reply (matches EventPublisher subscriber). */
async function processIncomingAgentQuery(
  body: string,
  senderPhone: string
): Promise<string> {
  if (!supabase) {
    throw new Error('Database ledger not available');
  }

  // Route through the Kernel's WorkflowEngine instead of direct EllieWorker
  const event: IncomingMessageEvent = {
    eventId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    conversationId: `whatsapp:${senderPhone}`,
    timestamp: new Date().toISOString(),
    channel: 'whatsapp',
    interaction: 'text',
    sender: {
      id: senderPhone,
      channel: 'whatsapp',
      phoneNumber: senderPhone,
      role: 'unknown',
    },
    text: body,
    metadata: {},
  };

  const execCtx = {
    supabase,
    logger,
    correlationId: event.correlationId,
    aiContext: {},
    actorId: senderPhone,
    organizationId: 'default-org',
    posthog,
  };

  await kernel.workflowEngine.processIncomingMessage(event, execCtx);
  return 'Your request has been processed by the Enerlectra Kernel.';
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

    posthog.capture({ event: 'cluster_created', properties: { clusterId: data.id, targetKw: target_kw } });
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

    posthog.capture({ event: 'cluster_updated', properties: { clusterId: req.params.id } });
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
if (supabase) {
  app.use('/api/operational-issues', createCustomerOperationalIssuesRouter(supabase));
}

// V2 Action boundary uses the clean V2 Supabase project. It is intentionally
// mounted separately from the legacy SUPABASE_* client during reconstruction.
let v2Supabase: any = null;
if (process.env.V2_SUPABASE_URL && process.env.V2_SUPABASE_SERVICE_ROLE_KEY) {
  v2Supabase = createClient(process.env.V2_SUPABASE_URL, process.env.V2_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  app.use('/api/v2/actions', createActionsRouter(v2Supabase));
}

// ──────────────────────────────────────────────────────────────
// Lenco webhook (correct signature & payload)
// ──────────────────────────────────────────────────────────────
const LENCO_SECRET_KEY = process.env.LENCO_SECRET_KEY || '';

function verifyLencoSignature(payload: string, signature?: string): boolean {
  if (!LENCO_SECRET_KEY || !signature) return false;
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
    const reference   = body.data?.reference   || body.reference;
    const status      = body.data?.status      || body.status;
    const providerRef = body.data?.lencoReference || body.id;

    if (!reference || !status || !providerRef) {
      return res.status(400).json({ error: 'Missing reference, status, or providerRef' });
    }

    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const { data: existing } = await supabase
      .from('webhook_events')
      .select('provider_ref')
      .eq('provider', 'lenco')
      .eq('provider_ref', providerRef)
      .maybeSingle();

    if (existing) return res.status(200).json({ received: true });

    await supabase.from('webhook_events').insert({
      provider: 'lenco',
      provider_ref: providerRef,
      reference,
      status,
      payload: body,
    });

    const payoutStatus = status === 'SUCCESSFUL' ? 'completed'
                       : status === 'FAILED'     ? 'failed'
                       : 'processing';

    // Enriched query syntax to pluck the associated user identity out of the transaction update context
    const { data: updatedPayout } = await supabase
      .from('settlement_payouts')
      .update({
        status: payoutStatus,
        completed_at: status === 'SUCCESSFUL' ? new Date().toISOString() : null,
      })
      .eq('reference', reference)
      .select('user_id')
      .maybeSingle();

    // Track banking settlements to PostHog
    const targetUser = updatedPayout?.user_id || 'system_anonymous';
    posthog.capture({
      distinctId: targetUser,
      event: 'settlement_payout_processed',
      properties: { reference, provider: 'lenco', status: payoutStatus }
    });

    return res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, 'Lenco webhook error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// WhatsApp inbound webhook (Authkey WABA)
// ──────────────────────────────────────────────────────────────
app.post('/api/webhooks/whatsapp', async (req, res) => {
  const requestId = req.headers['x-request-id'];

  try {
    logger.info(
      {
        requestId,
        eventType: req.body?.events?.eventType,
        messageId: req.body?.eventContent?.message?.id,
        from: req.body?.eventContent?.message?.from,
        contentType: req.body?.eventContent?.message?.contentType,
      },
      '[WhatsApp Webhook] Inbound Authkey message'
    );

    if (!supabase) {
      return res.status(503).json({
        error: 'Database ledger not available',
      });
    }

    const result = await whatsAppHandler.processInbound(req.body);

    if (!result.success) {
      logger.error(
        {
          requestId,
          messageId: result.messageId,
          error: result.error,
        },
        '[WhatsApp Webhook] Processing failed'
      );

      return res.status(400).json(result);
    }

    logger.info(
      {
        requestId,
        messageId: result.messageId,
        processed: result.processed,
      },
      '[WhatsApp Webhook] Successfully processed'
    );

    return res.status(200).json({
      received: true,
      processed: result.processed,
      messageId: result.messageId,
    });
  } catch (error: any) {
    logger.error(
      {
        requestId,
        err: error?.message || error,
      },
      '[WhatsApp Webhook] Fatal error'
    );

    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

// ──────────────────────────────────────────────────────────────
// Ellie Operator Agent Global Event Subscriber Execution Loop
// ──────────────────────────────────────────────────────────────
EventPublisher.subscribe('message.received', async (payload: any) => {
  // payload is now the IncomingMessageEvent object
  const senderPhone = payload.sender.phoneNumber;
  const body = payload.text || '';
  
  logger.info(`[Event Broker System] Inbound worker telemetry query triggered from: ${senderPhone}`);
  
  posthog.capture({
    distinctId: senderPhone,
    event: 'message_received',
    properties: { eventId: payload.eventId, channel: payload.channel }
  });

  try {
    // 1. Process query
    const agentBriefingResponse = await processIncomingAgentQuery(body, senderPhone);
    
    // 2. Dispatch reply
    const dispatchResult = await whatsAppClient.sendTemplate({
      mobile: senderPhone,
      templateId: process.env.AUTHKEY_ELLIE_TEMPLATE_ID || '40109',
      bodyValues: { '1': agentBriefingResponse }
    });

    if (!dispatchResult.success) {
      logger.error({ error: dispatchResult.error }, `[Outbound Channel Error] Failed for: ${senderPhone}`);
    } else {
      logger.info({ providerMessageId: dispatchResult.providerMessageId }, `[Outbound Dispatch] Ellie responded to ${senderPhone}`);
      posthog.capture({
        distinctId: senderPhone,
        event: 'whatsapp_response_dispatched',
        properties: { providerMessageId: dispatchResult.providerMessageId }
      });
    }
  } catch (pipelineException: any) {
    logger.error({ err: pipelineException?.message || pipelineException }, '[Fatal Intelligence Engine Trap]');
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
  logger.info(`⚡ ENERLECTRA PRODUCTION BACKEND v3.1.0 – GLOBAL SCALE`);
  logger.info('═'.repeat(70));
  logger.info(`🌐 Server: http://localhost:${PORT}`);
  logger.info(`📅 Started: ${new Date().toISOString()}`);
  logger.info('📊 SERVICES: Supabase, Lenco, Prometheus, Cron, Staking, Ledger, Marketplace, EllieAI, PostHog');
  logger.info('═'.repeat(70));
});
