export interface BaseContribution {
    contributionId: string
    clusterId: string
    userId: string
    units: number
    timestamp: string
  }
  
  /**
   * Pure proportional ownership calculation.
   * No bonuses. No money. No I/O.
   * AUDIT BASELINE.
   */
  export function computeBaseOwnership(
    contributions: BaseContribution[],
    clusterId: string
  ) {
    const clusterContributions = contributions.filter(
      c => c.clusterId === clusterId
    )
  
    if (clusterContributions.length === 0) return []
  
    const totalsByUser: Record<string, number> = {}
  
    for (const c of clusterContributions) {
      totalsByUser[c.userId] =
        (totalsByUser[c.userId] || 0) + c.units
    }
  
    const totalUnits = Object.values(totalsByUser)
      .reduce((sum, v) => sum + v, 0)
  
    if (totalUnits <= 0) {
      throw new Error('Total contribution units must be > 0')
    }
  
    return Object.entries(totalsByUser).map(([userId, units]) => ({
      userId,
      units,
      pct: Number(((units / totalUnits) * 100).toFixed(2))
    }))
  }
  


