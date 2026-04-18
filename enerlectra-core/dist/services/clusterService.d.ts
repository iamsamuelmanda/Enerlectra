import { Cluster } from '../types/cluster';
export declare function createCluster(data: Omit<Cluster, 'clusterId' | 'status' | 'createdAt'>): Promise<Cluster>;
export declare function listClusters(): Promise<Cluster[]>;
export declare function deleteCluster(id: string): Promise<boolean>;
export declare function updateCluster(id: string, updates: Partial<Cluster>): Promise<Cluster | null>;
