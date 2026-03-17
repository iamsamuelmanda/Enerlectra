import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import type { SettlementResult } from '../../../types/api';

interface Props {
  clusterId: string;
  date: string;
}

const statusStyles: Record<SettlementResult['status'], string> = {
  pending:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  settled:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  disputed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export function SettlementTrace({ clusterId, date }: Props) {
  const [results, setResults] = useState<SettlementResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettlement = async () => {
    if (!clusterId || !date) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('settlement_results')
        .select('*')
        .eq('cluster_id', clusterId)
        .eq('settlement_date', date)
        .order('unit_id', { ascending: true });

      if (error) throw error;
      setResults(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load settlement data');
      toast.error('Could not load settlement results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettlement();

    // Realtime subscription
    const channel = supabase
      .channel(`settlement:${clusterId}:${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlement_results',
          filter: `cluster_id=eq.${clusterId} AND settlement_date=eq.${date}`,
        },
        (payload) => {
          console.log('Settlement changed:', payload);
          loadSettlement(); // reload full list on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId, date]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-800/50 rounded animate-pulse w-1/3"></div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-800/50 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/20 rounded-xl border border-red-800/30 text-center">
        <p className="text-red-300 mb-4">{error}</p>
        <button
          onClick={loadSettlement}
          className="px-5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm transition-colors flex items-center gap-2 mx-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="p-8 bg-gray-800/30 rounded-xl border border-gray-700 text-center text-gray-400">
        No settlement data for {new Date(date).toLocaleDateString()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">
          Settlement Results – {new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </h3>
        <button
          onClick={loadSettlement}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-900/40">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-800/80 text-gray-300 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 text-left font-medium">Unit</th>
              <th className="px-6 py-4 text-right font-medium">Generation</th>
              <th className="px-6 py-4 text-right font-medium">Consumption</th>
              <th className="px-6 py-4 text-right font-medium">Net</th>
              <th className="px-6 py-4 text-right font-medium">Credit PCU</th>
              <th className="px-6 py-4 text-right font-medium">Debit PCU</th>
              <th className="px-6 py-4 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {results.map((r) => (
              <tr key={r.unit_id} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-6 py-4 font-mono text-gray-200">{r.unit_id}</td>
                <td className="px-6 py-4 text-right text-gray-200">{r.generation_kwh?.toFixed(2) ?? '—'}</td>
                <td className="px-6 py-4 text-right text-gray-200">{r.consumption_kwh?.toFixed(2) ?? '—'}</td>
                <td className={`px-6 py-4 text-right font-medium ${r.net_kwh >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.net_kwh?.toFixed(2) ?? '—'}
                </td>
                <td className="px-6 py-4 text-right text-emerald-400">{r.credit_pcu?.toFixed(4) ?? '—'}</td>
                <td className="px-6 py-4 text-right text-red-400">{r.debit_pcu?.toFixed(4) ?? '—'}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${statusStyles[r.status]}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}