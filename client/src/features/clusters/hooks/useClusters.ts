import { useState, useEffect } from 'react';
import { clusterService } from '../services/clusterService';
import { Cluster } from '../../../types/api';

export function useClusters() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clusterService.getAll();
      setClusters(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load clusters');
      console.error('Error loading clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  return { clusters, loading, error, refresh: loadClusters };
}