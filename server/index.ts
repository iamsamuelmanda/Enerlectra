/**
 * ENERLECTRA PRODUCTION BACKEND v2.1
 * Fixed: Live exchange rate API integration
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
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
// EXCHANGE RATE HELPER (FIXED VERSION)
// ═══════════════════════════════════════════════════════════

async function getExchangeRate(from: string = 'USD', to: string = 'ZMW'): Promise<{ rate: number; live: boolean; error?: string }> {
  const FALLBACK_RATE = 27.5;
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

  if (!API_KEY) {
    console.log('⚠️ EXCHANGE_RATE_API_KEY not configured, using fallback');
    return { rate: FALLBACK_RATE, live: false, error: 'API key not configured' };
  }

  try {
    console.log(`[EXCHANGE RATE] Fetching ${from}/${to} from API...`);
    const axios = (await import('axios')).default;
    
    const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${from}`;
    console.log(`[EXCHANGE RATE] URL: ${url}`);
    
    const response = await axios.get(url, { timeout: 5000 });
    
    console.log(`[EXCHANGE RATE] API Response status: ${response.status}`);
    console.log(`[EXCHANGE RATE] API Result: ${response.data.result}`);

    if (response.data.result !== 'success') {
      console.error('[EXCHANGE RATE] API returned error:', response.data);
      return { rate: FALLBACK_RATE, live: false, error: response.data['error-type'] || 'API error' };
    }

    const rate = response.data.conversion_rates[to];
    
    if (!rate) {
      console.error(`[EXCHANGE RATE] Currency ${to} not found in response`);
      return { rate: FALLBACK_RATE, live: false, error: `Currency ${to} not found` };
    }

    console.log(`✅ [EXCHANGE RATE] Live rate fetched: ${rate}`);
    return { rate, live: true };

  } catch (error: any) {
    console.error('[EXCHANGE RATE ERROR]', error.message);
    return { 
      rate: FALLBACK_RATE, 
      live: false, 
      error: error.message || 'Unknown error' 
    };
  }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════
// HEALTH & STATUS ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Enerlectra Production Backend',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      systemIP: '/api/system/ip',
      webhooks: '/api/webhooks/status',
      exchangeRate: '/api/exchange-rate/USD/ZMW'
    }
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
      exchangeRate: !!process.env.EXCHANGE_RATE_API_KEY
    }
  });
});

app.get('/api/system/ip', async (req, res) => {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get('https://api.ipify.org?format=json');
    res.json({
      publicIP: response.data.ip,
      timestamp: new Date().toISOString(),
      backend: 'enerlectra-backend.onrender.com'
    });
  } catch (error: any) {
    console.error('Failed to fetch IP:', error.message);
    res.status(500).json({ 
      error: 'Failed to get IP address',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// EXCHANGE RATE ENDPOINT (FIXED)
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
      ...(result.error && { error: result.error })
    });
  } catch (error: any) {
    res.status(500).json({ 
      rate: 27.5, 
      fallback: true,
      error: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// PAYMENT ENDPOINTS (FIXED)
// ═══════════════════════════════════════════════════════════

app.post('/api/payments/initiate', async (req, res) => {
  try {
    const { provider, phoneNumber, amountUSD, clusterId, userId, externalId } = req.body;

    console.log('[PAYMENT INITIATE]', { provider, phoneNumber, amountUSD, clusterId, userId });

    if (!provider || !phoneNumber || !amountUSD) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['provider', 'phoneNumber', 'amountUSD']
      });
    }

    // Get LIVE exchange rate
    const exchangeRateResult = await getExchangeRate('USD', 'ZMW');
    const exchangeRate = exchangeRateResult.rate;
    const amountZMW = amountUSD * exchangeRate;

    console.log(`[PAYMENT] Exchange rate: ${exchangeRate} (${exchangeRateResult.live ? 'LIVE' : 'FALLBACK'})`);

    const transactionId = externalId || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log to database if available
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
          metadata: {
            exchange_rate: exchangeRate,
            exchange_rate_live: exchangeRateResult.live
          },
          created_at: new Date().toISOString()
        });
        console.log(`✅ [PAYMENT] Logged to database: ${transactionId}`);
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
      note: 'Demo mode - no real payment processed yet'
    });

  } catch (error: any) {
    console.error('[PAYMENT INITIATION ERROR]', error);
    res.status(500).json({ 
      error: 'Payment initiation failed',
      message: error.message 
    });
  }
});

app.get('/api/payments/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    console.log('[PAYMENT STATUS]', transactionId);

    if (supabase) {
      try {
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
            message: 'Payment status retrieved from database'
          });
        }
      } catch (dbError) {
        console.error('[DB ERROR]', dbError);
      }
    }

    res.json({
      success: true,
      status: 'PENDING',
      transactionId,
      message: 'Payment is pending confirmation'
    });

  } catch (error: any) {
    console.error('[PAYMENT STATUS ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to get payment status',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// WEBHOOK ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.post('/api/webhooks/mtn', async (req, res) => {
  try {
    console.log('[MTN WEBHOOK] Received:', JSON.stringify(req.body, null, 2));
    
    if (supabase) {
      try {
        await supabase.from('webhook_logs').insert({
          source: 'MTN',
          payload: req.body,
          status: 'RECEIVED',
          received_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('[WEBHOOK LOG ERROR]', dbError);
      }
    }

    const isSuccess = req.body.status === 'SUCCESSFUL' || req.body.status === 'SUCCEEDED';

    if (isSuccess) {
      console.log('[MTN WEBHOOK] Payment successful:', req.body.financialTransactionId);
      res.status(200).json({ message: 'Webhook processed successfully', status: 'success' });
    } else {
      console.log('[MTN WEBHOOK] Payment not successful:', req.body.status);
      res.status(200).json({ message: 'Webhook received', status: 'ignored' });
    }

  } catch (error: any) {
    console.error('[MTN WEBHOOK ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/webhooks/airtel', async (req, res) => {
  try {
    console.log('[AIRTEL WEBHOOK] Received:', JSON.stringify(req.body, null, 2));
    
    if (supabase) {
      try {
        await supabase.from('webhook_logs').insert({
          source: 'AIRTEL',
          payload: req.body,
          status: 'RECEIVED',
          received_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('[WEBHOOK LOG ERROR]', dbError);
      }
    }

    const isSuccess = req.body.transaction?.status === 'SUCCESS' || req.body.status?.success === true;

    if (isSuccess) {
      console.log('[AIRTEL WEBHOOK] Payment successful:', req.body.transaction?.id);
      res.status(200).json({ message: 'Webhook processed successfully', status: 'success' });
    } else {
      console.log('[AIRTEL WEBHOOK] Payment not successful');
      res.status(200).json({ message: 'Webhook received', status: 'ignored' });
    }

  } catch (error: any) {
    console.error('[AIRTEL WEBHOOK ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/webhooks/status', async (req, res) => {
  try {
    let recentWebhooks = [];

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
        airtel: process.env.AIRTEL_CALLBACK_URL || 'Not configured'
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// LEGACY ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'OK',
    features: ['Clusters', 'Payments', 'Webhooks', 'Exchange Rates'],
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Unknown error',
    path: req.path
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/system/ip',
      'GET /api/exchange-rate/:from/:to',
      'POST /api/payments/initiate',
      'GET /api/payments/status/:transactionId',
      'POST /api/webhooks/mtn',
      'POST /api/webhooks/airtel',
      'GET /api/webhooks/status'
    ]
  });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═'.repeat(70));
  console.log(`⚡ ENERLECTRA PRODUCTION BACKEND v2.1.0`);
  console.log('═'.repeat(70));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 IP: Run ${PORT}/api/system/ip to get server IP`);
  console.log('─'.repeat(70));
  console.log('📊 SERVICES STATUS:');
  console.log(`  Supabase:      ${supabase ? '✅ Connected' : '⚠️  Not configured (demo mode)'}`);
  console.log(`  MTN MoMo:      ${process.env.MTN_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Airtel Money:  ${process.env.AIRTEL_CLIENT_ID ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Exchange Rate: ${process.env.EXCHANGE_RATE_API_KEY ? '✅ Live' : '⚠️  Using fallback'}`);
  console.log('─'.repeat(70));
  console.log('🔗 KEY ENDPOINTS:');
  console.log(`  Health Check:        GET  http://localhost:${PORT}/api/health`);
  console.log(`  System IP:           GET  http://localhost:${PORT}/api/system/ip`);
  console.log(`  Exchange Rate:       GET  http://localhost:${PORT}/api/exchange-rate/USD/ZMW`);
  console.log(`  Initiate Payment:    POST http://localhost:${PORT}/api/payments/initiate`);
  console.log(`  Payment Status:      GET  http://localhost:${PORT}/api/payments/status/:id`);
  console.log(`  MTN Webhook:         POST http://localhost:${PORT}/api/webhooks/mtn`);
  console.log(`  Airtel Webhook:      POST http://localhost:${PORT}/api/webhooks/airtel`);
  console.log(`  Webhook Status:      GET  http://localhost:${PORT}/api/webhooks/status`);
  console.log('═'.repeat(70));
});