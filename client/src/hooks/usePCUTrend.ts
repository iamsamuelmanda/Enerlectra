import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, subMonths, isSameMonth } from 'date-fns';

interface TrendPoint {
  date: string;        // e.g. "Mar 2026"
  pcu: number;         // total funded PCUs in that month
  settled: number;     // total settled/completed PCUs in that month
  cumulative: number;  // running total
}

export function usePCUTrend(clusterId: string, monthsBack: number = 6) {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrend = async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const startDate = startOfMonth(subMonths(new Date(), monthsBack));

      const { data: contributions, error } = await supabase
        .from('contributions')
        .select('created_at, pcus, status')
        .eq('cluster_id', clusterId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Aggregate by month
      const monthlyMap = new Map<string, { pcu: number; settled: number }>();

      contributions.forEach(c => {
        const monthKey = format(new Date(c.created_at), 'MMM yyyy');
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { pcu: 0, settled: 0 });
        }
        const entry = monthlyMap.get(monthKey)!;
        entry.pcu += c.pcus || 0;
        if (c.status === 'COMPLETED' || c.status === 'settled') {
          entry.settled += c.pcus || 0;
        }
      });

      // Build ordered array + cumulative
      const trend: TrendPoint[] = [];
      let cumulative = 0;

      // Fill in missing months with zero
      for (let i = monthsBack; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const key = format(startOfMonth(d), 'MMM yyyy');
        const values = monthlyMap.get(key) || { pcu: 0, settled: 0 };
        cumulative += values.pcu;
        trend.push({
          date: key,
          pcu: values.pcu,
          settled: values.settled,
          cumulative,
        });
      }

      setData(trend);
    } catch (err: any) {
      console.error('Trend fetch failed:', err);
      setError('Failed to load funding trend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrend();

    // Realtime: new contribution → refresh trend
    const channel = supabase
      .channel(`pcu-trend:${clusterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contributions',
          filter: `cluster_id=eq.${clusterId}`,
        },
        () => {
          console.log('New contribution → refreshing trend');
          loadTrend();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId]);

  return { data, loading, error, refresh: loadTrend };
}