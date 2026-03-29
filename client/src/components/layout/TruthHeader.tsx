import { useEffect, useState } from 'react';
import { Activity, Zap, Globe, Clock, TrendingUp, User } from 'lucide-react';

export function TruthHeader() {
  const [fxRate, setFxRate] = useState<number>(28.45);
  const [premium, setPremium] = useState<number>(1.05);
  const [band, setBand] = useState<string>('standard');
  const [time, setTime] = useState(new Date());
  const [live, setLive] = useState(false);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const base = import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com';
        const url = `${base}/api/protocol/market-state`;
        const res = await fetch(url);
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

  const pegZMW = fxRate * 1.00;
  const marketZMW = pegZMW * premium;
  const pcuValueZMW = marketZMW;

  const bandColor = band === 'peak' ? 'text-red-400 bg-red-500/20'
    : band === 'off-peak' ? 'text-blue-400 bg-blue-500/20'
    : 'text-amber-400 bg-amber-500/20';

  return (
    <div className="w-full bg-black/90 border-b border-white/5 px-4 py-2 flex flex-col gap-2 sticky top-0 z-50 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between uppercase font-mono text-[9px] tracking-widest">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 font-bold ${live ? 'text-emerald-500' : 'text-amber-500'}`}>
            <Activity size={12} className="animate-pulse" />
            <span>{live ? 'Protocol Live' : 'Connecting...'}</span>
          </div>
          <div className="text-gray-700">|</div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock size={12} />
            <span>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} CAT</span>
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[7px] font-bold ${bandColor}`}>{band.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[7px] text-gray-500 flex items-center gap-1"><Globe size={10} /> Peg (Fixed)</span>
            <span className="text-gray-400 font-bold">K{pegZMW.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end border-l border-white/10 pl-6">
            <span className="text-[7px] text-gray-500 flex items-center gap-1"><TrendingUp size={10} /> Market (TOU)</span>
            <span className={`font-bold ${premium > 1.2 ? 'text-red-400' : premium < 1.0 ? 'text-blue-400' : 'text-amber-400'}`}>K{marketZMW.toFixed(2)}</span>
            <span className="text-[6px] text-gray-600">{premium > 1 ? '+' : ''}{((premium - 1) * 100).toFixed(0)}%</span>
          </div>
          <div className="flex flex-col items-end border-l border-white/10 pl-6">
            <span className="text-[7px] text-brand-primary">Instant (Now)</span>
            <span className="text-brand-primary font-black text-[11px]">K{pcuValueZMW.toFixed(2)}</span>
            <span className="text-[6px] text-gray-600">per kWh</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 cursor-pointer transition-colors">
            <User size={12} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[8px] text-gray-500 border-t border-white/5 pt-1">
        <Zap size={10} className="text-amber-500" />
        <span>1 PCU = 1 kWh = $1.00 USD</span>
        <span className="text-gray-700">|</span>
        <span>Rate: {fxRate.toFixed(4)} ZMW/USD</span>
        <span className="text-gray-700">|</span>
        <span className={live ? 'text-emerald-500' : 'text-amber-500'}>{live ? 'Oracle Connected' : 'Syncing...'}</span>
      </div>
    </div>
  );
}
