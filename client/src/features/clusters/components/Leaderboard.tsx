// src/features/clusters/components/Leaderboard.tsx
import { useEffect, useState, useCallback } from 'react';
import { Trophy, Medal, Users, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Leader {
  display_name: string;
  total_pcus: number;
  rank: number;
}

interface Props {
  clusterId?: string; // Optional: If provided, shows cluster leaders. If null, shows Global.
}

export function Leaderboard({ clusterId }: Props) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('contributions')
        .select('display_name, pcus')
        .eq('status', 'COMPLETED');

      if (clusterId) {
        query = query.eq('cluster_id', clusterId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by name and sum PCUs
      const totals = data.reduce((acc, curr) => {
        const name = curr.display_name || 'Anonymous Scout';
        acc[name] = (acc[name] || 0) + (curr.pcus || 0);
        return acc;
      }, {} as Record<string, number>);

      const sorted = Object.entries(totals)
        .map(([display_name, total_pcus]) => ({ display_name, total_pcus }))
        .sort((a, b) => b.total_pcus - a.total_pcus)
        .slice(0, 5) // Top 5
        .map((item, index) => ({ ...item, rank: index + 1 }));

      setLeaders(sorted);
    } catch (err) {
      console.error('Leaderboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchLeaders();
    // Real-time listener: Update leaderboard whenever a new contribution is completed
    const channel = supabase
      .channel('leaderboard_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contributions' }, () => fetchLeaders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaders]);

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {clusterId ? <Users className="w-5 h-5 text-emerald-400" /> : <Globe className="w-5 h-5 text-sky-400" />}
          <h3 className="font-bold text-gray-100">{clusterId ? 'Cluster Top 5' : 'Global Leaders'}</h3>
        </div>
        <Trophy className="w-5 h-5 text-amber-400" />
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-800 animate-pulse rounded-xl" />)
        ) : leaders.length > 0 ? (
          leaders.map((leader) => (
            <div 
              key={leader.display_name}
              className="flex items-center justify-between p-3 rounded-xl bg-gray-800/30 border border-gray-700/50 hover:border-emerald-500/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <RankIcon rank={leader.rank} />
                <span className="font-medium text-gray-200">{leader.display_name}</span>
              </div>
              <div className="text-right">
                <span className="text-emerald-400 font-bold">{leader.total_pcus.toLocaleString()}</span>
                <span className="text-[10px] text-gray-500 ml-1 uppercase tracking-wider">PCUs</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 text-sm py-4">Waiting for the first contributor...</p>
        )}
      </div>
    </div>
  );
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-5 h-5 text-amber-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
  return <span className="w-5 text-center text-xs font-bold text-gray-600">{rank}</span>;
}