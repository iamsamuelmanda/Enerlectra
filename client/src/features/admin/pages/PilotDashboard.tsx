import { useState } from 'react';
import { useClusters } from '@/features/clusters/hooks/useCluster';
import { useAdminActions } from '@/hooks/useAdminActions';
import { Zap, Users, BarChart3, Send, ShieldAlert, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function PilotDashboard() {
  const { clusters, loading } = useClusters();
  const { distributeYield } = useAdminActions();
  const [selectedCluster, setSelectedCluster] = useState('');
  const [yieldAmount, setYieldAmount] = useState(0);

  const handleDistribute = async () => {
    if (!selectedCluster || yieldAmount <= 0) return;
    if (!confirm(`Distribute ${yieldAmount} PCU to all members of this node?`)) return;
    await distributeYield.mutateAsync({ clusterId: selectedCluster, totalKwh: yieldAmount });
    setYieldAmount(0);
  };

  if (loading) return <div className="p-20 text-center text-white/20 font-black animate-pulse">BOOTING ADMIN...</div>;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl border border-red-500/20">
          <ShieldAlert size={24} />
        </div>
        <div>
          <h1 className="text-4xl font-display font-black tracking-tighter uppercase italic">Admin Pilot</h1>
          <p className="text-white/50">Manual Yield Distribution & Node Oversight</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card variant="glass" padding="lg">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Zap size={18} className="text-brand-primary" /> Trigger Yield Distribution
            </h3>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-white/40 tracking-widest block mb-2">Select Active Node</label>
                <select 
                  value={selectedCluster} 
                  onChange={(e) => setSelectedCluster(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-brand-primary"
                >
                  <option value="">Choose a community cluster...</option>
                  {clusters.map(c => <option key={c.id} value={c.id}>{c.name} ({c.location})</option>)}
                </select>
              </div>
              
              <div>
                <label className="text-[10px] font-black uppercase text-white/40 tracking-widest block mb-2">Total Energy Generated (kWh/PCU)</label>
                <input 
                  type="number" 
                  value={yieldAmount} 
                  onChange={(e) => setYieldAmount(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-2xl font-display font-bold outline-none focus:border-brand-primary"
                />
              </div>

              <button 
                onClick={handleDistribute} 
                disabled={distributeYield.isPending || !selectedCluster}
                className="w-full py-5 bg-brand-primary text-black font-black uppercase tracking-widest rounded-2xl hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {distributeYield.isPending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                Execute Distribution
              </button>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card variant="raised" padding="lg">
            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-widest mb-4">Network Stats</h4>
            <div className="space-y-4">
              <Stat label="Total Nodes" value={clusters.length} />
              <Stat label="Avg. Funding" value="74%" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string, value: any }) {
  return (
    <div className="flex justify-between items-center border-b border-white/5 pb-2">
      <span className="text-xs font-bold text-white/60">{label}</span>
      <span className="text-white font-display font-black">{value}</span>
    </div>
  );
}
