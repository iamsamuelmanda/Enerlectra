import { Contribution } from '../types/contribution';

export interface OwnershipResult {
  userId: string;
  amount_usd: number;
  pcus: number;
  rawPercentage: number;
  weightedPercentage: number;
  bonusMultiplier: number;
}

/**
 * Calculate ownership percentages based on contributions
 * Applies early investor bonus based on days before deadline
 */
export function calculateOwnership(
  contributions: Contribution[],
  clusterDeadline?: string,
  referenceDate: Date = new Date()
): {
  results: OwnershipResult[];
  totalUSD: number;
  totalWeighted: number;
} {
  if (!contributions.length) {
    return { results: [], totalUSD: 0, totalWeighted: 0 };
  }

  // Calculate total USD
  const totalUSD = contributions.reduce((sum, c) => sum + c.amount_usd, 0);

  // Calculate weighted contributions with time bonus
  const weightedContributions = contributions.map((c) => {
    // Default bonus is 1.0 (no bonus)
    let bonusMultiplier = 1.0;

    // If we have a deadline, calculate bonus based on how early the contribution was
    if (clusterDeadline) {
      const contributionDate = new Date(c.created_at);
      const deadline = new Date(clusterDeadline);
      const daysBeforeDeadline = Math.max(
        0,
        Math.ceil((deadline.getTime() - contributionDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Bonus tiers:
      // - More than 30 days before deadline: 1.2x (20% bonus)
      // - 15-30 days before deadline: 1.1x (10% bonus)
      // - Less than 15 days before deadline: 1.0x (no bonus)
      if (daysBeforeDeadline > 30) {
        bonusMultiplier = 1.2;
      } else if (daysBeforeDeadline > 15) {
        bonusMultiplier = 1.1;
      }
    }

    return {
      ...c,
      weightedAmount: c.amount_usd * bonusMultiplier,
      bonusMultiplier,
    };
  });

  const totalWeighted = weightedContributions.reduce(
    (sum, c) => sum + c.weightedAmount,
    0
  );

  // Calculate percentages
  const results: OwnershipResult[] = weightedContributions.map((c) => ({
    userId: c.user_id,
    amount_usd: c.amount_usd,
    pcus: c.pcus,
    bonusMultiplier: c.bonusMultiplier,
    rawPercentage: (c.amount_usd / totalUSD) * 100,
    weightedPercentage: totalWeighted > 0 ? (c.weightedAmount / totalWeighted) * 100 : 0,
  }));

  return { results, totalUSD, totalWeighted };
}

/**
 * Calculate projected ownership for a new contribution
 * Useful for showing user what their ownership would be if they contribute now
 */
export function calculateProjectedOwnership(
  existingContributions: Contribution[],
  newAmountUSD: number,
  clusterDeadline?: string,
  referenceDate: Date = new Date()
): {
  currentPercentage: number;
  projectedPercentage: number;
  wouldBeTopContributor: boolean;
} {
  // Clone contributions and add a temporary one for the new amount
  // (without saving to database)
  const tempContributions = [
    ...existingContributions,
    {
      id: 'temp',
      user_id: 'temp',
      cluster_id: existingContributions[0]?.cluster_id || '',
      amount_usd: newAmountUSD,
      amount_zmw: newAmountUSD * 22.5, // approximate, will be replaced with real rate
      exchange_rate: 22.5,
      pcus: newAmountUSD, // PCUs = USD (by schema constraint)
      status: 'COMPLETED',
      payment_method: 'MOBILE_MONEY',
      projected_ownership_pct: 0,
      early_investor_bonus: 1.0,
      grace_period_expires_at: new Date().toISOString(),
      created_at: referenceDate.toISOString(),
    } as Contribution,
  ];

  const { results } = calculateOwnership(tempContributions, clusterDeadline, referenceDate);

  // Find the temp contribution's percentage
  const tempResult = results.find((r) => r.userId === 'temp');
  const projectedPercentage = tempResult?.weightedPercentage || 0;

  // Find if they would be top contributor
  const sortedResults = [...results].sort((a, b) => b.weightedPercentage - a.weightedPercentage);
  const wouldBeTopContributor = sortedResults[0]?.userId === 'temp';

  // For current percentage, we need to know which user is viewing
  // This is handled in the component that calls this function
  return {
    currentPercentage: 0, // Should be passed from component
    projectedPercentage,
    wouldBeTopContributor,
  };
}

/**
 * Calculate bonus multiplier based on contribution date
 */
export function getBonusMultiplier(
  contributionDate: Date,
  deadline: Date
): number {
  const daysBeforeDeadline = Math.max(
    0,
    Math.ceil((deadline.getTime() - contributionDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (daysBeforeDeadline > 30) return 1.2;
  if (daysBeforeDeadline > 15) return 1.1;
  return 1.0;
}

/**
 * Format ownership for display
 */
export function formatOwnership(percentage: number): string {
  return percentage.toFixed(2) + '%';
}