// client/src/components/layout/TruthHeader.tsx
import { useEffect, useState } from 'react';
import { Activity, Zap, Globe, Clock, TrendingUp, User } from 'lucide-react';

export function TruthHeader() {
  const [rate, setRate] = useState<number>(28.45);
  const [premium, setPremium] = useState<number>(1.05);
  const [temporalBand, setTemporalBand] = useState<string>('standard');
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Physics & Governance Constants
  const PCU_PEG_USD = 1.00;

  useEffect(() => {
    // Fetch market state from protocol oracle
    const fetchMarketTruth = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com';
        const res = await fetch(`${baseUrl}/api/protocol/market-state`);
        
        if (!res.ok) throw new Error('Oracle unavailable');
        
        const data = await res.json();
        setRate(data.fxRate);
        setPremium(data.currentPremium);
        setTemporalBand(data.temporalBand);
        setLoading(false);
      } catch (e) {
        console.warn('[TruthHeader] Oracle fetch failed, using fallback');
        // Fallback: calculate locally
        const hour = new Date().getHours();
        const getPremium = (h: number) => {
          if (h >= 18 && h <= 22) return 1.45;
          if (h >= 22 || h <= 6) return 0.85;
          return 1.05;
        };
        setPremium(getPremium(hour));
        setTemporalBand(hour >= 18 && hour <= 22 ? 'peak' : hour >= 22 || hour <= 6 ? 'off-peak' : 'standard');
        setLoading(false);
      }
    };

    fetchMarketTruth();
    
    // Update time every second
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    // Refresh market data every 60 seconds
    const marketTimer = setInterval(fetchMarketTruth, 60000);
    
    return () => {
      clearInterval(timer);
      clearInterval(marketTimer);
    };
  }, []);

  // Computed Truths
  const pegZMW = rate * PCU_PEG_USD;           // Layer 1: Physics
  const marketZMW = pegZMW * premium;          // Layer 2: Temporal
  const instantZMW = marketZMW;                // Layer 3: Instant (same for now)

  // Determine band color
  const bandColor = temporalBand === 'peak' ? 'text-red-400 bg-red-500/20' : 
                    temporalBand === 'off-peak' ? 'text-blue-400 bg-blue-500/20' : 
                    'text-amber-400 bg-amber-500/20';

  return (
    <div className="w-full bg-black/90 border-b border-white/5 px-4 py-2 flex flex-col gap-2 sticky top-0 z-50 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between uppercase font-mono text-[9px] tracking-widest">
        
        {/* Global Network State */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-emerald-500 font-bold">
            <Activity size={12} className={loading ? '' : 'animate-pulse'} />
            <span>Protocol {loading ? 'Syncing' : 'Live'}</span>
          </div>
          
          <div className="text-gray-700">|</div>
          
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock size={12} />
            <span>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} CAT</span>
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[7px] font-bold ${bandColor}`}>
              {temporalBand.toUpperCase()}
            </span>
          </div>
        </div>

        {/* The Three Truths */}
        <div className="flex items-center gap-6">
          {/* Peg */}
          <div className="flex flex-col items-end">
            <span className="text-[7px] text-gray-500 flex items-center gap-1">
              <Globe size={10} /> Peg (Fixed)
            </span>
            <span className="text-gray-400 font-bold">K{pegZMW.toFixed(2)}</span>
          </div>

          {/* Market */}
          <div className="flex flex-col items-end border-l border-white/10 pl-6">
            <span className="text-[7px] text-gray-500 flex items-center gap-1">
              <TrendingUp size={10} /> Market (TOU)
            </span>
            <span className={`font-bold ${premium > 1.2 ? 'text-red-400' : premium < 1.0 ? 'text-blue-400' : 'text-amber-400'}`}>
              K{marketZMW.toFixed(2)}
            </span>
            <span className="text-[6px] text-gray-600">
              {premium > 1 ? '+' : ''}{((premium - 1) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Instant */}
          <div className="flex flex-col items-end border-l border-white/10 pl-6">
            <span className="text-[7px] text-brand-primary">Instant (Now)</span>
            <span className="text-brand-primary font-black text-[11px]">
              K{instantZMW.toFixed(2)}
            </span>
            <span className="text-[6px] text-gray-600">per kWh</span>
          </div>
        </div>

        {/* Human Layer - Actions */}
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-brand-primary text-black text-[8px] font-black uppercase hover:bg-brand-primary/80 transition-colors">
            Buy
          </button>
          <button className="px-3 py-1.5 rounded bg-white/5 text-white border border-white/10 text-[8px] font-black uppercase hover:bg-white/10 transition-colors">
            Trade
          </button>
          <div className="ml-2 p-1.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 cursor-pointer transition-colors">
            <User size={12} />
          </div>
        </div>
      </div>

      {/* Physics Truth Bar */}
      <div className="flex items-center justify-center gap-2 text-[8px] text-gray-500 border-t border-white/5 pt-1">
        <Zap size={10} className="text-amber-500" />
        <span>1 PCU ≡ 1 kWh ≡ 1 USD</span>
        <span className="text-gray-700">|</span>
        <span>Rate: {rate.toFixed(4)} ZMW/USD</span>
        <span className="text-gray-700">|</span>
        <span className={loading ? 'text-amber-500' : 'text-emerald-500'}>
          {loading ? 'Syncing...' : 'Oracle Connected'}
        </span>
      </div>
    </div>
  );
}