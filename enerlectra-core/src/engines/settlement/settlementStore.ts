import { atomicWriteJson } from '../atomicWrite'
import { storeFile } from '../storePath'
import fs from 'fs'
import path from 'path'
import { SettlementInstruction } from './settlementTypes'

const STORE_DIR = path.join(process.cwd(), 'store')
const FILE = storeFile('settlements.json')

function loadAll(): SettlementInstruction[] {
  if (!fs.existsSync(FILE)) return []
  const raw = fs.readFileSync(FILE, 'utf8')
  return raw.trim() ? JSON.parse(raw) : []
}

function saveAll(data: SettlementInstruction[]): void {
  fs.mkdirSync(STORE_DIR, { recursive: true })
  atomicWriteJson(FILE, data)
}

/**
 * Hard guarantees:
 * - ❌ no delete
 * - ❌ no in-place update
 * - ✅ only append
 * - ✅ corrections = new record (supersedesSettlementId)
 */
export function appendSettlements(
  settlements: SettlementInstruction[]
): SettlementInstruction[] {
  const all = loadAll() || []

  for (const rec of settlements) {
    // Idempotency + duplicate guard at the money boundary.[web:21]
    const exists = all.find(r =>
      r.settlementId === rec.settlementId ||
      (
        r.distributionId === rec.distributionId &&
        r.userId === rec.userId &&
        r.amountZMW === rec.amountZMW &&
        r.currency === rec.currency
      )
    )

    if (!exists) {
      all.push(rec)
    }
  }

  saveAll(all)
  return settlements
}

export function getAllSettlements(): SettlementInstruction[] {
  return loadAll()
}

export function getSettlementsByDistribution(
  distributionId: string
): SettlementInstruction[] {
  return loadAll().filter(s => s.distributionId === distributionId)
}

export function getSettlementsByUser(
  userId: string
): SettlementInstruction[] {
  return loadAll().filter(s => s.userId === userId)
}

export function getSettlementsByCluster(
  clusterId: string
): SettlementInstruction[] {
  return loadAll().filter(s => s.clusterId === clusterId)
}

/**
 * Simple net view: sum of amountZMW for a user.
 * This is a read model; it NEVER writes.[web:24]
 */
export function getNetForUser(
  userId: string
): { userId: string; netZMW: number } {
  const records = getSettlementsByUser(userId)
  const netZMW = records.reduce((sum, r) => sum + r.amountZMW, 0)
  return { userId, netZMW }
}
