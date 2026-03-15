import { useState, useEffect } from 'react';
import { getOwnership } from '../services/ownershipService';
import type { OwnershipEntry } from '../../../types/api';

export function useOwnership(clusterId: string) {
  const [ownership, setOwnership] = useState<OwnershipEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    setError(null);
    getOwnership(clusterId)
      .then(setOwnership)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId]);

  return { ownership, loading, error };
}
