// server/routes/contributions.ts
import { Router } from 'express';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';

import {
  insertContribution,
  getContributionsForCluster,
} from '../services/contributionsSupabase.ts';
import { storeFile } from '../../enerlectra-core/src/engines/storePath';
import { recordContribution } from '../../enerlectra-core/src/engines/ownership/contributionEngine';
import { computeOwnershipSnapshot } from '../../enerlectra-core/src/engines/ownership/ownershipSnapshotEngine';
import { SettlementPolicy } from '../../enerlectra-core/src/domain/settlementPolicy';
import { getClusterState } from '../services/settlementStateSupabase';
import { requireAuth } from '../middleware/auth'; // Make sure this exists

const router = Router();

// Legacy JSON storage (kept temporarily; not used in the new flow)
const CONTRIBUTIONS_FILE = storeFile('contributions.json');

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

/**
 * POST /clusters/:id/join
 * Protected – uses authenticated user.id as user_id
 */
router.post('/clusters/:id/join', requireAuth, async (req, res) => {
  try {
    console.log('DEBUG join route hit');

    const { id: clusterId } = req.params;

    const user = req.supabaseUser;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - no user' });
    }

    const userId = user.id;

    const state = await getClusterState(clusterId);
    if (!SettlementPolicy.canContribute(state)) {
      return res.status(409).json({
        error: `Contributions are not allowed while cluster is in ${state} state`,
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

    const entry = {
      contributionId: `ctr_${nanoid(8)}`,
      clusterId,
      userId,
      amountZMW: numericAmount,
      timestamp: new Date().toISOString(),
    };

    await recordContribution({
      contributionId: entry.contributionId,
      clusterId: entry.clusterId,
      userId: entry.userId,
      amountZMW: entry.amountZMW,
      timestamp: entry.timestamp,
      mode: 'live',
    });

    const EXCHANGE_RATE = 27.5;
    const pcus = Math.round(numericAmount / EXCHANGE_RATE);

    if (pcus <= 0 || pcus > 100) {
      return res.status(400).json({
        error: `Invalid PCUs ${pcus}; contributions_pcus_check requires 0 < pcus <= 100`,
      });
    }

    console.log('DEBUG inserting into Supabase', {
      cluster_id: clusterId,
      user_id: userId,
      pcus,
    });

    await insertContribution({
      user_id: userId,
      cluster_id: clusterId,
      amount_usd: pcus,
      amount_zmw: numericAmount,
      exchange_rate: EXCHANGE_RATE,
      pcus: pcus,
      status: 'COMPLETED',
      payment_method: 'MTN_MOBILE_MONEY',
      projected_ownership_pct: 0,
      grace_period_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const dbContribs = await getContributionsForCluster(clusterId);

    const contributions = dbContribs.map((c) => ({
      contributionId: c.id,
      clusterId: c.cluster_id,
      userId: c.user_id,
      units: c.pcus,
      timestamp: c.created_at,
    }));

    const snapshot = computeOwnershipSnapshot(contributions, clusterId, {
      confidenceMultiplier: 1,
      campaignMultiplier: 1,
    });

    return res.json({
      ok: true,
      contributionId: entry.contributionId,
      ownershipSnapshot: snapshot,
    });
  } catch (err: any) {
    console.error('Error in /clusters/:id/join', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /clusters/:id/contributions
 * Returns contributions with full_name from profiles
 */
router.get('/clusters/:id/contributions', requireAuth, async (req, res) => {
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
        profiles!inner (full_name)
      `)
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching contributions:', error);
      return res.status(500).json({ error: error.message });
    }

    const formatted = data.map(row => ({
      contributionId: row.id,
      clusterId: row.cluster_id,
      userId: row.user_id,
      name: row.profiles?.full_name || 'Anonymous',
      pcus: row.pcus,
      amountUSD: row.amount_usd,
      amountZMW: row.amount_zmw,
      timestamp: row.created_at,
    }));
    
    const exchangeAPI = require('../utils/exchangeRate');

app.post('/contributions/clusters/:clusterId/join', async (req, res) => {
  try {
    const { cluster_id } = req.params;
    const { contributor_id, pcus } = req.body;
    
    // Convert pcus to ZMW using live rates
    const usdAmount = pcus / 100; // Assuming 100 pcus = $1 base
    const amountZMW = await exchangeAPI.convert(usdAmount);
    
    // Your existing Supabase logic...
    const { data, error } = await supabase.from('contributions').insert({
      cluster_id,
      contributor_id,
      pcus,
      amount_zmw: amountZMW
    });

    res.json({
      contributionId: data[0].id,
      clusterId: cluster_id,
      userId: contributor_id,
      amountZMW,
      mode: 'live',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    return res.json(formatted);
  } catch (err: any) {
    console.error('Error in GET /clusters/:id/contributions', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;