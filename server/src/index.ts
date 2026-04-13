/**
 * ENERLECTRA PRODUCTION BACKEND v2.5.0
 * Updated: Protocol Oracle + Temporal Engine + Fixed Ingest
 * Date: April 13, 2026
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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
import protocolRouter from './routes/protocol.js'; // NEW: Protocol Oracle

const app = express();
const PORT = process.env.PORT || 4000;

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
    console.log('✅ Supabase connected');
  } catch (error) {
    console.log('⚠️ Supabase not configured, using demo mode');
  }
}

// ═══════════════════════════════════════════════════════════
// EXCHANGE RATE HELPER
// ═══════════════════════════════════════════════════════════

async function getExchangeRate(
  from: string = 'USD',
  to: string = 'ZMW'
): Promise<{ rate: number; live: boolean; error?: string }> {
  const FALLBACK_RATE = 28.45; // Updated March 2026
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

  if (!API_KEY) {
    console.log('⚠️ EXCHANGE_RATE_API_KEY not configured, using fallback');
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

    console.log(`✅ [EXCHANGE RATE] Live rate: ${rate}`);
    return { rate, live: true };
  } catch (error: any) {
    console.error('[EXCHANGE RATE ERROR]', error.message);
    return { rate: FALLBACK_RATE, live: false, error: error.message || 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════
// HEALTH & STATUS
// ═══════════════════════════════════════════════════════════

app.get('/api/info', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '2.5.0',
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
      mtn: !!process.env.MTN_API_KEY,
      airtel: !!process.env.AIRTEL_CLIENT_ID,
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY,
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
// PROTOCOL ORACLE (ENHANCED FOR FRONTEND DASHBOARD)
// ═══════════════════════════════════════════════════════════

app.get('/api/protocol/global-state', async (req, res) => {
  try {
    const rate = await getExchangeRate('USD', 'ZMW');
    
    let nodeCount = 0;
    let totalSolarKw = 0;
    let totalStorageKwh = 0;
    let totalFundingRaised = 0;
    
    if (supabase) {
      const { data: clusters, error } = await supabase
        .from('clusters')
        .select('solar_capacity_kw, storage_capacity_kwh, funding_raised_zmw');
      
      if (error) {
        console.error('[PROTOCOL ORACLE] Supabase error:', error);
      } else {
        nodeCount = clusters?.length || 0;
        totalSolarKw = clusters?.reduce((sum: number, c: any) => sum + (c.solar_capacity_kw || 0), 0) || 0;
        totalStorageKwh = clusters?.reduce((sum: number, c: any) => sum + (c.storage_capacity_kwh || 0), 0) || 0;
        totalFundingRaised = clusters?.reduce((sum: number, c: any) => sum + (c.funding_raised_zmw || 0), 0) || 0;
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
    console.error('[PROTOCOL ORACLE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CLUSTERS
// ═══════════════════════════════════════════════════════════

app.get('/api/clusters', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('[CLUSTERS GET]', error);
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
    console.error('[CLUSTERS GET BY ID]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clusters', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { name, location, target_kw, target_usd, deadline } = req.body;
    if (!name || !location || !target_kw) {
      return res.status(400).json({ error: 'Missing required fields: name, location, target_kw' });
    }
    const { data, error } = await supabase
      .from('clusters')
      .insert([{
        name,
        location,
        target_kw,
        target_usd: target_usd || null,
        deadline: deadline || null,
        lifecycle_state: 'open',
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[CLUSTERS POST]', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clusters/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { id, created_at, ...updates } = req.body;
    const { data, error } = await supabase
      .from('clusters')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cluster not found' });
    res.json(data);
  } catch (error: any) {
    console.error('[CLUSTERS PUT]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTERS (MOUNTED)
// ═══════════════════════════════════════════════════════════

app.use('/api/readings', readingsRouter);        // Fixed ingest with phone→UUID
app.use('/api/simulation', simulationRouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/protocol', protocolRouter);        // NEW: Market-state + temporal engine

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
      .order('unit_id', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('[SETTLEMENT GET]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settlement/run', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const { cluster_id, date } = req.body;
    if (!cluster_id || !date) {
      return res.status(400).json({ error: 'Missing required fields: cluster_id, date' });
    }

    const { data: readings, error: readingsError } = await supabase
      .from('energy_readings')
      .select('*')
      .eq('cluster_id', cluster_id)
      .eq('date', date);

    if (readingsError) throw readingsError;
    if (!readings || readings.length === 0) {
      return res.status(404).json({
        error: `No energy readings found for cluster ${cluster_id} on ${date}`,
      });
    }

    const totalGeneration = readings.reduce((sum: number, r: any) => sum + r.generation_kwh, 0);
    const PCU_RATE = totalGeneration > 0 ? 1 / totalGeneration : 0;

    const results = readings.map((r: any) => ({
      cluster_id,
      date,
      unit_id: r.unit_id,
      generation_kwh: r.generation_kwh,
      consumption_kwh: r.consumption_kwh,
      net_kwh: r.generation_kwh - r.consumption_kwh,
      credit_pcu: r.generation_kwh * PCU_RATE,
      debit_pcu: r.consumption_kwh * PCU_RATE,
      status: 'settled',
      settled_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('settlement_results')
      .upsert(results, { onConflict: 'cluster_id,date,unit_id' });

    if (upsertError) throw upsertError;

    const job_id = `SET-${cluster_id}-${date}-${Date.now()}`;
    console.log(`✅ [SETTLEMENT] ${results.length} units settled for ${cluster_id} on ${date}`);
    res.json({ job_id, units_settled: results.length, date, cluster_id });
  } catch (error: any) {
    console.error('[SETTLEMENT RUN]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// OWNERSHIP
// ═══════════════════════════════════════════════════════════

app.get('/api/ownership/:clusterId', async (req, res) => {
  try {
    if (!supabase) return res.json([]);

    const { clusterId } = req.params;
    const { data, error } = await supabase
      .from('contributions')
      .select('user_id, pcus, projected_ownership_pct, profiles:user_id(full_name)')
      .eq('cluster_id', clusterId)
      .eq('status', 'COMPLETED');

    if (error) throw error;
    if (!data || data.length === 0) return res.json([]);

    const totalPCUs = data.reduce((sum: number, c: any) => sum + (c.pcus || 0), 0);

    const ownership = data.map((c: any) => ({
      participant_id: c.user_id,
      display_name: c.profiles?.full_name || `Participant ${c.user_id.slice(0, 6)}`,
      ownership_percent: totalPCUs > 0 ? (c.pcus / totalPCUs) * 100 : 0,
      contribution_pcu: c.pcus || 0,
    }));

    res.json(ownership);
  } catch (error: any) {
    console.error('[OWNERSHIP GET]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════

app.post('/api/webhooks/mtn', async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('webhook_logs').insert({
        source: 'MTN', payload: req.body, status: 'RECEIVED',
        received_at: new Date().toISOString(),
      }).catch((e: any) => console.error('[WEBHOOK LOG ERROR]', e));
    }
    const isSuccess = req.body.status === 'SUCCESSFUL' || req.body.status === 'SUCCEEDED';
    res.status(200).json({ message: 'Webhook received', status: isSuccess ? 'success' : 'ignored' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/webhooks/airtel', async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('webhook_logs').insert({
        source: 'AIRTEL', payload: req.body, status: 'RECEIVED',
        received_at: new Date().toISOString(),
      }).catch((e: any) => console.error('[WEBHOOK LOG ERROR]', e));
    }
    const isSuccess =
      req.body.transaction?.status === 'SUCCESS' || req.body.status?.success === true;
    res.status(200).json({ message: 'Webhook received', status: isSuccess ? 'success' : 'ignored' });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/webhooks/status', async (req, res) => {
  try {
    let recentWebhooks: any[] = [];
    if (supabase) {
      const { data } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(10);
      recentWebhooks = data || [];
    }
    res.json({
      status: 'ok',
      recentWebhooks,
      totalWebhooks: recentWebhooks.length,
      endpoints: {
        mtn: process.env.MTN_CALLBACK_URL || 'Not configured',
        airtel: process.env.AIRTEL_CALLBACK_URL || 'Not configured',
        lenco: process.env.BASE_URL + '/api/webhooks/lenco' || 'Not configured',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// STATIC ASSET SERVING & SPA ROUTING
// ═══════════════════════════════════════════════════════════

const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING (Global)
// ═══════════════════════════════════════════════════════════

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[GLOBAL ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message, path: req.path });
});

// ═══════════════════════════════════════════════════════════
// CATCH-ALL / SPA FALLBACK
// ═══════════════════════════════════════════════════════════

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API Endpoint not found' });
  }
  
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
            <h1 style="color: #22c55e;">⚡ Enerlectra API v2.5.0</h1>
            <p>Production Backend is Live and Healthy.</p>
            <p style="color: #94a3b8; font-size: 0.8rem;">Note: Frontend is managed via Vercel.</p>
          </body>
        </html>
      `);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═'.repeat(70));
  console.log(`⚡ ENERLECTRA PRODUCTION BACKEND v2.5.0`);
  console.log(`   Protocol Oracle + Temporal Engine Active`);
  console.log('═'.repeat(70));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('─'.repeat(70));
  console.log('📊 SERVICES STATUS:');
  console.log(`  Supabase:      ${supabase ? '✅ Connected' : '⚠️  Not configured'}`);
  console.log(`  Lenco:         ${process.env.LENCO_SECRET_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Claude AI:     ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Exchange Rate: ${process.env.EXCHANGE_RATE_API_KEY ? '✅ Live' : '⚠️  Using fallback'}`);
  console.log(`  Protocol:      ✅ Oracle Active`);
  console.log('═'.repeat(70));
});