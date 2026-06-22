import { LifecycleState } from '../domain/lifecycle/types';
export interface ClusterRecord {
    id: string;
    name: string;
    location: string;
    lifecycleState: LifecycleState;
    targetUSD: number;
    currentUSD: number;
    fundingPct: number;
    targetKw: number;
    targetStorageKwh: number;
    monthlyKwh: number;
    isLocked: boolean;
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
export declare function createCluster(params: CreateClusterParams): Promise<ClusterRecord>;
export declare function updateClusterLifecycleState(clusterId: string, newState: LifecycleState): Promise<ClusterRecord>;
export declare function updateClusterFunding(clusterId: string, amountUSD: number, participantDelta?: number): Promise<ClusterRecord>;
export declare function getClusterById(clusterId: string): Promise<ClusterRecord | null>;
export declare function getActiveClusters(): Promise<ClusterRecord[]>;
export declare function getClustersByLocation(location: string): Promise<ClusterRecord[]>;
export declare function getClustersByState(state: LifecycleState): Promise<ClusterRecord[]>;
export declare function getClustersNearingDeadline(hoursRemaining?: number): Promise<ClusterRecord[]>;
export declare function getFullyFundedClusters(): Promise<ClusterRecord[]>;

