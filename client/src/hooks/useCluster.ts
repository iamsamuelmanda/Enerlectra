// src/features/clusters/hooks/useCluster.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Cluster } from '@/types/api';

export function useCluster(clusterId: string) {
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCluster = async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Cluster not found');

      setCluster(data);
    } catch (err: any) {
      console.error('Cluster fetch failed:', err);
      setError(err.message || 'Failed to load cluster details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCluster();

    // Realtime subscription for this cluster
    const channel = supabase
      .channel(`cluster:${clusterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clusters', filter: `id=eq.${clusterId}` },
        (payload) => {
          console.log('Cluster updated:', payload);
          setCluster(payload.new as Cluster);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId]);

  return { cluster, loading, error, refresh: loadCluster };
}