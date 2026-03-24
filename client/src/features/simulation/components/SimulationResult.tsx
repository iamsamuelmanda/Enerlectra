import { Card } from '@/components/ui/Card';
import { TrendingUp, AlertCircle, CheckCircle, RefreshCcw, Activity } from 'lucide-react';

interface SimulationResultProps {
  data: {
    projectedROI: string;
    riskLevel: string;
    recommendation: string;
    logic: string[];
  };
  onReset: () => void;
}

export function SimulationResultView({ data, onReset }: SimulationResultProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* 1. TOP METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card variant="glass" padding="md" className="border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} />
          </div>
          <p className="text-[10px] uppercase font-black text-emerald-500/70 tracking-[0.2em] mb-1">Projected ROI</p>
          <div className="flex items-center gap-2 text-3xl font-display font-black text-emerald-400">
            {data.projectedROI}
          </div>
        </Card>

        <Card variant="glass" padding="md" className="border-brand-primary/20 bg-brand-primary/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertCircle size={48} />
          </div>
          <p className="text-[10px] uppercase font-black text-brand-primary/70 tracking-[0.2em] mb-1">Risk Assessment</p>
          <div className="flex items-center gap-2 text-3xl font-display font-black text-white uppercase tracking-tighter">
            {data.riskLevel}
          </div>
        </Card>
      </div>

      {/* 2. EXECUTIVE SUMMARY */}
      <Card variant="raised" padding="lg" className="border-l-4 border-brand-primary shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-brand-primary/20 rounded-lg">
            <CheckCircle size={18} className="text-brand-primary" />
          </div>
          <h4 className="text-xs font-black text-white uppercase tracking-widest">Strategic Recommendation</h4>
        </div>
        <p className="text-xl font-medium text-white leading-relaxed font-display">
          {data.recommendation}
        </p>
      </Card>

      {/* 3. NEURAL LOGIC BREAKDOWN */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1 mb-2">
          <Activity size={14} className="text-muted" />
          <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Calculation Path / / Trace Log</span>
        </div>
        
        {data.logic.map((item: string, i: number) => (
          <div 
            key={i} 
            className="p-4 glass border-glass rounded-xl text-sm text-secondary flex gap-4 items-start hover:border-brand-primary/30 transition-colors group"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <span className="font-mono-dm text-brand-primary text-[10px] pt-1 opacity-50 group-hover:opacity-100">
              0{i + 1}
            </span>
            <p className="leading-relaxed">
              <span className="text-brand-primary font-bold mr-2">▶</span> 
              {item}
            </p>
          </div>
        ))}
      </div>

      {/* 4. ACTIONS */}
      <button 
        onClick={onReset} 
        className="group w-full py-4 flex flex-col items-center gap-2 border border-dashed border-glass rounded-2xl hover:bg-white/5 transition-all"
      >
        <RefreshCcw size={16} className="text-muted group-hover:rotate-180 transition-transform duration-500" />
        <span className="text-[10px] text-muted uppercase font-black tracking-[0.3em] group-hover:text-white">
          Clear Buffer & New Simulation
        </span>
      </button>
    </div>
  );
}