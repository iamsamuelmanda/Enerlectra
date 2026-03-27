// src/components/OwnershipBar.tsx
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface OwnershipEntry {
  participant_id: string;
  display_name: string;
  ownership_percent: number;
  pcus: number;
}

// Temporary type for the grouping stage before we have percentages
type GroupedEntry = Omit<OwnershipEntry, 'ownership_percent'>;

interface Props {
  clusterId: string;
  refreshTrigger?: number;
}

const COLORS = [
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-sky-500', 'bg-indigo-500', 'bg-violet-500',
  'bg-fuchsia-500', 'bg-rose-500', 'bg-amber-500',
];

export function OwnershipBar({ clusterId, refreshTrigger = 0 }: Props) {
  const { user } = useAuth();
  const [ownership, setOwnership] = useState<OwnershipEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wrapped in useCallback to prevent infinite effect loops
  const loadOwnership = useCallback(async () => {
    if (!clusterId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('contributions')
        .select('participant_id, display_name, pcus')
        .eq('cluster_id', clusterId)
        .eq('status', 'COMPLETED');

      if (error) throw error;

      const totalPCUs = data.reduce((sum, c) => sum + (c.pcus || 0), 0);

      // FIX: Use GroupedEntry here because we don't have percentages yet
      const grouped = data.reduce((acc, curr) => {
        const name = curr.display_name || curr.participant_id.slice(0, 8);
        if (!acc[name]) {
          acc[name] = { participant_id: curr.participant_id, display_name: name, pcus: 0 };
        }
        acc[name].pcus += curr.pcus || 0;
        return acc;
      }, {} as Record<string, GroupedEntry>);

      const formatted: OwnershipEntry[] = Object.values(grouped).map((entry) => ({
        ...entry,
        ownership_percent: totalPCUs > 0 ? (entry.pcus / totalPCUs) * 100 : 0,
      })).sort((a, b) => b.pcus - a.pcus);

      setOwnership(formatted);
    } catch (err: any) {
      console.error('Ownership load error:', err);
      setError('Failed to load ownership data');
      toast.error('Could not load ownership breakdown');
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    loadOwnership();

    const channel = supabase
      .channel(`ownership:${clusterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions', filter: `cluster_id=eq.${clusterId}` },
        () => { loadOwnership(); } // Wrapped in arrow to avoid returning a promise
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId, refreshTrigger, loadOwnership]);

  // ... rest of your component (UI logic) remains the same
  if (loading) return <div>Loading...</div>; // Simplification for brevity
  if (error) return <div className="text-red-400 text-sm p-4">{error}</div>;
  if (!ownership.length) return <p className="text-gray-400 text-sm">No ownership data yet.</p>;

  return (
    <div className="space-y-5">
       {/* Visual Bar Logic */}
       <div className="flex rounded-full overflow-hidden h-10 w-full gap-px bg-gray-800 border border-gray-700">
        {ownership.map((entry, i) => {
          const isUser = entry.participant_id === user?.id;
          const width = `${Math.max(entry.ownership_percent, 2)}%`;
          return (
            <div
              key={entry.participant_id}
              className={`${COLORS[i % COLORS.length]} transition-all duration-300 flex items-center justify-center text-xs font-medium text-white ${isUser ? 'ring-2 ring-white z-10' : ''}`}
              style={{ width }}
            >
              {entry.ownership_percent >= 5 && `${entry.ownership_percent.toFixed(0)}%`}
            </div>
          );
        })}
      </div>
      {/* Legend Logic */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-300">
        {ownership.map((entry, i) => (
          <div key={entry.participant_id} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${COLORS[i % COLORS.length]}`} />
            <span>{entry.display_name}: {entry.ownership_percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}