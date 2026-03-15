import { useState, useEffect } from 'react';
import { getReadings } from '../services/energyService';
import type { EnergyReading } from '../../../types/api';

export function useEnergyReadings(clusterId: string, from: string, to: string) {
  const [readings, setReadings] = useState<EnergyReading[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId || !from || !to) return;
    setLoading(true);
    setError(null);
    getReadings(clusterId, from, to)
      .then(setReadings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId, from, to]);

  return { readings, loading, error };
}
