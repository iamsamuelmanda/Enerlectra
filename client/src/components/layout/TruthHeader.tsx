// client/src/components/layout/TruthHeader.tsx
import { useEffect, useState } from 'react';
import { Activity, Zap, Globe, Clock, TrendingUp, User, AlertCircle } from 'lucide-react';

export function TruthHeader() {
  const [protocolData, setProtocolData] = useState<{
    pcuPegUsd: number | null;
    kwhPerPcu: number | null;
    fxRate: number | null;
    currentPremium: number | null;
    temporalBand: string | null;
    pcuValueZMW: number | null;
  }>({
    pcuPegUsd: null,
    kwhPerPcu: null,
    fxRate: null,
    currentPremium: null,
    temporalBand: null,
    pcuValueZMW: null
  });
  
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProtocolTruth = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'https://enerlectra-backend.onrender.com';
        const res = await fetch(`${baseUrl}/api/protocol/market-state`);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (typeof data.pcuPegUsd !== 'number' || 
            typeof data.fxRate !== 'number' || 
            typeof data.currentPremium !== 'number') {
          throw new Error('Invalid response format');
        }
        
        setProtocolData({
          pcuPegUsd: data.pcuPegUsd,
          kwhPerPcu: data.kwhPerPcu,
          fxRate: data.fxRate,
          currentPremium: data.currentPremium,
          temporalBand: data.temporalBand,
          pcuValueZMW: data.pcuValueZMW
        });
        
        setError(null);
        setLoading(false);
        
        console.log('[TruthHeader] Protocol data updated:', data);
      } catch (e: any) {
        console.error('[TruthHeader] Fetch failed:', e.message);
        setError(e.message);
        setLoading(false);
        
        if (protocolData.fxRate === null) {
          const hour = new Date().getHours();
          const fallbackPremium = hour >= 18 && hour <= 22 ? 1.45 : hour >= 22 || hour <= 6 ? 0.85 : 1.05;
          const fallbackRate = 28.45;
          
          setProtocolData({
            pcuPegUsd: 1.00,
            kwhPerPcu: 1.00,
            fxRate: fallbackRate,
            currentPremium: fallbackPremium,
            temporalBand: hour >= 18 && hour <= 22 ? 'peak' : hour >= 22 || hour <= 6 ? 'off-peak' : 'standard',
            pcuValueZMW: fallbackRate * 1.00 * fallbackPremium
          });
        }
      }
    };

    fetchProtocolTruth();
    
    const timer = setInterval(() => setTime(new Date()), 1000);
    const marketTimer = setInterval(fetchProtocolTruth, 30000);
    
    return () => {
      clearInterval(timer);
      clearInterval(marketTimer);
    };
  }, []);

  const pcuPegUsd = protocolData.pcuPegUsd ?? 1.00;
  const kwhPerPcu = protocolData.kwhPerPcu ?? 1.00;
  const fxRate = protocolData.fxRate ?? 28.45;
  const premium = protocolData.currentPremium ?? 1.05;
  const temporalBand = protocolData.temporalBand ?? 'standard';
  const pcuValueZMW = protocolData.pcuValueZMW ?? fxRate * pcuPegUsd * premium;

  const pegZMW = fxRate * pcuPegUsd;
  const marketZMW = pegZMW * premium;

  const bandColor = temporalBand === 'peak' ? 'text-red-400 bg-red-500/20' : 
                    temporalBand === 'off-peak' ? 'text-blue-400 bg-blue-500/20' : 
                    'text-amber-400 bg-amber-500/20';

  return (
    <div className="w-full bg-black/90 border-b border-white/5 px-4 py-2 flex flex-col gap-2 sticky top-0 z-50 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between uppercase font-mono text-[9px] tracking-widest">
        
        {/* Status */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 font-bold ${loading ? 'text-amber-500' : error ? 'text-red-500' : 'text-emerald-500'}`}>
            {loading ? <Activity size={12} className="animate-pulse" /> : 
             error ? <AlertCircle size={12} /> : 
             <Activity size={12} className="animate-pulse" />}
            <span>
              {loading ? 'Syncing...' : error ? 'Oracle Error' : 'Protocol Live'}
            </span>
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
            <span className="text-gray-400 font-bold">
              K{pegZMW.toFixed(2)}
            </span>
            {loading && <span className="text-[6px] text-amber-500">syncing...</span>}
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
              K{pcuValueZMW.toFixed(2)}
            </span>
            <span className="text-[6px] text-gray-600">per kWh</span>
          </div>
        </div>

        {/* User Profile Only - No Trading Buttons */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 cursor-pointer transition-colors">
            <User size={12} />
          </div>
        </div>
      </div>

      {/* Physics Truth Bar */}
      <div className="flex items-center justify-center gap-2 text-[8px] text-gray-500 border-t border-white/5 pt-1">
        <Zap size={10} className="text-amber-500" />
        <span>{kwhPerPcu.toFixed(2)} PCU ≡ {kwhPerPcu.toFixed(2)} kWh ≡ {pcuPegUsd.toFixed(2)} USD</span>
        <span className="text-gray-700">|</span>
        <span>Rate: {fxRate.toFixed(4)} ZMW/USD</span>
        <span className="text-gray-700">|</span>
        <span className={error ? 'text-red-500' : loading ? 'text-amber-500' : 'text-emerald-500'}>
          {error ? `Error: ${error}` : loading ? 'Syncing...' : 'Oracle Connected'}
        </span>
      </div>
    </div>
  );
}