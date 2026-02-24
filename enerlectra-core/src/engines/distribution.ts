export interface OwnershipEntry {
  userId: string
  pct: number
}

export interface DistributionResult {
  userId: string
  ownershipPct: number
  allocatedKwh: number
}

/**
 * Deterministic, regulator-safe kWh distribution.
 */
export function distributeOutcome(
  ownership: OwnershipEntry[],
  totalKwh: number
): DistributionResult[] {
  if (totalKwh <= 0) {
    throw new Error('totalKwh must be greater than zero')
  }

  validateOwnershipSum(ownership)

  // Step 1: raw allocations
  const raw = ownership.map(o => ({
    userId: o.userId,
    ownershipPct: o.pct,
    rawKwh: (totalKwh * o.pct) / 100
  }))

  // Step 2: floor allocations
  const floored = raw.map(r => ({
    ...r,
    allocatedKwh: Math.floor(r.rawKwh)
  }))

  // Step 3: distribute remainder
  let remainder =
    totalKwh -
    floored.reduce((s, r) => s + r.allocatedKwh, 0)

  const sorted = [...floored].sort(
    (a, b) => (b.rawKwh % 1) - (a.rawKwh % 1)
  )

  for (let i = 0; i < remainder; i++) {
    sorted[i].allocatedKwh += 1
  }

  return sorted.map(r => ({
    userId: r.userId,
    ownershipPct: r.ownershipPct,
    allocatedKwh: r.allocatedKwh
  }))
}

/**
 * Ownership must sum to ~100%.
 */
export function validateOwnershipSum(
  ownership: OwnershipEntry[]
) {
  const sum = ownership.reduce((s, o) => s + o.pct, 0)

  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(
      `Ownership does not sum to 100%. Got ${sum}`
    )
  }
}
