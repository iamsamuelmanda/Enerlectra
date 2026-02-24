export function evaluateCampaign({
    totalUnits,
    targetUnits,
    deadline,
    targetSolarKw
  }: {
    totalUnits: number
    targetUnits: number
    deadline: Date
    targetSolarKw: number
  }) {
    const now = new Date()
    const daysRemaining = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
  
    const progressPct = Math.min(
      100,
      (totalUnits / targetUnits) * 100
    )
  
    const isEnded = daysRemaining <= 0
  
    const failureLossKwh =
      isEnded && progressPct < 100
        ? targetSolarKw * 4.5 * 30
        : undefined
  
    return {
      progressPct,
      daysRemaining,
      isEnded,
      unlocked: {
        feasibility: progressPct >= 40,
        procurement: progressPct >= 70,
        expansion: progressPct >= 100
      },
      failureLossKwh
    }
  }
  