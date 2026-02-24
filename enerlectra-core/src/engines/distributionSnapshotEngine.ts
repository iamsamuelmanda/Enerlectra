import { distributeOutcome } from './distribution'
import { OwnershipEntry } from './distribution'

export interface DistributionSnapshot {
  clusterId: string
  totalSurplusKwh: number
  allocations: {
    userId: string
    ownershipPct: number
    allocatedKwh: number
  }[]
  generatedAt: string
}

/**
 * FINAL, AUDITABLE ENERGY DISTRIBUTION
 */
export function generateDistributionSnapshot(
  clusterId: string,
  ownership: OwnershipEntry[],
  totalSurplusKwh: number
): DistributionSnapshot {
  const allocations = distributeOutcome(
    ownership,
    totalSurplusKwh
  )

  return {
    clusterId,
    totalSurplusKwh,
    allocations,
    generatedAt: new Date().toISOString()
  }
}
