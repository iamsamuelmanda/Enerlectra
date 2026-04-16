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
export declare function distributeOutcome(ownership: OwnershipEntry[], totalKwh: number): DistributionResult[];
/**
 * Ensures the cluster ownership table is mathematically sound.
 */
export declare function validateOwnershipSum(ownership: OwnershipEntry[]): void;
