import { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { contributionService } from '../../contributions/services/contributionService';
import { Wallet, TrendingUp, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export function EnergyWallet() {
  const { user } = useAuth();
  const [totalPCU, setTotalPCU] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWallet = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const contributions = await contributionService.getUserContributions(user.id);
      const total = contributions.reduce((sum, c) => sum + (c.pcus || 0), 0);
      setTotalPCU(total);
    } catch (err) {
      toast.error('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWallet(); }, [user?.id]);

  return (
    <div className="glass p-8 md:p-12 border-glass space-y-10 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 blur-[100px] pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl btn-primary p-0 flex items-center justify-center shadow-glow-purple">
            <Wallet size={28} />
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Energy Assets</h2>
            <p className="text-muted text-sm flex items-center gap-2">
              <ShieldCheck size={14} className="text-success" /> Verified on-chain via Enerlectra Protocol
            </p>
          </div>
        </div>

        <button 
          onClick={loadWallet}
          className="glass border-glass px-6 py-3 rounded-xl hover:bg-surface-overlay transition-all flex items-center gap-3 text-sm font-medium"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-brand-primary' : ''} />
          Refresh Balance
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Main Balance Card */}
        <div className="stat-card p-8 rounded-3xl bg-surface-overlay/40 border border-glass">
          <span className="text-muted uppercase text-[10px] tracking-[0.2em] font-bold">Total Portfolio Units (PCU)</span>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-5xl md:text-6xl font-display font-black text-white">
              {totalPCU?.toLocaleString() ?? '0'}
            </span>
            <span className="text-brand-primary font-bold">Units</span>
          </div>
        </div>

        {/* Energy Credits Card */}
        <div className="stat-card p-8 rounded-3xl bg-brand-primary/5 border border-brand-primary/20 relative group overflow-hidden">
          <span className="text-muted uppercase text-[10px] tracking-[0.2em] font-bold">Available Energy Credits</span>
          <div className="mt-4 flex items-center gap-3">
            <TrendingUp size={32} className="text-brand-primary opacity-50" />
            <span className="text-2xl font-display font-bold text-brand-primary italic">Coming in Beta v2</span>
          </div>
          <div className="absolute inset-0 bg-brand-gradient opacity-0 group-hover:opacity-5 transition-opacity" />
        </div>
      </div>

      <footer className="pt-8 border-t border-glass flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Zap size={14} className="text-warning" />
          PCUs represent fractional ownership of community microgrids.
        </div>
        <button className="text-brand-primary hover:text-white transition-colors text-sm font-bold">
          View Governance Rights →
        </button>
      </footer>
    </div>
  );
}