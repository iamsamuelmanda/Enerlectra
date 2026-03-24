import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Cluster } from '@/types/api';

// HOOK 1: For a single cluster (Keep this as is)
export function useCluster(id: string) {
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCluster = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setCluster(data);
    } catch (err: any) {
      console.error('[HOOK ERROR]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCluster();
    const channel = supabase
      .channel(`live-grid-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clusters', filter: `id=eq.${id}` }, 
      (payload) => { setCluster(payload.new as Cluster); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadCluster]);

  return { cluster, loading, error, refresh: loadCluster };
}

// HOOK 2: For the full list (This was missing!)
export function useClusters() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClusters = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClusters(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClusters();
  }, [loadClusters]);

  return { clusters, loading, error, refresh: loadClusters };
}