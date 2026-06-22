import { ClusterSnapshot } from '../domain/marketplace/engines/SnapshotEngine';
import { LifecycleState } from '../domain/lifecycle/types';
/**
 * Create snapshot (append-only)
 */
export declare function createSnapshot(snapshot: ClusterSnapshot): Promise<ClusterSnapshot>;
/**
 * Get snapshot by ID (with participants)
 */
export declare function getSnapshotById(snapshotId: string): Promise<ClusterSnapshot | null>;
/**
 * Get latest snapshot for cluster
 */
export declare function getLatestSnapshotForCluster(clusterId: string): Promise<ClusterSnapshot | null>;
/**
 * Get snapshot history for cluster
 */
export declare function getSnapshotHistoryForCluster(clusterId: string, limit?: number): Promise<ClusterSnapshot[]>;
/**
 * Get snapshots by lifecycle state transition
 */
export declare function getSnapshotsByStateTransition(clusterId: string, toState: LifecycleState): Promise<ClusterSnapshot[]>;

