import { computeBaseOwnership, BaseContribution } from './baseOwnership'

const FOUNDING_DAYS = 30
const EARLY_DAYS = 14
const FOUNDING_MULT = 1.2
const EARLY_MULT = 1.1

export function computeOwnershipSnapshot(
  contributions: BaseContribution[],
  clusterId: string,
  campaignStart: Date
) {
  const base = computeBaseOwnership(contributions, clusterId)

  const enriched = base.map(o => {
    const userContribs = contributions.filter(
      c => c.clusterId === clusterId && c.userId === o.userId
    )

    const earliest = userContribs
      .map(c => new Date(c.timestamp))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    const daysSinceStart =
      (earliest.getTime() - campaignStart.getTime()) /
      (1000 * 60 * 60 * 24)

    let multiplier = 1
    if (daysSinceStart <= FOUNDING_DAYS) multiplier = FOUNDING_MULT
    else if (daysSinceStart <= EARLY_DAYS) multiplier = EARLY_MULT

    return {
      ...o,
      multiplier,
      effectiveUnits: o.units * multiplier
    }
  })

  const totalEffective = enriched.reduce(
    (s, e) => s + e.effectiveUnits,
    0
  )

  return {
    baseOwnership: base,
    effectiveOwnership: enriched.map(e => ({
      userId: e.userId,
      pct: Number(((e.effectiveUnits / totalEffective) * 100).toFixed(2)),
      multiplier: e.multiplier
    }))
  }
}
