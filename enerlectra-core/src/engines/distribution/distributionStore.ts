import { atomicWriteJson } from '../atomicWrite'
import { storeFile } from '../storePath'
import fs from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'

export interface FinalDistributionRecord {
  distributionId: string
  clusterId: string
  snapshotId: string
  finalizedAt: string
  totalKwh: number
  allocations: {
    userId: string
    allocatedKwh: number
    ownershipPct: number
  }[]
}

const STORE_DIR = path.join(process.cwd(), 'store')
const FILE = storeFile('final-distributions.json')

function loadAll(): FinalDistributionRecord[] {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, 'utf8'))
}

function saveAll(data: FinalDistributionRecord[]) {
  fs.mkdirSync(STORE_DIR, { recursive: true })
  atomicWriteJson(FILE, data)
}

export function hasFinalized(snapshotId: string): boolean {
  return loadAll().some(d => d.snapshotId === snapshotId)
}

/**
 * Return an existing distribution for a snapshot, if any.
 */
export function findDistributionBySnapshotId(
  snapshotId: string
): FinalDistributionRecord | undefined {
  return loadAll().find(d => d.snapshotId === snapshotId)
}

/**
 * Append a new final distribution.
 * Caller is responsible for ensuring the snapshot is not already finalized.
 */
export function appendFinalDistribution(
  record: Omit<FinalDistributionRecord, 'distributionId' | 'finalizedAt'>
): FinalDistributionRecord {
  const all = loadAll()

  const entry: FinalDistributionRecord = {
    distributionId: `dist_${nanoid(8)}`,
    finalizedAt: new Date().toISOString(),
    ...record,
  }

  all.push(entry)
  saveAll(all)

  return entry
}
