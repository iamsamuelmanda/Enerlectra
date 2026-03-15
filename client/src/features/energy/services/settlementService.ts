import { apiGet, apiPost } from '../../../lib/api';
import type { SettlementResult } from '../../../types/api';

export const getSettlement = (
  clusterId: string,
  date: string
): Promise<SettlementResult[]> =>
  apiGet<SettlementResult[]>(`/settlement/${clusterId}/${date}`);

export const triggerSettlement = (
  clusterId: string,
  date: string
): Promise<{ job_id: string }> =>
  apiPost<{ job_id: string }>('/settlement/run', { cluster_id: clusterId, date });
