// server/src/routes/contributions.ts
import { Router } from 'express';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const router = Router();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase configuration missing for contributions routes');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Legacy JSON storage (kept temporarily for demo reset compatibility)
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const CONTRIBUTIONS_FILE = path.join(dataDir, 'contributions.json');

function ensureContributionsFile() {
  const dir = path.dirname(CONTRIBUTIONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CONTRIBUTIONS_FILE)) {
    fs.writeFileSync(CONTRIBUTIONS_FILE, '[]', 'utf8');
  }
}

function loadContributions(): any[] {
  ensureContributionsFile();
  const raw = fs.readFileSync(CONTRIBUTIONS_FILE, 'utf8');
  if (!raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch {
    fs.writeFileSync(CONTRIBUTIONS_FILE, '[]', 'utf8');
    return [];
  }
}

function saveContributions(contributions: any[]) {
  ensureContributionsFile();
  fs.writeFileSync(
    CONTRIBUTIONS_FILE,
    JSON.stringify(contributions, null, 2),
    'utf8',
  );
}

type ContributionRow = {
  id: string;
  cluster_id: string;
  user_id: string;
  amount_usd: number;
  amount_zmw: number;
  pcus: number;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
};

// POST /clusters/:id/join - Protected route
router.post('/clusters/:id/join', async (req, res) => {
  try {
    console.log('DEBUG join route hit');

    const { id: clusterId } = req.params;

    // For now, get userId from body. Later wire up requireAuth middleware
    const { userId } = req.body;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized - userId required' });
    }

    // Simple state check (replace with your settlementStateSupabase later)
    const { data: cluster } = await supabase
      .from('clusters')
      .select('settlement_state')
      .eq('id', clusterId)
      .single();

    const state = cluster?.settlement_state ?? 'DRAFT';
    if (state !== 'DRAFT' && state !== 'PILOT') {
      return res.status(409).json({
        error: `Contributions not allowed while cluster is in ${state} state`,
      });
    }

    const { amountZMW } = req.body ?? {};

    if (!clusterId) {
      return res.status(400).json({ error: 'Missing clusterId in path' });
    }

    const numericAmount = Number(amountZMW);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid amountZMW' });
    }

    const EXCHANGE_RATE = 27.5;
    const pcus = Math.round(numericAmount / EXCHANGE_RATE);

    if (pcus <= 0 || pcus > 100) {
      return res.status(400).json({
        error: `Invalid PCUs ${pcus}; must be 0 < pcus <= 100`,
      });
    }

    console.log('DEBUG inserting into Supabase', {
      cluster_id: clusterId,
      user_id: userId,
      pcus,
    });

    // Insert contribution
    const { data: contribution, error: contribError } = await supabase
      .from('contributions')
      .insert({
        cluster_id: clusterId,
        user_id: userId,
        amount_usd: pcus,
        amount_zmw: numericAmount,
        pcus,
        status: 'COMPLETED',
        payment_method: 'MTN_MOBILE_MONEY',
        projected_ownership_pct: 0,
        grace_period_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (contribError) throw contribError;

    // Compute ownership snapshot
    const { data: dbContribs } = await supabase
      .from('contributions')
      .select('pcus')
      .eq('cluster_id', clusterId);

    const totalPcus = (dbContribs || []).reduce(
      (sum: number, c: any) => sum + c.pcus,
      0,
    );

    const ownershipPct = totalPcus > 0 ? (pcus / totalPcus) * 100 : 0;

    // Store snapshot
    await supabase
      .from('ownership_snapshots')
      .insert({
        cluster_id: clusterId,
        period: new Date().toISOString().slice(0, 7), // YYYY-MM
        user_id: userId,
        ownership_pct: ownershipPct,
        total_pcu: totalPcus,
      });

    const entry = {
      contributionId: contribution.id,
      clusterId,
      userId,
      amountZMW: numericAmount,
      timestamp: new Date().toISOString(),
    };

    res.json({
      ok: true,
      contributionId: entry.contributionId,
      ownershipSnapshot: {
        clusterId,
        userId,
        ownershipPct,
        totalPcu: totalPcus,
      },
    });
  } catch (err: any) {
    console.error('Error in /clusters/:id/join', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /clusters/:id/contributions
router.get('/clusters/:id/contributions', async (req, res) => {
  try {
    const { id: clusterId } = req.params;

    const { data, error } = await supabase
      .from('contributions')
      .select(`
        id,
        user_id,
        cluster_id,
        amount_usd,
        amount_zmw,
        pcus,
        created_at,
        profiles!inner(full_name)
      `)
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching contributions:', error);
      return res.status(500).json({ error: error.message });
    }

    const formatted = (data || []).map((row) => ({
      contributionId: row.id,
      clusterId: row.cluster_id,
      userId: row.user_id,
      name: row.profiles?.[0]?.full_name || 'Anonymous',
      pcus: row.pcus,
      amountUSD: row.amount_usd,
      amountZMW: row.amount_zmw,
      timestamp: row.created_at,
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('Error in GET /clusters/:id/contributions', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;