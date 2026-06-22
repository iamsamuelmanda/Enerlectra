export interface OwnershipTotals {
    totalBaseUnits: number;
    totalEffectiveUnits: number;
}
export interface OwnershipSnapshotRecord {
    snapshotId: string;
    clusterId: string;
    version: number;
    generatedAt: string;
    baseOwnership: unknown[];
    effectiveOwnership: unknown[];
    totals: OwnershipTotals;
    finalized: boolean;
    finalizedAt?: string;
}
/**
 * Mark a snapshot as finalized and persist it.
 * Throws if snapshot is not found or already finalized.
 */
export declare function finalizeSnapshot(clusterId: string, snapshotId: string): OwnershipSnapshotRecord;
/**
 * Idempotent check used by API layer.
 * Returns false if cluster or snapshot does not exist.
 */
export declare function isSnapshotFinalized(clusterId: string, snapshotId: string): boolean;
/**
 * Payload for creating a new snapshot.
 * Caller cannot control IDs, versioning, timestamps or finalized flags.
 */
export type NewSnapshotInput = Omit<OwnershipSnapshotRecord, 'snapshotId' | 'clusterId' | 'version' | 'generatedAt' | 'finalized' | 'finalizedAt'>;
/**
 * Append a new snapshot for a cluster.
 * Fails if the latest snapshot is already finalized.
 */
export declare function appendSnapshot(clusterId: string, snapshot: NewSnapshotInput): OwnershipSnapshotRecord;
/**
 * Get the latest snapshot for a cluster.
 * Throws if no snapshots exist.
 */
export declare function getLatestSnapshot(clusterId: string): OwnershipSnapshotRecord;
/**
 * Get a specific snapshot by ID for a cluster.
 * Throws if not found.
 */
export declare function getSnapshotById(clusterId: string, snapshotId: string): OwnershipSnapshotRecord;

