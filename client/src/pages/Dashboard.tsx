import ClusterList from '@/features/clusters/components/ClusterList';
import { Card } from '@/components/ui/Card';
import { Zap, Battery, DollarSign, Users, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  return (
    <div className="space-y-16 animate-in fade-in duration-1000">
      <header className="relative py-12 md:py-20 overflow-hidden text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="relative z-10 space-y-6">
          <h1 className="text-6xl md:text-9xl font-display font-black tracking-tighter text-white uppercase italic">
            The Energy <span className="text-brand-primary">Internet.</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/50 max-w-3xl mx-auto leading-relaxed">
            Direct ownership of Zambia renewable future. Community-led, fractionalized, and verified on-chain.
          </p>
          <div className="flex justify-center">
            <button className="btn-primary px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-3" onClick={() => navigate("/clusters/new")}>
              <Plus size={20} />
              <span>Launch Cluster</span>
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatItem icon={<Zap size={22} />} value="3" label="Active Clusters" color="text-brand-primary" />
        <StatItem icon={<Battery size={22} />} value="110 kWh" label="Storage Capacity" color="text-emerald-400" />
        <StatItem icon={<DollarSign size={22} />} value="ZMW" label="Mobile Money Ready" color="text-amber-400" />
        <StatItem icon={<Users size={22} />} value="Pilot" label="Phase · Lusaka" color="text-sky-400" />
      </div>

      <div className="pt-10">
        <ClusterList />
      </div>
    </div>
  );
}

function StatItem({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  return (
    <Card variant="raised" padding="lg" className="group">
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`p-4 rounded-2xl bg-white/5 group-hover:scale-110 transition-transform ${color}`}>
          {icon}
        </div>
        <div className="text-3xl font-display font-black text-white leading-none">{value}</div>
        <div className="text-[10px] text-white/40 uppercase font-bold tracking-[0.2em]">{label}</div>
      </div>
    </Card>
  );
}
