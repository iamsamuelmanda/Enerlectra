import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { runMatchingForCluster } from '../services/matchingEngine.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

router.post('/listings', authenticate, async (req: any, res) => {
  try {
    const { cluster_id, amount_kwh, price_per_kwh } = req.body;
    const seller_id = req.user.id;

    const amount = parseNumber(amount_kwh);
    const price = parseNumber(price_per_kwh);

    if (!cluster_id || !Number.isFinite(amount) || !Number.isFinite(price)) {
      return res.status(400).json({ error: 'cluster_id, amount_kwh, price_per_kwh required' });
    }

    if (amount <= 0 || price <= 0) {
      return res.status(400).json({ error: 'amount_kwh and price_per_kwh must be > 0' });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', seller_id)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (Number(wallet.balance_pcu) < amount) {
      return res.status(400).json({ error: 'Insufficient PCU balance' });
    }

    const { data: listing, error } = await supabase
      .from('energy_listings')
      .insert({
        seller_id,
        cluster_id,
        amount_kwh: amount,
        price_per_kwh: price,
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(listing);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create listing' });
  }
});

router.post('/requests', authenticate, async (req: any, res) => {
  try {
    const { cluster_id, amount_kwh, max_price_per_kwh } = req.body;
    const buyer_id = req.user.id;

    const amount = parseNumber(amount_kwh);
    const maxPrice = parseNumber(max_price_per_kwh);

    if (!cluster_id || !Number.isFinite(amount) || !Number.isFinite(maxPrice)) {
      return res.status(400).json({ error: 'cluster_id, amount_kwh, max_price_per_kwh required' });
    }

    if (amount <= 0 || maxPrice <= 0) {
      return res.status(400).json({ error: 'amount_kwh and max_price_per_kwh must be > 0' });
    }

    const { data: request, error } = await supabase
      .from('energy_requests')
      .insert({
        buyer_id,
        cluster_id,
        amount_kwh: amount,
        max_price_per_kwh: maxPrice,
        status: 'OPEN',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(request);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create request' });
  }
});

router.get('/listings', async (req, res) => {
  try {
    const cluster_id = String(req.query.cluster_id || '');
    if (!cluster_id) return res.status(400).json({ error: 'cluster_id required' });

    const { data, error } = await supabase
      .from('energy_listings')
      .select('*')
      .eq('cluster_id', cluster_id)
      .eq('status', 'ACTIVE')
      .order('price_per_kwh', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.json((data ?? []).filter((row: any) => !isExpired(row.expires_at)));
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load listings' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const cluster_id = String(req.query.cluster_id || '');
    if (!cluster_id) return res.status(400).json({ error: 'cluster_id required' });

    const { data, error } = await supabase
      .from('energy_requests')
      .select('*')
      .eq('cluster_id', cluster_id)
      .in('status', ['OPEN', 'PARTIALLY_FILLED'])
      .order('max_price_per_kwh', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.json((data ?? []).filter((row: any) => !isExpired(row.expires_at)));
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load requests' });
  }
});

router.post('/match', authenticate, async (req: any, res) => {
  try {
    const { cluster_id } = req.body;
    if (!cluster_id) return res.status(400).json({ error: 'cluster_id required' });

    const executed = await runMatchingForCluster(cluster_id);
    return res.json({ success: true, matches_executed: executed });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to run matching' });
  }
});

router.get('/trades', async (req, res) => {
  try {
    const cluster_id = req.query.cluster_id ? String(req.query.cluster_id) : null;
    const limit = Math.min(Math.max(parseNumber(req.query.limit), 1) || 50, 200);

    let query = supabase
      .from('energy_trades')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (cluster_id) {
      query = query.eq('cluster_id', cluster_id);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load trades' });
  }
});

export default router;
