import { computeBaseOwnership } from './baseOwnership'
import { appendAuditEvent } from '../audit/auditLog'
import { appendSnapshot } from '../snapshot/snapshotStore'

export interface OwnershipUnit {
  userId: string
  units: number
  pct: number
}

export interface OwnershipSnapshotResult {
  clusterId: string
  generatedAt: string
  totals: {
    baseUnits: number
    effectiveUnits: number
  }
  bonuses: {
    confidence?: number
    campaign?: number
  }
  baseOwnership: OwnershipUnit[]
  effectiveOwnership: OwnershipUnit[]
}

/**
 * Canonical ownership snapshot computation.
 * Computes → audits → persists.
 */
export function computeOwnershipSnapshot(
  contributions: any[],
  clusterId: string,
  options?: {
    confidenceMultiplier?: number
    campaignMultiplier?: number
  }
): OwnershipSnapshotResult {
  const base = computeBaseOwnership(contributions, clusterId)

  const confidence = options?.confidenceMultiplier ?? 1
  const campaign = options?.campaignMultiplier ?? 1

  const baseUnitsTotal = base.reduce((s, b) => s + b.units, 0)

  const baseOwnership: OwnershipUnit[] = base.map(b => ({
    userId: b.userId,
    units: b.units,
    pct: Number(((b.units / baseUnitsTotal) * 100).toFixed(2))
  }))

  const effectiveOwnership: OwnershipUnit[] = baseOwnership.map(b => ({
    userId: b.userId,
    units: b.units * confidence * campaign,
    pct: 0
  }))

  const effectiveUnitsTotal = effectiveOwnership.reduce(
    (s, e) => s + e.units,
    0
  )

  effectiveOwnership.forEach(e => {
    e.pct = Number(((e.units / effectiveUnitsTotal) * 100).toFixed(2))
  })

  const snapshot: OwnershipSnapshotResult = {
    clusterId,
    generatedAt: new Date().toISOString(),
    totals: {
      baseUnits: baseUnitsTotal,
      effectiveUnits: effectiveUnitsTotal
    },
    bonuses: {
      confidence: confidence !== 1 ? confidence : undefined,
      campaign: campaign !== 1 ? campaign : undefined
    },
    baseOwnership,
    effectiveOwnership
  }

  // 🔒 AUDIT
  appendAuditEvent({
    eventType: 'OWNERSHIP_SNAPSHOT_COMPUTED',
    clusterId,
    payload: {
      contributors: baseOwnership.length,
      baseUnitsTotal,
      effectiveUnitsTotal,
      confidenceMultiplier: confidence,
      campaignMultiplier: campaign
    }
  })

  // 💾 PERSIST (CRITICAL)
  appendSnapshot(clusterId, {
    totals: {
      totalBaseUnits: snapshot.totals.baseUnits,
      totalEffectiveUnits: snapshot.totals.effectiveUnits
    },
    baseOwnership: snapshot.baseOwnership,
    effectiveOwnership: snapshot.effectiveOwnership
  })

  return snapshot
}
