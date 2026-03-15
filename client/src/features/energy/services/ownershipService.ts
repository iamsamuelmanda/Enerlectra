import { apiGet } from '../../../lib/api';
import type { OwnershipEntry } from '../../../types/api';

export const getOwnership = (clusterId: string): Promise<OwnershipEntry[]> =>
  apiGet<OwnershipEntry[]>(`/ownership/${clusterId}`);
