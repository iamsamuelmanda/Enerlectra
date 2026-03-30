import { useNavigate } from 'react-router-dom';
import { Zap, Battery, Users, Clock, MapPin, MessageSquare } from 'lucide-react';

export function ClusterCard({ cluster }: any) {
  const navigate = useNavigate();
  const fundingPct = Math.min(100, Math.round((cluster.current_usd / cluster.target_usd) * 100));

  // --- ELLIE DEEP LINK LOGIC ---
  const handleEllieSync = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigating to the details page
    const botUsername = "Enerlectrabot";
    // Encode context: c = cluster, u = unit
    const payload = btoa(`c:${cluster.id}|u:unit-${cluster.id}`);
    window.open(`https://t.me/${botUsername}?start=${payload}`, '_blank');
  };

  return (
    <div 
      onClick={() => navigate(`/clusters/${cluster.id}`)}
      className="glass group cursor-pointer overflow-hidden p-8 flex flex-col gap-8 border-glass hover:border-brand-primary/40 transition-all duration-500"
    >
      {/* Header Section */}
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h3 className="font-display text-2xl font-bold group-hover:text-brand-primary transition-colors">
            {cluster.name}
          </h3>
          <p className="flex items-center gap-1.5 text-muted text-sm">
            <MapPin size={14} className="text-brand-primary" />
            {cluster.location || 'Lusaka, ZM'}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
          cluster.lifecycle_state === 'ACTIVE' ? 'border-success text-success bg-success/10' : 'border-warning text-warning bg-warning/10'
        }`}>
          {cluster.lifecycle_state}
        </div>
      </div>

      {/* Modern Metric Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card p-4 rounded-2xl bg-surface-overlay/50">
          <div className="flex items-center gap-2 text-muted text-[10px] uppercase tracking-tighter">
            <Zap size={14} /> Solar
          </div>
          <div className="text-xl font-display font-bold">{cluster.target_kw} <span className="text-xs font-normal opacity-50">kW</span></div>
        </div>
        <div className="stat-card p-4 rounded-2xl bg-surface-overlay/50">
          <div className="flex items-center gap-2 text-muted text-[10px] uppercase tracking-tighter">
            <Battery size={14} /> Storage
          </div>
          <div className="text-xl font-display font-bold">{cluster.target_storage_kwh} <span className="text-xs font-normal opacity-50">kWh</span></div>
        </div>
      </div>

      {/* Funding Progress */}
      <div className="space-y-3 pt-4 border-t border-glass">
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-muted text-[10px] uppercase">Funded</span>
            <span className="text-lg font-bold">${cluster.current_usd.toLocaleString()}</span>
          </div>
          <span className="text-brand-primary font-bold">{fundingPct}%</span>
        </div>
        <div className="progress-track h-2 bg-surface-overlay">
          <div className="progress-fill" style={{ width: `${fundingPct}%` }} />
        </div>
      </div>

      {/* Footer Info & New Sync Button */}
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5 text-muted">
          <Users size={14} /> {cluster.participant_count} Members
        </div>
        
        <button 
          onClick={handleEllieSync}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary rounded-lg border border-brand-primary/20 transition-all font-bold group-hover:scale-105"
        >
          <MessageSquare size={14} />
          Sync via Ellie
        </button>
      </div>
    </div>
  );
}