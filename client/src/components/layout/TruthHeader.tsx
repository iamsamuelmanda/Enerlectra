import { useEffect, useState } from 'react';
import { Activity, Zap, Globe, Clock, TrendingUp, Cpu } from 'lucide-react';

export function TruthHeader() {
  const [fxRate, setFxRate] = useState<number>(28.45);
  const [premium, setPremium] = useState<number>(1.05);
  const [band, setBand] = useState<string>('standard');
  const [time, setTime] = useState(new Date());
  const [live, setLive] = useState(false);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const base = (import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com')
          .replace(/\/api$/, '');
        const res = await fetch(`${base}/api/protocol/market-state`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        if (typeof data.fxRate === 'number') setFxRate(data.fxRate);
        if (typeof data.currentPremium === 'number') setPremium(data.currentPremium);
        if (data.temporalBand) setBand(data.temporalBand);
        setLive(true);
      } catch {
        setLive(false);
      }
    };
    fetchMarket();
    const interval = setInterval(fetchMarket, 5 * 60 * 1000);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(timer); };
  }, []);

  const marketZMW = fxRate * premium;

  const bandStyles = band === 'peak'
    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    : band === 'off-peak'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : 'text-violet-400 bg-violet-500/10 border-violet-500/20';

  const timeStr = time.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  return (
    <div className="w-full bg-slate-950/90 border-b border-white/5 sticky top-0 z-[100] backdrop-blur-xl py-4 px-6">
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-6 font-mono">
        
        {/* LEFT SECTION: STATUS & TEMPORAL STATE */}
        <div className="flex items-center gap-8">
          <div className={`flex items-center gap-2.5 text-[12px] font-black uppercase tracking-widest ${live ? 'text-emerald-400' : 'text-amber-500'}`}>
            <Activity size={16} className={live ? 'animate-pulse' : ''} />
            <span>{live ? 'Protocol Active' : 'Connecting Oracle...'}</span>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 text-white/40 text-[12px] border-l border-white/10 pl-8">
            <Clock size={16} className="text-violet-400" />
            <span className="text-white/90 font-bold">{timeStr}</span>
            <span className={`px-2.5 py-0.5 rounded border text-[10px] font-black tracking-tighter transition-all duration-500 ${bandStyles}`}>
              {band.toUpperCase()}
            </span>
          </div>
        </div>

        {/* RIGHT SECTION: MARKET METRICS */}
        <div className="flex items-center gap-12">
          {/* Peg Data */}
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-white/30 uppercase tracking-tighter flex items-center gap-1.5">
              <Globe size={12} /> Peg (Fixed)
            </span>
            <span className="text-[14px] text-white/70 font-bold">
              K{fxRate.toFixed(2)}
            </span>
          </div>

          {/* Premium Data */}
          <div className="hidden sm:flex flex-col items-end border-l border-white/10 pl-12">
            <span className="text-[10px] text-white/30 uppercase tracking-tighter flex items-center gap-1.5">
              <TrendingUp size={12} /> Market Premium
            </span>
            <span className={`text-[14px] font-bold ${premium >= 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {premium > 1 ? '+' : ''}{((premium - 1) * 100).toFixed(1)}%
            </span>
          </div>

          {/* MAIN CALLOUT: INSTANT PRICE */}
          <div className="flex items-center gap-5 bg-violet-600/10 border border-violet-500/30 px-6 py-2.5 rounded-2xl shadow-2xl shadow-violet-500/5">
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-violet-400 font-black uppercase tracking-widest leading-none mb-1">Instant Price</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl text-white font-black leading-none">K{marketZMW.toFixed(2)}</span>
                <span className="text-[11px] text-white/40 uppercase font-bold">/ kWh</span>
              </div>
            </div>
            <div className="bg-violet-500/20 p-2.5 rounded-xl">
              <Cpu size={22} className="text-violet-400" />
            </div>
          </div>
        </div>
      </div>

      {/* LOWER COMPLIANCE STRIP */}
      <div className="flex items-center justify-center gap-8 text-[11px] text-white/20 border-t border-white/5 pt-3 mt-3 font-mono">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <span className="font-bold text-white/30">1 PCU = 1 kWh = $1.00 USD</span>
        </div>
        <span className="opacity-20 text-lg leading-none">|</span>
        <span className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
          <span className={live ? 'text-emerald-500/60' : 'text-amber-500/60'}>
            {live ? 'Ledger Synchronized' : 'Syncing Data Stream...'}
          </span>
        </span>
        <span className="opacity-20 text-lg leading-none">|</span>
        <span>Rate: {fxRate.toFixed(4)} ZMW/USD</span>
      </div>
    </div>
  );
}