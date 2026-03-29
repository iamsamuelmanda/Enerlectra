import { useEffect, useState } from 'react';
import { Clock, TrendingUp, Globe } from 'lucide-react';

interface MarketState {
  usdToZmw: number;
  lastUpdated: string;
}

export function TruthHeader() {
  const [time, setTime] = useState(new Date());
  const [market, setMarket] = useState<MarketState | null>(null);

  // Real-time clock - ticks every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live FX rate
  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com';
        const url = baseUrl.endsWith('/api')
          ? `${baseUrl}/protocol/market-state`
          : `${baseUrl}/api/protocol/market-state`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMarket(data);
        } else {
          // Fallback to free public FX API
          const fx = await fetch('https://open.er-api.com/v6/latest/USD');
          const fxData = await fx.json();
          setMarket({ usdToZmw: fxData.rates?.ZMW ?? 27.4, lastUpdated: new Date().toISOString() });
        }
      } catch {
        // Use fallback rate if everything fails
        setMarket({ usdToZmw: 27.4, lastUpdated: new Date().toISOString() });
      }
    };
    fetchMarket();
    const interval = setInterval(fetchMarket, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const dateStr = time.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = time.toLocaleTimeString('en-ZM', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="w-full border-b border-white/5 bg-black/30 backdrop-blur-md px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-[10px] font-mono uppercase tracking-widest text-white/30">
        <div className="flex items-center gap-2">
          <Clock size={11} className="text-brand-primary" />
          <span className="text-white/60">{dateStr}</span>
          <span className="text-brand-primary font-bold">{timeStr}</span>
          <span className="text-white/20">CAT (UTC+2)</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={11} className="text-emerald-400" />
            <span>USD/ZMW</span>
            <span className="text-emerald-400 font-bold">
              {market ? `K${market.usdToZmw.toFixed(2)}` : '...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Globe size={11} className="text-indigo-400" />
            <span>Enerlectra Protocol</span>
            <span className="text-emerald-500">● LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

