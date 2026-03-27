import ClusterList from '@/features/clusters/components/ClusterList';
import { Card } from '@/components/ui/Card';
import { Zap, Battery, DollarSign, Users, Plus, Globe, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TruthHeader } from '@/components/layout/TruthHeader';
import { GlobalTransactionLedger } from '@/features/grid/components/GlobalTransactionLedger';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0c]">
      {/* 🌍 The Source of Truth (Live FX & Date) */}
      <TruthHeader />

      <div className="max-w-7xl mx-auto px-4 pb-20 space-y-16 animate-in fade-in duration-1000">
        
        {/* HERO SECTION */}
        <header className="relative py-12 md:py-24 overflow-hidden text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 space-y-8">
            <h1 className="text-6xl md:text-9xl font-display font-black tracking-tighter text-white uppercase italic leading-[0.8]">
              The Energy <span className="text-brand-primary">Internet.</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/50 max-w-3xl mx-auto leading-relaxed font-light">
              Direct ownership of Africa's renewable future. <span className="text-white">Community-led</span>, fractionalized, and verified by the Enerlectra Protocol.
            </p>
            <div className="flex flex-col md:flex-row justify-center items-center gap-4">
              <button 
                className="btn-primary w-full md:w-auto px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-transform hover:scale-105 active:scale-95" 
                onClick={() => navigate("/clusters/new")}
              >
                <Plus size={20} />
                <span>Launch Node</span>
              </button>
              <div className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                <Globe className="w-4 h-4 text-emerald-500 animate-pulse" />
                Network Status: Operational
              </div>
            </div>
          </div>
        </header>

        {/* PROTOCOL STATS & LIVE FEED */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* STATS GRID */}
          <div className="lg:col-span-8 grid grid-cols-2 gap-4">
            <StatItem icon={<Zap size={22} />} value="3" label="Protocol Nodes" color="text-brand-primary" />
            <StatItem icon={<Battery size={22} />} value="110 kWh" label="Storage Cap" color="text-emerald-400" />
            <StatItem icon={<DollarSign size={22} />} value="ZMW" label="Settlement Currency" color="text-amber-400" />
            <StatItem icon={<Activity size={22} />} value="Live" label="Network Pulse" color="text-sky-400" />
            
            <div className="col-span-2 pt-6">
               <ClusterList />
            </div>
          </div>

          {/* LIVE TRANSACTION LEDGER */}
          <div className="lg:col-span-4">
            <div className="sticky top-8">
               <GlobalTransactionLedger />
               <p className="mt-4 px-2 text-[9px] font-mono text-gray-600 leading-relaxed uppercase tracking-wider">
                 All transactions are recorded in the global Enerlectra ledger. 
                 Real-time exchange rates provided by the Protocol Oracle.
               </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function StatItem({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  return (
    <Card variant="raised" padding="lg" className="group border-white/5 bg-white/[0.02]">
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`p-4 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-all ${color}`}>
          {icon}
        </div>
        <div className="text-3xl font-display font-black text-white leading-none">{value}</div>
        <div className="text-[10px] text-white/40 uppercase font-bold tracking-[0.2em]">{label}</div>
      </div>
    </Card>
  );
}