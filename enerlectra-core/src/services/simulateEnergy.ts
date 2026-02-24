export type SimulationInput = {
  target_kW: number
  days: number
  peakKwhPerKW: number
  avgConsumptionPerHouse: number
  households: number
}

export type SimulationResult = {
  totalGenerationKwh: number
  totalConsumptionKwh: number
  surplusKwh: number
  deficitKwh: number
  status: 'healthy' | 'stressed' | 'offline'
}

/**
 * Pure energy balance simulator.
 * No I/O, no side effects.
 */
export function simulateEnergy({
  target_kW,
  days,
  peakKwhPerKW,
  avgConsumptionPerHouse,
  households
}: SimulationInput): SimulationResult {
  const totalGenerationKwh = target_kW * peakKwhPerKW * days
  const totalConsumptionKwh = households * avgConsumptionPerHouse * days

  const surplusKwh = Math.max(0, totalGenerationKwh - totalConsumptionKwh)
  const deficitKwh = Math.max(0, totalConsumptionKwh - totalGenerationKwh)

  let status: SimulationResult['status'] = 'healthy'
  if (totalGenerationKwh === 0) status = 'offline'
  else if (deficitKwh > 0) status = 'stressed'

  return {
    totalGenerationKwh,
    totalConsumptionKwh,
    surplusKwh,
    deficitKwh,
    status
  }
}
