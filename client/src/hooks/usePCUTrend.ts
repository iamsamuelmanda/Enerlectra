import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, subMonths } from 'date-fns';

export interface TrendPoint {
  date: string;       // e.g. "Mar 2026"
  pcu: number;        // total funded PCUs in that month
  settled: number;    // total settled/completed PCUs in that month
  cumulative: number; // running total (Total Grid Capacity)
}

export function usePCUTrend(clusterId: string, monthsBack: number = 6) {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrend = useCallback(async () => {
    if (!clusterId) return;

    try {
      setLoading(true);
      setError(null);

      const startDate = startOfMonth(subMonths(new Date(), monthsBack));

      // Fetch contributions for this cluster
      const { data: contributions, error: supabaseError } = await supabase
        .from('contributions')
        .select('created_at, pcus, status')
        .eq('cluster_id', clusterId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (supabaseError) throw supabaseError;

      // 1. Map monthly buckets
      const monthlyMap = new Map<string, { pcu: number; settled: number }>();

      contributions?.forEach(c => {
        const monthKey = format(new Date(c.created_at), 'MMM yyyy');
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { pcu: 0, settled: 0 });
        }
        
        const entry = monthlyMap.get(monthKey)!;
        const pcuValue = Number(c.pcus) || 0;
        
        entry.pcu += pcuValue;
        
        // Normalize status check (case-insensitive)
        const status = c.status?.toUpperCase();
        if (status === 'COMPLETED' || status === 'SETTLED') {
          entry.settled += pcuValue;
        }
      });

      // 2. Generate ordered time series (Zero-filling missing months)
      const trend: TrendPoint[] = [];
      let runningCumulative = 0;

      for (let i = monthsBack; i >= 0; i--) {
        const dateRef = subMonths(new Date(), i);
        const key = format(dateRef, 'MMM yyyy');
        
        const values = monthlyMap.get(key) || { pcu: 0, settled: 0 };
        runningCumulative += values.pcu;

        trend.push({
          date: key,
          pcu: values.pcu,
          settled: values.settled,
          cumulative: runningCumulative,
        });
      }

      setData(trend);
    } catch (err: any) {
      console.error('[PCU TREND ERROR]:', err);
      setError(err.message || 'Failed to sync grid trend data');
    } finally {
      setLoading(false);
    }
  }, [clusterId, monthsBack]);

  useEffect(() => {
    loadTrend();

    // 3. Robust Realtime: Listen for ALL changes to contributions for this cluster
    const channel = supabase
      .channel(`pcu-trend-live-${clusterId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', // Listen for INSERT, UPDATE, and DELETE
          schema: 'public', 
          table: 'contributions', 
          filter: `cluster_id=eq.${clusterId}` 
        },
        () => {
          console.log('⚡ Grid data changed - Refreshing Trend');
          loadTrend();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId, loadTrend]);

  return { data, loading, error, refresh: loadTrend };
}