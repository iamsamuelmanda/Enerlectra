import { OwnershipEntry } from './distribution';

/**
 * Snapshot represents the "Locked" ownership state for a specific 
 * billing period (e.g., "2026-03").
 */
export interface OwnershipSnapshot {
  clusterId: string;
  period: string;
  entries: OwnershipEntry[];
  totalPcus: number;
}

/**
 * Calculates ownership percentages based on total Protocol Currency Units (PCUs) 
 * contributed to a cluster.
 */
export function calculateOwnershipFromContributions(
  contributions: Array<{ userId: string; pcus: number }>,
  clusterId: string,
  period: string
): OwnershipSnapshot {
  const totalPcus = contributions.reduce((sum, c) => sum + (c.pcus || 0), 0);

  if (totalPcus <= 0) {
    return { clusterId, period, entries: [], totalPcus: 0 };
  }

  // Calculate percentage share for each user
  const entries: OwnershipEntry[] = contributions.map(c => ({
    userId: c.userId,
    // We keep 4 decimal places for precision before the distribution engine floors it
    pct: Number(((c.pcus / totalPcus) * 100).toFixed(4))
  }));

  // Re-normalize to exactly 100.00 to pass the Distribution Engine's validation
  const normalizedEntries = normalizeOwnership(entries);

  return {
    clusterId,
    period,
    entries: normalizedEntries,
    totalPcus
  };
}

/**
 * Normalizes floating point percentages to ensure they sum to exactly 100%.
 * This prevents "0.99999" errors from breaking the Reconciliation Engine.
 */
function normalizeOwnership(entries: OwnershipEntry[]): OwnershipEntry[] {
  if (entries.length === 0) return [];
  
  const currentSum = entries.reduce((s, e) => s + e.pct, 0);
  const diff = 100 - currentSum;

  // Apply the tiny rounding difference to the largest shareholder
  const sorted = [...entries].sort((a, b) => b.pct - a.pct);
  sorted[0].pct = Number((sorted[0].pct + diff).toFixed(4));

  return sorted;
}

/**
 * Validates if a user is a "Participant" (owns > 0%) in a cluster.
 */
export function isParticipant(snapshot: OwnershipSnapshot, userId: string): boolean {
  return snapshot.entries.some(e => e.userId === userId && e.pct > 0);
}
