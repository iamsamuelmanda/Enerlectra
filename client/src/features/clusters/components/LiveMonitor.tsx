import { Card } from '@/components/ui/Card';
import { Activity, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

interface LiveMonitorProps {
  generation: number; // in kW
  consumption: number; // in kW
}

export function LiveMonitor({ generation, consumption }: LiveMonitorProps) {
  const netFlow = generation - consumption;
  const isSurplus = netFlow >= 0;

  return (
    <Card variant="glass" padding="lg" className="relative overflow-hidden border-brand-primary/20 bg-brand-primary/5">
      <div className="absolute top-0 right-0 p-4">
        <div className="flex items-center gap-2 px-3 py-1 bg-brand-primary/20 rounded-full border border-brand-primary/30">
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Live Feed</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
        {/* Generation */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted">
            <ArrowUpRight size={14} className="text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Input (Solar)</span>
          </div>
          <p className="text-4xl font-display font-black text-white">{generation.toFixed(2)} <span className="text-sm text-muted">kW</span></p>
        </div>

        {/* Net Flow Visualizer */}
        <div className="flex flex-col items-center justify-center py-4 border-x border-glass">
          <Zap className={cn("mb-2", isSurplus ? "text-emerald-400" : "text-warning")} size={32} />
          <p className={cn("text-2xl font-display font-black", isSurplus ? "text-emerald-400" : "text-warning")}>
            {isSurplus ? `+${netFlow.toFixed(2)}` : netFlow.toFixed(2)}
          </p>
          <p className="text-[8px] uppercase font-bold tracking-[0.3em] text-muted">Net Grid Flow</p>
        </div>

        {/* Consumption */}
        <div className="space-y-1 text-right md:text-left md:pl-8">
          <div className="flex items-center gap-2 text-muted justify-end md:justify-start">
            <ArrowDownRight size={14} className="text-warning" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Output (Load)</span>
          </div>
          <p className="text-4xl font-display font-black text-white">{consumption.toFixed(2)} <span className="text-sm text-muted">kW</span></p>
        </div>
      </div>
    </Card>
  );
}
