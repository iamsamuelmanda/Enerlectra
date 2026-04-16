/**
 * Cluster Repository
 *
 * Handles cluster state persistence.
 * Clusters ARE mutable (lifecycle state changes).
 */
import { Pool } from 'pg';
import { ClusterState } from '../../domain/marketplace/engines/AntiWhaleEngine';
import { LifecycleState } from '../../domain/lifecycle/types';
export interface ClusterRecord extends ClusterState {
    name: string;
    location: string;
    targetStorageKwh: number;
    monthlyKwh: number;
    participantCount: number;
    createdAt: Date;
    fundedAt: Date | null;
    operationalAt: Date | null;
    finalizedAt: Date | null;
    deadline: Date;
}
export interface CreateClusterParams {
    name: string;
    location: string;
    targetUSD: number;
    targetKw: number;
    targetStorageKwh: number;
    monthlyKwh: number;
    deadline: Date;
}
export declare class ClusterRepository {
    private pool;
    constructor(pool: Pool);
    /**
     * Create new cluster
     */
    create(params: CreateClusterParams): Promise<ClusterRecord>;
    /**
     * Update lifecycle state
     */
    updateLifecycleState(clusterId: string, newState: LifecycleState): Promise<ClusterRecord>;
    /**
     * Update funding progress (called after contribution)
     */
    updateFunding(clusterId: string, amountUSD: number, participantDelta?: number): Promise<ClusterRecord>;
    /**
     * Get cluster by ID
     */
    getById(clusterId: string): Promise<ClusterRecord | null>;
    /**
     * Get all active clusters (accepting contributions)
     */
    getActive(): Promise<ClusterRecord[]>;
    /**
     * Get clusters by location
     */
    getByLocation(location: string): Promise<ClusterRecord[]>;
    /**
     * Get clusters by state
     */
    getByState(state: LifecycleState): Promise<ClusterRecord[]>;
    /**
     * Get clusters nearing deadline (for alerts)
     */
    getNearingDeadline(hoursRemaining?: number): Promise<ClusterRecord[]>;
    /**
     * Get clusters that reached 100% (need supplier matching)
     */
    getFullyFunded(): Promise<ClusterRecord[]>;
    /**
     * Helper: Get timestamp field for lifecycle state
     */
    private getTimestampField;
    /**
     * Map database row to domain model
     */
    private mapRow;
}
