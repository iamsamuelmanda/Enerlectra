export function simulateOutcome({
    installedKw,
    households,
    avgConsumptionPerHouse,
    days
  }: {
    installedKw: number
    households: number
    avgConsumptionPerHouse: number
    days: number
  }) {
    const peakKwhPerKW = 4.5
  
    const totalConsumption =
      households * avgConsumptionPerHouse * days
  
    const totalGeneration =
      installedKw * peakKwhPerKW * days
  
    const surplus = Math.max(
      0,
      totalGeneration - totalConsumption
    )
  
    const deficit = Math.max(
      0,
      totalConsumption - totalGeneration
    )
  
    let status: 'healthy' | 'stressed' | 'offline' = 'offline'
    if (totalGeneration >= totalConsumption * 0.95) status = 'healthy'
    else if (totalGeneration >= totalConsumption * 0.7) status = 'stressed'
  
    return {
      totalGenerationKwh: totalGeneration,
      totalConsumptionKwh: totalConsumption,
      surplusKwh: surplus,
      deficitKwh: deficit,
      status
    }
  }
  
