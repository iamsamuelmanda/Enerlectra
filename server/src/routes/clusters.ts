import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'

// engines and helpers live in enerlectra-core
import { atomicWriteJson } from '../../enerlectra-core/src/engines/atomicWrite.ts'
import { storeFile } from '../../enerlectra-core/src/engines/storePath.ts'

// services from enerlectra-core
import * as clusterService from '../../enerlectra-core/src/services/clusterService.ts'
import { simulateEnergy } from '../../enerlectra-core/src/services/simulateEnergy.ts'
import { supabase } from '../lib/supabase';


// destructure service functions once
const { createCluster, listClusters, deleteCluster, updateCluster } = clusterService as any

// Define the contributions file path once
const contributionsPath = storeFile('contributions.json')

const router = Router()

// POST /clusters
router.post('/', async (req, res) => {
  const { name, location, target_kW } = req.body

  if (!name || !location || !target_kW) {
    return res.status(400).json({ error: 'Invalid payload' })
  }

  const cluster = await createCluster(req.body)
  res.status(201).json(cluster)
})

// OPTIONAL: POST /clusters/pilot
router.post('/pilot', async (req, res) => {
  const { name, location, target_kW } = req.body

  if (!name || !location || !target_kW) {
    return res.status(400).json({ error: 'Invalid pilot payload' })
  }

  const payload = {
    name,
    location,
    target_kW,
    mode: 'pilot' as const
  }

  const cluster = await createCluster(payload)
  res.status(201).json(cluster)
})

// GET /clusters
router.get('/', async (_req, res) => {
  try {
    const clusters = await listClusters();

    // Load settlement_state for all clusters from Supabase
    const { data, error } = await supabase
      .from('clusters')
      .select('id, settlement_state');

    if (error) {
      console.error('Failed to load settlement_state from Supabase', error);
      // Fallback: return clusters without lifecycle
      return res.json(clusters);
    }

    const stateById = new Map<string, string>(
      (data || []).map((row: any) => [row.id, row.settlement_state]),
    );

    const enriched = clusters.map((c: any) => ({
      ...c,
      settlement_state: stateById.get(c.clusterId) || 'DRAFT',
    }));

    res.json(enriched);
  } catch (err: any) {
    console.error('GET /clusters failed', err);
    res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});


// GET /clusters/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params
  const clusters = await listClusters()
  const cluster = clusters.find(c => c.clusterId === id)
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' })
  }
  res.json(cluster)
})

// PUT /clusters/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const cluster = await updateCluster(id, req.body)
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' })
  }
  res.json(cluster)
})

// DELETE /clusters/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const deleted = await deleteCluster(id)
  if (!deleted) {
    return res.status(404).json({ error: 'Cluster not found' })
  }
  res.json({ deleted: true })
})

// POST /clusters/:id/simulate
router.post('/:id/simulate', async (req, res) => {
  const { id } = req.params
  const clusters = await listClusters()
  const cluster = clusters.find(c => c.clusterId === id)
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' })
  }

  const { days, peakKwhPerKW, avgConsumptionPerHouse, households } = req.body

  if (!days || !peakKwhPerKW || !avgConsumptionPerHouse || !households) {
    return res.status(400).json({ error: 'Invalid simulation input' })
  }

  const result = simulateEnergy({
    target_kW: cluster.target_kW,
    days,
    peakKwhPerKW,
    avgConsumptionPerHouse,
    households
  })

  res.json({
    clusterId: cluster.clusterId,
    periodDays: days,
    ...result
  })
})

// NEW: POST /clusters/:id/reset-demo
router.post('/:id/reset-demo', (req, res) => {
  const { id } = req.params

  if (!fs.existsSync(contributionsPath)) {
    return res.json({ ok: true, removed: 0 })
  }

  const raw = fs.readFileSync(contributionsPath, 'utf8')
  const all = raw.trim() ? JSON.parse(raw) : []

  const remaining = all.filter(
    (c: any) => c.clusterId !== id || c.mode !== 'demo'
  )

  const removed = all.length - remaining.length

  atomicWriteJson(contributionsPath, remaining)

  res.json({ ok: true, removed })
})

export default router
