import { OwnershipEntry } from './distribution';
export interface DistributionSnapshot {
    clusterId: string;
    totalSurplusKwh: number;
    allocations: {
        userId: string;
        ownershipPct: number;
        allocatedKwh: number;
    }[];
    generatedAt: string;
}
/**
 * FINAL, AUDITABLE ENERGY DISTRIBUTION
 */
export declare function generateDistributionSnapshot(clusterId: string, ownership: OwnershipEntry[], totalSurplusKwh: number): DistributionSnapshot;
