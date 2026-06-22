export interface FinalDistributionRecord {
    distributionId: string;
    clusterId: string;
    snapshotId: string;
    finalizedAt: string;
    totalKwh: number;
    allocations: {
        userId: string;
        allocatedKwh: number;
        ownershipPct: number;
    }[];
}
export declare function hasFinalized(snapshotId: string): boolean;
/**
 * Return an existing distribution for a snapshot, if any.
 */
export declare function findDistributionBySnapshotId(snapshotId: string): FinalDistributionRecord | undefined;
/**
 * Append a new final distribution.
 * Caller is responsible for ensuring the snapshot is not already finalized.
 */
export declare function appendFinalDistribution(record: Omit<FinalDistributionRecord, 'distributionId' | 'finalizedAt'>): FinalDistributionRecord;

