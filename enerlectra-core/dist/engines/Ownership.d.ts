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
export declare function calculateOwnershipFromContributions(contributions: Array<{
    userId: string;
    pcus: number;
}>, clusterId: string, period: string): OwnershipSnapshot;
/**
 * Validates if a user is a "Participant" (owns > 0%) in a cluster.
 */
export declare function isParticipant(snapshot: OwnershipSnapshot, userId: string): boolean;
