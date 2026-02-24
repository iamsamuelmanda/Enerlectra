import { nanoid } from 'nanoid'
import { SettlementInstruction } from './settlementTypes'

interface DistributionAllocation {
  userId: string
  allocatedKwh: number
}

interface GenerateSettlementParams {
  distributionId: string
  clusterId: string
  allocations: DistributionAllocation[]
  rateZMWPerKwh: number
  supersedesSettlementId?: string
}

/**
 * Pure function: distribution → settlement instructions.
 * No IO, no persistence, no side effects.
 */
export function generateSettlementInstructions(
  params: GenerateSettlementParams
): SettlementInstruction[] {
  const {
    distributionId,
    clusterId,
    allocations,
    rateZMWPerKwh,
    supersedesSettlementId
  } = params

  if (rateZMWPerKwh <= 0) {
    throw new Error('rateZMWPerKwh must be > 0')
  }

  const now = new Date().toISOString()

  return allocations.map(a => {
    if (a.allocatedKwh <= 0) {
      throw new Error('allocatedKwh must be > 0')
    }

    const amountZMW = Number((a.allocatedKwh * rateZMWPerKwh).toFixed(2))

    return {
      settlementId: `set_${nanoid(8)}`,
      distributionId,
      clusterId,
      userId: a.userId,
      allocatedKwh: a.allocatedKwh,
      rateZMWPerKwh,
      amountZMW,
      currency: 'ZMW',
      status: 'pending',
      generatedAt: now,
      supersedesSettlementId
    }
  })
}
