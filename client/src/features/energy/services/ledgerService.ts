import { apiGet } from '../../../lib/api';

export interface LedgerEntry {
  id: string;
  cluster_id: string;
  unit_id: string;
  date: string;
  event_type: string;
  quantity_kwh: number;
  credit_pcu: number;
  debit_pcu: number;
  status: string;
}

export const getLedger = (clusterId: string, date: string): Promise<LedgerEntry[]> =>
  apiGet<LedgerEntry[]>(`/ledger/${clusterId}?date=${date}`);