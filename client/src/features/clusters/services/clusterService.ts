import { apiGet, apiPost, apiPut } from '../../../lib/api';
import type { Cluster, ClusterInput } from '../../../types/api';

export const clusterService = {
  getAll: (): Promise<Cluster[]> =>
    apiGet<Cluster[]>('/clusters'),

  getById: (id: string): Promise<Cluster> =>
    apiGet<Cluster>(`/clusters/${id}`),

  create: (cluster: ClusterInput): Promise<Cluster> =>
    apiPost<Cluster>('/clusters', cluster),

  update: (id: string, updates: Partial<ClusterInput>): Promise<Cluster> =>
    apiPut<Cluster>(`/clusters/${id}`, updates),
};