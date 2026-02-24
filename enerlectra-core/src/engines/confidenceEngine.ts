export function calculateConfidence({
    progressPct,
    contributorsCount,
    daysElapsed,
    totalDays
  }: {
    progressPct: number
    contributorsCount: number
    daysElapsed: number
    totalDays: number
  }) {
    if (totalDays <= 0) return 0
  
    const speedFactor = contributorsCount / Math.max(1, daysElapsed)
    const confidence =
      progressPct * 0.6 + speedFactor * 15
  
    return Math.min(95, Math.max(0, Math.round(confidence)))
  }
  