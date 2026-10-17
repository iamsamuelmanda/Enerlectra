import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase configuration missing for clusters routes');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Local file used only for the demo reset
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const contributionsPath = path.join(dataDir, 'contributions.json');

type ClusterRow = {
  id: string;
  name: string;
  location: string | null;
  target_kW: number | null;
  monthly_kwh: number | null;
  target_usd: number | null;
  settlement_state?: string | null;
  created_at: string;
};

// POST /clusters
router.post('/', async (req, res) => {
  try {
    const { name, location, target_kW, monthly_kwh, target_usd } = req.body;

    if (!name || !location || !target_kW) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { data, error } = await supabase
    .from('clusters')
      .insert({
        name,
        location,
        target_kW,
        monthly_kwh: monthly_kwh ?? null,
        target_usd: target_usd ?? null,
        settlement_state: 'DRAFT',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err: any) {
    console.error('POST /clusters failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// OPTIONAL: POST /clusters/pilot
router.post('/pilot', async (req, res) => {
  try {
    const { name, location, target_kW, monthly_kwh, target_usd } = req.body;

    if (!name || !location || !target_kW) {
      return res.status(400).json({ error: 'Invalid pilot payload' });
    }

    const { data, error } = await supabase
    .from('clusters')
      .insert({
        name,
        location,
        target_kW,
        monthly_kwh: monthly_kwh ?? null,
        target_usd: target_usd ?? null,
        settlement_state: 'PILOT',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err: any) {
    console.error('POST /clusters/pilot failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// GET /clusters
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
    .from('clusters')
      .select(
        'id, name, location, target_kW, monthly_kwh, target_usd, settlement_state, created_at',
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(
      (data || []).map((c) => ({
        clusterId: c.id,
        name: c.name,
        location: c.location,
        target_kW: c.target_kW,
        monthly_kwh: c.monthly_kwh,
        target_usd: c.target_usd,
        settlement_state: c.settlement_state ?? 'DRAFT',
        created_at: c.created_at,
      })),
    );
  } catch (err: any) {
    console.error('GET /clusters failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// GET /clusters/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
    .from('clusters')
      .select(
        'id, name, location, target_kW, monthly_kwh, target_usd, settlement_state, created_at',
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Cluster not found' });
      }
      throw error;
    }

    res.json({
      clusterId: data.id,
      name: data.name,
      location: data.location,
      target_kW: data.target_kW,
      monthly_kwh: data.monthly_kwh,
      target_usd: data.target_usd,
      settlement_state: data.settlement_state ?? 'DRAFT',
      created_at: data.created_at,
    });
  } catch (err: any) {
    console.error('GET /clusters/:id failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// PUT /clusters/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const {
      name,
      location,
      target_kW,
      monthly_kwh,
      target_usd,
      settlement_state,
    } = req.body;

    const { data, error } = await supabase
    .from('clusters')
      .update({
        ...(name !== undefined && { name }),
        ...(location !== undefined && { location }),
        ...(target_kW !== undefined && { target_kW }),
        ...(monthly_kwh !== undefined && { monthly_kwh }),
        ...(target_usd !== undefined && { target_usd }),
        ...(settlement_state !== undefined && { settlement_state }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Cluster not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (err: any) {
    console.error('PUT /clusters/:id failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// DELETE /clusters/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ deleted: true });
  } catch (err: any) {
    console.error('DELETE /clusters/:id failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// POST /clusters/:id/simulate
router.post('/:id/simulate', async (req, res) => {
  const { id } = req.params;
  const { days, peakKwhPerKW, avgConsumptionPerHouse, households } = req.body;

  try {
    const { data: cluster, error } = await supabase
    .from('clusters')
      .select(
        'id, name, location, target_kW, monthly_kwh, target_usd, settlement_state',
      )
      .eq('id', id)
      .single();

    if (error || !cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    if (!days || !peakKwhPerKW || !avgConsumptionPerHouse || !households) {
      return res.status(400).json({ error: 'Invalid simulation input' });
    }

    const systemKwhPerDay = (cluster.target_kW ?? 0) * peakKwhPerKW;
    const systemKwhTotal = systemKwhPerDay * days;
    const demandPerDay = avgConsumptionPerHouse * households;
    const demandTotal = demandPerDay * days;
    const surplus = systemKwhTotal - demandTotal;

    res.json({
      clusterId: cluster.id,
      periodDays: days,
      systemKwhPerDay,
      systemKwhTotal,
      demandPerDay,
      demandTotal,
      surplus,
    });
  } catch (err: any) {
    console.error('POST /clusters/:id/simulate failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

// NEW: POST /clusters/:id/reset-demo
router.post('/:id/reset-demo', (req, res) => {
  const { id } = req.params;

  if (!fs.existsSync(contributionsPath)) {
    return res.json({ ok: true, removed: 0 });
  }

  const raw = fs.readFileSync(contributionsPath, 'utf8');
  const all = raw.trim() ? JSON.parse(raw) : [];

  const remaining = all.filter(
    (c: any) => c.clusterId !== id || c.mode !== 'demo',
  );

  const removed = all.length - remaining.length;

  fs.writeFileSync(contributionsPath, JSON.stringify(remaining, null, 2));

  res.json({ ok: true, removed });
});

export default router;
