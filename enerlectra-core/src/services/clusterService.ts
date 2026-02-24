import { storeFile } from '../engines/storePath.ts'
import { generateId } from '../utils/id.ts'
import { Cluster } from '../types/cluster.ts'
import * as fs from 'fs/promises'
import * as path from 'path'

// Path where clusters will be stored
const clustersFile = storeFile('clusters.json')

let clusters: Cluster[] = []

async function loadClusters() {
  try {
    await fs.access(clustersFile)
    const data = await fs.readFile(clustersFile, 'utf-8')
    clusters = JSON.parse(data)
  } catch {
    clusters = []
  }
}

async function saveClusters() {
  await fs.mkdir(path.dirname(clustersFile), { recursive: true })
  await fs.writeFile(clustersFile, JSON.stringify(clusters, null, 2))
}

// Initialize on first use
let initialized = false
async function ensureInitialized() {
  if (!initialized) {
    await loadClusters()
    initialized = true
  }
}

export async function createCluster(
  data: Omit<Cluster, 'clusterId' | 'status' | 'createdAt'>
): Promise<Cluster> {
  await ensureInitialized()
  const cluster: Cluster = {
    clusterId: generateId('clu'),
    ...data,
    status: 'open',
    createdAt: new Date().toISOString()
  }
  clusters.push(cluster)
  await saveClusters()
  return cluster
}

export async function listClusters(): Promise<Cluster[]> {
  await ensureInitialized()
  return clusters
}

export async function deleteCluster(id: string): Promise<boolean> {
  await ensureInitialized()
  const index = clusters.findIndex(c => c.clusterId === id)
  if (index === -1) return false
  clusters.splice(index, 1)
  await saveClusters()
  return true
}

export async function updateCluster(
  id: string,
  updates: Partial<Cluster>
): Promise<Cluster | null> {
  await ensureInitialized()
  const cluster = clusters.find(c => c.clusterId === id)
  if (!cluster) return null

  Object.assign(cluster, updates, { updatedAt: new Date().toISOString() })
  await saveClusters()
  return cluster
}
