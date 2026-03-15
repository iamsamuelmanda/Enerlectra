import { useState, useEffect } from 'react';
import { getSettlement } from '../services/settlementService';
import type { SettlementResult } from '../../../types/api';

export function useSettlement(clusterId: string, date: string) {
  const [results, setResults] = useState<SettlementResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId || !date) return;
    setLoading(true);
    setError(null);
    getSettlement(clusterId, date)
      .then(setResults)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId, date]);

  return { results, loading, error };
}
