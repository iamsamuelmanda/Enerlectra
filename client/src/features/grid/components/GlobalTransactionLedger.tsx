import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Globe } from 'lucide-react';

interface Transaction {
  id: string;
  user_id: string;
  contribution_amount: number;
  cluster_name: string;
  created_at: string;
}

export function GlobalTransactionLedger() {
  const [txs, setTxs] = useState<Transaction[]>([]);

  const fetchRecent = async () => {
    const { data } = await supabase
      .from('cluster_members')
      .select('id, user_id, contribution_amount, joined_at, clusters(name)')
      .order('joined_at', { ascending: false })
      .limit(10);

    if (data) {
      setTxs(data.map((d: any) => ({
        id: d.id,
        user_id: d.user_id?.slice(0, 8) || 'anon',
        contribution_amount: d.contribution_amount,
        cluster_name: d.clusters?.name || 'Unknown Node',
        created_at: d.joined_at,
      })));
    }
  };

  useEffect(() => {
    fetchRecent();
    const channel = supabase
      .channel('global_ledger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cluster_members' }, fetchRecent)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="bg-black/20 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md">
      <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400 animate-spin-slow" />
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-gray-300">Live Protocol Feed</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-500">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></span>
          LIVE
        </div>
      </div>
      <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
        {txs.map((tx) => (
          <div key={tx.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors group">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[11px] font-bold text-gray-200 group-hover:text-indigo-400 transition-colors">
                Node {tx.user_id}...
              </span>
              <span className="text-[10px] font-mono text-emerald-400">+${tx.contribution_amount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-tighter">{tx.cluster_name}</span>
              <span className="text-[9px] font-mono text-gray-600">
                {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {txs.length === 0 && (
          <div className="p-8 text-center text-gray-600 text-[10px] font-mono italic">Awaiting protocol activity...</div>
        )}
      </div>
    </div>
  );
}
