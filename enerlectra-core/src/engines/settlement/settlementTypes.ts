export type SettlementStatus = 'pending' | 'settled'

/**
 * Immutable settlement record.
 * Once written, NEVER mutated or deleted.
 */
export interface SettlementInstruction {
  settlementId: string
  distributionId: string
  clusterId: string
  userId: string

  allocatedKwh: number
  rateZMWPerKwh: number
  amountZMW: number
  currency: 'ZMW'

  status: SettlementStatus

  generatedAt: string
  supersedesSettlementId?: string
}
