import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Cluster } from '@/types/api';

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

    // REAL-TIME GRID UPDATES: 
    // Listen for changes specifically to this cluster's generation/consumption
    const channel = supabase
      .channel(`live-grid-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clusters', filter: `id=eq.${id}` },
        (payload) => {
          setCluster(payload.new as Cluster);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadCluster]);

  return { cluster, loading, error, refresh: loadCluster };
}