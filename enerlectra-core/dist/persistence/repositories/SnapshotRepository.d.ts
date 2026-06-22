/**
 * Snapshot Repository
 *
 * Handles snapshot persistence.
 * Enforces STRICT immutability - no updates or deletes allowed.
 */
import { Pool } from 'pg';
import { ClusterSnapshot } from '../../domain/marketplace/engines/SnapshotEngine';
import { LifecycleState } from '../../domain/lifecycle/types';
export declare class SnapshotRepository {
    private pool;
    constructor(pool: Pool);
    /**
     * Create snapshot (append-only)
     */
    create(snapshot: ClusterSnapshot): Promise<ClusterSnapshot>;
    /**
     * Get snapshot by ID
     */
    getById(snapshotId: string): Promise<ClusterSnapshot | null>;
    /**
     * Get latest snapshot for cluster
     */
    getLatestForCluster(clusterId: string): Promise<ClusterSnapshot | null>;
    /**
     * Get snapshot history for cluster
     */
    getHistoryForCluster(clusterId: string, limit?: number): Promise<ClusterSnapshot[]>;
    /**
     * Verify snapshot chain integrity
     */
    verifyChain(snapshotId: string): Promise<boolean>;
    /**
     * Get snapshots by lifecycle state transition
     */
    getByStateTransition(clusterId: string, toState: LifecycleState): Promise<ClusterSnapshot[]>;
    /**
     * Map database row to domain model
     */
    private mapRow;
}

