import { Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-[#05050a]/95 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-8">
        
        {/* STATUS BAR */}
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 rounded-md bg-brand-primary/10 border border-brand-primary/20">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">
              Early Access
            </span>
          </div>
          <span className="text-[10px] font-medium text-white/20 uppercase tracking-widest">
            v2.4.0
          </span>
        </div>

        {/* THE MISSION (No Jargon) */}
        <div className="text-center">
          <p className="text-[12px] text-white/50 font-bold uppercase tracking-[0.2em]">
            The Fair Energy Ownership Platform
          </p>
        </div>

        {/* BRANDING */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-black text-white uppercase tracking-tighter leading-none">
              Enerlectra
            </p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1 font-medium">
              Africa
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
            <Zap size={18} className="text-brand-primary" fill="currentColor" fillOpacity={0.2} />
          </div>
        </div>
        
      </div>

      {/* SUBTLE ACCENT LINE */}
      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </footer>
  );
}