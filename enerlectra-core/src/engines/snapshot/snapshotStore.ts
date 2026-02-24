// src/engines/snapshot/snapshotStore.ts
import fs from 'fs'
import { nanoid } from 'nanoid'
import { storeFile } from '../storePath'
import { atomicWriteJson } from '../atomicWrite'

export interface OwnershipTotals {
  totalBaseUnits: number
  totalEffectiveUnits: number
}

export interface OwnershipSnapshotRecord {
  snapshotId: string
  clusterId: string
  version: number
  generatedAt: string
  baseOwnership: unknown[]
  effectiveOwnership: unknown[]
  totals: OwnershipTotals
  finalized: boolean
  finalizedAt?: string
}

type SnapshotStoreShape = Record<string, OwnershipSnapshotRecord[]>

function getStorePath(): string {
  return storeFile('ownership-snapshots.json')
}

/**
 * Safely load all snapshots from disk.
 * Returns an empty object if the file is missing, empty, or invalid JSON.
 */
function loadAll(): SnapshotStoreShape {
  const filePath = getStorePath()

  if (!fs.existsSync(filePath)) {
    return {}
  }

  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    // I/O error – treat as no data rather than crashing the process
    return {}
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return {}
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      return parsed as SnapshotStoreShape
    }
    return {}
  } catch {
    // Corrupt JSON – ignore and start fresh
    return {}
  }
}

/**
 * Persist all snapshots to disk atomically.
 */
function saveAll(data: SnapshotStoreShape): void {
  const filePath = getStorePath()
  atomicWriteJson(filePath, data)
}

/**
 * Mark a snapshot as finalized and persist it.
 * Throws if snapshot is not found or already finalized.
 */
export function finalizeSnapshot(
  clusterId: string,
  snapshotId: string
): OwnershipSnapshotRecord {
  if (!clusterId) {
    throw new Error('clusterId is required to finalize a snapshot')
  }
  if (!snapshotId) {
    throw new Error('snapshotId is required to finalize a snapshot')
  }

  const all = loadAll()
  const list = all[clusterId] ?? []

  const idx = list.findIndex((s) => s.snapshotId === snapshotId)
  if (idx === -1) {
    throw new Error(`Snapshot ${snapshotId} not found for cluster ${clusterId}`)
  }

  if (list[idx].finalized) {
    throw new Error(`Snapshot ${snapshotId} already finalized`)
  }

  const now = new Date().toISOString()

  const updated: OwnershipSnapshotRecord = {
    ...list[idx],
    finalized: true,
    finalizedAt: now,
  }

  const newList = [...list]
  newList[idx] = updated
  all[clusterId] = newList
  saveAll(all)

  return updated
}

/**
 * Idempotent check used by API layer.
 * Returns false if cluster or snapshot does not exist.
 */
export function isSnapshotFinalized(
  clusterId: string,
  snapshotId: string
): boolean {
  if (!clusterId || !snapshotId) {
    return false
  }

  const all = loadAll()
  const list = all[clusterId] ?? []
  const found = list.find((s) => s.snapshotId === snapshotId)
  return Boolean(found?.finalized)
}

/**
 * Payload for creating a new snapshot.
 * Caller cannot control IDs, versioning, timestamps or finalized flags.
 */
export type NewSnapshotInput = Omit<
  OwnershipSnapshotRecord,
  'snapshotId' | 'clusterId' | 'version' | 'generatedAt' | 'finalized' | 'finalizedAt'
>

/**
 * Append a new snapshot for a cluster.
 * Fails if the latest snapshot is already finalized.
 */
export function appendSnapshot(
  clusterId: string,
  snapshot: NewSnapshotInput
): OwnershipSnapshotRecord {
  if (!clusterId) {
    throw new Error('clusterId is required to append a snapshot')
  }

  const all = loadAll()
  const existing = all[clusterId] ?? []

  const latest = existing[existing.length - 1]
  if (latest?.finalized) {
    throw new Error(
      `Latest snapshot ${latest.snapshotId} for cluster ${clusterId} is finalized and cannot be mutated`
    )
  }

  const now = new Date().toISOString()

  const record: OwnershipSnapshotRecord = {
    ...snapshot,
    snapshotId: `snap_${nanoid(8)}`,
    clusterId,
    version: existing.length + 1,
    generatedAt: now,
    finalized: false,
  }

  all[clusterId] = [...existing, record]
  saveAll(all)

  return record
}

/**
 * Get the latest snapshot for a cluster.
 * Throws if no snapshots exist.
 */
export function getLatestSnapshot(clusterId: string): OwnershipSnapshotRecord {
  if (!clusterId) {
    throw new Error('clusterId is required to get latest snapshot')
  }

  const all = loadAll()
  const list = all[clusterId]

  if (!list || list.length === 0) {
    throw new Error(`No snapshots found for cluster ${clusterId}`)
  }

  return list[list.length - 1]
}

/**
 * Get a specific snapshot by ID for a cluster.
 * Throws if not found.
 */
export function getSnapshotById(
  clusterId: string,
  snapshotId: string
): OwnershipSnapshotRecord {
  if (!clusterId) {
    throw new Error('clusterId is required to get snapshot by id')
  }
  if (!snapshotId) {
    throw new Error('snapshotId is required to get snapshot by id')
  }

  const all = loadAll()
  const list = all[clusterId] ?? []
  const found = list.find((s) => s.snapshotId === snapshotId)

  if (!found) {
    throw new Error(`Snapshot ${snapshotId} not found for cluster ${clusterId}`)
  }

  return found
}
