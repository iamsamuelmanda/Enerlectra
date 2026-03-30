export interface OwnershipEntry {
  userId: string;
  pct: number;
}

export interface DistributionResult {
  userId: string;
  ownershipPct: number;
  allocatedKwh: number;
}

/**
 * Deterministic, regulator-safe kWh distribution.
 * Uses the Largest Remainder Method to ensure 100% of generated energy
 * is accounted for, even with floating point precision issues.
 */
export function distributeOutcome(
  ownership: OwnershipEntry[],
  totalKwh: number
): DistributionResult[] {
  // Guard: If no energy was produced, return zero allocations immediately
  if (totalKwh <= 0) {
    return ownership.map(o => ({
      userId: o.userId,
      ownershipPct: o.pct,
      allocatedKwh: 0
    }));
  }

  validateOwnershipSum(ownership);

  // Step 1: Calculate raw decimal allocations
  const raw = ownership.map(o => ({
    userId: o.userId,
    ownershipPct: o.pct,
    rawKwh: (totalKwh * o.pct) / 100
  }));

  // Step 2: Floor allocations to get the baseline integer kWh
  const results = raw.map(r => ({
    ...r,
    allocatedKwh: Math.floor(r.rawKwh)
  }));

  // Step 3: Calculate the "Lost Electrons" (Remainder)
  let totalDistributed = results.reduce((s, r) => s + r.allocatedKwh, 0);
  let remainder = Math.round(totalKwh - totalDistributed);

  // Step 4: Distribute the remainder to those with the highest fractional parts
  // This ensures the most "fair" distribution of rounding errors.
  const sorted = [...results].sort(
    (a, b) => (b.rawKwh % 1) - (a.rawKwh % 1)
  );

  // Apply the remainder 1-by-1 to the top candidates
  for (let i = 0; i < remainder; i++) {
    if (sorted[i]) {
      sorted[i].allocatedKwh += 1;
    }
  }

  // Return formatted results
  return sorted.map(r => ({
    userId: r.userId,
    ownershipPct: r.ownershipPct,
    allocatedKwh: r.allocatedKwh
  }));
}

/**
 * Ensures the cluster ownership table is mathematically sound.
 */
export function validateOwnershipSum(ownership: OwnershipEntry[]) {
  const sum = ownership.reduce((s, o) => s + o.pct, 0);

  // Allowing for tiny floating point epsilon
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Ownership does not sum to 100%. Got ${sum}`);
  }
}