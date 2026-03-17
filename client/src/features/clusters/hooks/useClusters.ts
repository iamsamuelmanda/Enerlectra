import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Cluster } from '@/types/api'; // assuming this is where Cluster is defined

export function useClusters() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClusters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setClusters(data || []);
    } catch (err: any) {
      console.error('Error loading clusters:', err);
      setError(err.message || 'Failed to load communities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClusters();

    // Optional: realtime updates when clusters change
    const channel = supabase
      .channel('clusters-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clusters' }, () => {
        console.log('Clusters updated – reloading');
        loadClusters();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadClusters]);

  return {
    clusters,
    loading,
    error,
    refresh: loadClusters,
  };
}