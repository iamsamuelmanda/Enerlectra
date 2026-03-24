import { Zap } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-3 group cursor-pointer">
      <div className="relative">
        {/* The "Out-of-space" Glow */}
        <div className="absolute inset-0 bg-brand-primary/40 blur-xl rounded-full animate-pulse group-hover:bg-brand-primary/60" />
        
        {/* The Diamond/Ethereum-esque Shell */}
        <div className="relative w-10 h-10 glass border-brand-primary/50 rotate-45 flex items-center justify-center overflow-hidden">
          <Zap 
            className="-rotate-45 text-white fill-brand-primary/20 group-hover:scale-110 transition-transform" 
            size={20} 
          />
        </div>
      </div>

      <div className="flex flex-col -space-y-1">
        <span className="text-xl font-display font-black tracking-tighter text-white uppercase">
          Enerlectra
        </span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-brand-primary font-bold">
          Fair Energy Ownership
        </span>
      </div>
    </div>
  );
}