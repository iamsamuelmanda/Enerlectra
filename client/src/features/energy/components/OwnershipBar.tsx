// src/components/OwnershipBar.tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface OwnershipEntry {
  participant_id: string;
  display_name: string;
  ownership_percent: number;
  pcus: number;
}

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

  const loadOwnership = async () => {
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

      const grouped = data.reduce((acc, curr) => {
        const name = curr.display_name || curr.participant_id.slice(0, 8);
        if (!acc[name]) acc[name] = { participant_id: curr.participant_id, display_name: name, pcus: 0 };
        acc[name].pcus += curr.pcus || 0;
        return acc;
      }, {} as Record<string, OwnershipEntry>);

      const formatted = Object.values(grouped).map((entry) => ({
        ...entry,
        ownership_percent: totalPCUs > 0 ? (entry.pcus / totalPCUs) * 100 : 0,
      })).sort((a, b) => b.pcus - a.pcus);

      setOwnership(formatted);
    } catch (err: any) {
      setError('Failed to load ownership data');
      toast.error('Could not load ownership breakdown');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwnership();

    const channel = supabase
      .channel(`ownership:${clusterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contributions', filter: `cluster_id=eq.${clusterId}` },
        () => loadOwnership()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [clusterId, refreshTrigger]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-full bg-gray-700 animate-pulse"></div>
        <div className="flex flex-wrap gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 w-20 bg-gray-700 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="text-red-400 text-sm p-4">{error}</div>;
  if (!ownership.length) return <p className="text-gray-400 text-sm">No ownership data yet.</p>;

  return (
    <div className="space-y-5">
      {/* Visual Bar */}
      <div className="flex rounded-full overflow-hidden h-8 md:h-10 w-full gap-px bg-gray-800 border border-gray-700 shadow-inner">
        {ownership.map((entry, i) => {
          const isUser = entry.participant_id === user?.id;
          const width = entry.ownership_percent < 1 ? 'min-w-[2%]' : `${entry.ownership_percent}%`;

          return (
            <div
              key={entry.participant_id}
              className={`
                ${COLORS[i % COLORS.length]} 
                transition-all duration-300 
                flex items-center justify-center 
                text-xs md:text-sm font-medium text-white/90 relative
                ${isUser ? 'ring-2 ring-offset-2 ring-offset-gray-950 ring-[var(--brand-primary)] shadow-[0_0_20px_rgba(102,126,234,0.7)] scale-105 z-10' : ''}
              `}
              style={{ width }}
              title={`${entry.display_name}${isUser ? ' (You)' : ''}: ${entry.ownership_percent.toFixed(1)}% (${entry.pcus.toLocaleString()} PCUs)`}
            >
              {entry.ownership_percent >= 5 && (
                <span className="drop-shadow-md">
                  {entry.ownership_percent.toFixed(0)}%
                  {isUser && <span className="ml-1 text-xs font-bold">(You)</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {ownership.map((entry, i) => {
          const isUser = entry.participant_id === user?.id;
          return (
            <div key={entry.participant_id} className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full ${COLORS[i % COLORS.length]} ${isUser ? 'ring-2 ring-[var(--brand-primary)] ring-offset-2 ring-offset-gray-950' : ''}`} />
              <span className={`font-medium ${isUser ? 'text-[var(--brand-primary)]' : 'text-gray-200'}`}>
                {entry.display_name}
                {isUser && ' (You)'}
              </span>
              <span className="text-gray-400">({entry.ownership_percent.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
