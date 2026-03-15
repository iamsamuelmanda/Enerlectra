import { apiGet, apiPost } from '../../../lib/api';
import type { EnergyReading } from '../../../types/api';

export const submitReading = (
  reading: Omit<EnergyReading, 'id' | 'surplus_kwh' | 'created_at'>
): Promise<EnergyReading> =>
  apiPost<EnergyReading>('/energy/readings', reading);

export const getReadings = (
  clusterId: string,
  from: string,
  to: string
): Promise<EnergyReading[]> =>
  apiGet<EnergyReading[]>(
    `/energy/readings?cluster_id=${clusterId}&from=${from}&to=${to}`
  );
