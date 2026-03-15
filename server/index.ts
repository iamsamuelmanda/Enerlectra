/**
 * ENERLECTRA PRODUCTION BACKEND v2.2
 * Fixed: column casing, surplus_kwh insert, all new endpoints
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 4000;

// ═══════════════════════════════════════════════════════════
// INITIALIZE SERVICES
// ═══════════════════════════════════════════════════════════

let supabase: any = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
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
  const FALLBACK_RATE = 27.5;
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

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '2.2.0',
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
      mtn: !!process.env.MTN_API_KEY,
      airtel: !!process.env.AIRTEL_CLIENT_ID,
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY,
    },
  });
});

app.get('/api/system/ip', async (req, res) => {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get('https://api.ipify.org?format=json');
    res.json({
      publicIP: response.data.ip,
      timestamp: new Date().toISOString(),
      backend: 'enerlectra-backend.onrender.com',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get IP address', message: error.message });
  }
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
    res.status(500).json({ rate: 27.5, fallback: true, error: error.message });
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
    // Strip any fields that shouldn't be updated directly
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
// ENERGY READINGS
// ═══════════════════════════════════════════════════════════

app.post('/api/energy/readings', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not available' });

    const { cluster_id, unit_id, date, generation_kwh, consumption_kwh, recorded_by } = req.body;

    if (!cluster_id || !unit_id || !date || generation_kwh === undefined || consumption_kwh === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: cluster_id, unit_id, date, generation_kwh, consumption_kwh',
      });
    }

    // Note: surplus_kwh is NOT inserted — the DB computes it as a generated column
    const { data, error } = await supabase
      .from('energy_readings')
      .insert([{
        cluster_id,
        unit_id,
        date,
        generation_kwh,
        consumption_kwh,
        recorded_by: recorded_by || null,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    console.log(`✅ [ENERGY] Reading saved: ${unit_id} on ${date}`);
    res.status(201).json(data);
  } catch (error: any) {
    console.error('[ENERGY POST]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/energy/readings', async (req, res) => {
  try {
    if (!supabase) return res.json([]);

    const { cluster_id, from, to } = req.query;
    if (!cluster_id || !from || !to) {
      return res.status(400).json({ error: 'Missing required query params: cluster_id, from, to' });
    }

    const { data, error } = await supabase
      .from('energy_readings')
      .select('*')
      .eq('cluster_id', cluster_id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('[ENERGY GET]', error);
    res.status(500).json({ error: error.message });
  }
});

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
// PAYMENTS
// ═══════════════════════════════════════════════════════════

app.post('/api/payments/initiate', async (req, res) => {
  try {
    const { provider, phoneNumber, amountUSD, clusterId, userId, externalId } = req.body;

    if (!provider || !phoneNumber || !amountUSD) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['provider', 'phoneNumber', 'amountUSD'],
      });
    }

    const exchangeRateResult = await getExchangeRate('USD', 'ZMW');
    const exchangeRate = exchangeRateResult.rate;
    const amountZMW = amountUSD * exchangeRate;
    const transactionId = externalId || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (supabase) {
      try {
        await supabase.from('payment_intents').insert({
          transaction_id: transactionId,
          provider,
          phone_number: phoneNumber,
          amount_usd: amountUSD,
          amount_zmw: amountZMW,
          cluster_id: clusterId,
          user_id: userId,
          status: 'PENDING',
          metadata: { exchange_rate: exchangeRate, exchange_rate_live: exchangeRateResult.live },
          created_at: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error('[DB ERROR]', dbError);
      }
    }

    res.json({
      success: true,
      transactionId,
      status: 'PENDING',
      provider,
      amountUSD,
      amountZMW: amountZMW.toFixed(2),
      exchangeRate,
      exchangeRateLive: exchangeRateResult.live,
      message: `Payment initiated. Please approve on your ${provider.toUpperCase()} phone.`,
    });
  } catch (error: any) {
    console.error('[PAYMENT INITIATION ERROR]', error);
    res.status(500).json({ error: 'Payment initiation failed', message: error.message });
  }
});

app.get('/api/payments/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('payment_intents')
        .select('*')
        .eq('transaction_id', transactionId)
        .single();

      if (data && !error) {
        return res.json({
          success: true,
          status: data.status,
          transactionId,
          provider: data.provider,
          amountZMW: data.amount_zmw,
        });
      }
    }

    res.json({ success: true, status: 'PENDING', transactionId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get payment status', message: error.message });
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
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// LEGACY
// ═══════════════════════════════════════════════════════════

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message, path: req.path });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET  /',
      'GET  /api/health',
      'GET  /api/system/ip',
      'GET  /api/exchange-rate/:from/:to',
      'GET  /api/clusters',
      'GET  /api/clusters/:id',
      'POST /api/clusters',
      'PUT  /api/clusters/:id',
      'POST /api/payments/initiate',
      'GET  /api/payments/status/:transactionId',
      'POST /api/webhooks/mtn',
      'POST /api/webhooks/airtel',
      'GET  /api/webhooks/status',
      'POST /api/energy/readings',
      'GET  /api/energy/readings',
      'GET  /api/settlement/:clusterId/:date',
      'POST /api/settlement/run',
      'GET  /api/ownership/:clusterId',
    ],
  });
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═'.repeat(70));
  console.log(`⚡ ENERLECTRA PRODUCTION BACKEND v2.2.0`);
  console.log('═'.repeat(70));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('─'.repeat(70));
  console.log('📊 SERVICES STATUS:');
  console.log(`  Supabase:      ${supabase ? '✅ Connected' : '⚠️  Not configured (demo mode)'}`);
  console.log(`  MTN MoMo:      ${process.env.MTN_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Airtel Money:  ${process.env.AIRTEL_CLIENT_ID ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Exchange Rate: ${process.env.EXCHANGE_RATE_API_KEY ? '✅ Live' : '⚠️  Using fallback'}`);
  console.log('═'.repeat(70));
});