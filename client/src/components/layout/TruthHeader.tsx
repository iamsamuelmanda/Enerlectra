// src/components/TruthHeader.tsx
import { useEffect, useState } from 'react';
import {
  Activity,
  Globe,
  Clock,
  TrendingUp,
  Cpu,
  AlertCircle,
  Zap,
  Info,
} from 'lucide-react';

interface MarketState {
  fxRate: number | null;
  liveFx: boolean;
  currentPremium: number;
  temporalBand: 'peak' | 'standard' | 'off-peak';
  zescoReferenceRate: number | null;
  zescoTariffCode: string | null;
  zescoTariffBand: string | null;
  zescoTariffValidFrom: string | null;
  zescoTariffValidTo: string | null;
  lastPcuPriceKz: number | null;
  lastPcuWindowAt: string | null;
  timestamp: string;
}

export function TruthHeader() {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [error, setError] = useState(false);
  const [localTime, setLocalTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setLocalTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const base = (
          import.meta.env.VITE_API_URL ||
          'https://enerlectra-backend.onrender.com'
        ).replace(/\/api$/, '');
        const res = await fetch(`${base}/api/protocol/market-state`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();

        setMarket({
          fxRate: data.fxRate ?? null,
          liveFx: !!data.liveFx,
          currentPremium: data.currentPremium ?? 1.0,
          temporalBand: data.temporalBand ?? 'standard',
          zescoReferenceRate: data.zescoReferenceRate ?? null,
          zescoTariffCode: data.zescoTariffCode ?? null,
          zescoTariffBand: data.zescoTariffBand ?? null,
          zescoTariffValidFrom: data.zescoTariffValidFrom ?? null,
          zescoTariffValidTo: data.zescoTariffValidTo ?? null,
          lastPcuPriceKz: data.lastPcuPriceKz ?? null,
          lastPcuWindowAt: data.lastPcuWindowAt ?? null,
          timestamp: data.timestamp,
        });
        setError(false);
      } catch {
        setError(true);
        setMarket((prev) => (prev ? { ...prev, liveFx: false } : null));
      }
    };

    fetchMarket();
    const interval = setInterval(fetchMarket, 60_000);
    return () => clearInterval(interval);
  }, []);

  const fxRate = market?.fxRate ?? null;
  const premium = market?.currentPremium ?? 1.0;
  const band = market?.temporalBand ?? 'standard';
  const liveFx = market?.liveFx ?? false;
  const zescoRate = market?.zescoReferenceRate ?? null;
  const lastPcuPrice = market?.lastPcuPriceKz ?? null;
  const lastPcuWindowAt = market?.lastPcuWindowAt ?? null;
  const lastUpdate = market?.timestamp ?? null;

  const bandLabel = {
    peak: 'Peak',
    standard: 'Standard',
    'off-peak': 'Off‑peak',
  }[band];

  const bandStyles = {
    peak: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    standard: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    'off-peak': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  }[band];

  const timeDisplay = localTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateDisplay = localTime.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="w-full bg-slate-950/90 border-b border-white/5 sticky top-0 z-[100] backdrop-blur-xl py-3 px-6">
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div
            className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${
              !error ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {!error ? (
              <Activity size={16} className="animate-pulse" />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{!error ? 'System Online' : 'Connection Lost'}</span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-white/60 text-xs border-l border-white/10 pl-6">
            <Clock size={14} />
            <span className="text-white/90 font-medium tabular-nums">
              {timeDisplay}
            </span>
            <span className="text-white/40">{dateDisplay}</span>
            <span
              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${bandStyles}`}
            >
              {bandLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 md:gap-10">
          {/* FX index */}
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1">
              <Globe size={12} /> FX Index (USD → ZMW)
            </span>
            <span className="text-sm font-bold text-white/80 tabular-nums">
              {fxRate !== null ? `${fxRate.toFixed(2)} ZMW` : '—'}
            </span>
            <span className="text-[9px] text-white/30">
              {liveFx ? 'Live feed' : 'Stale / unavailable'}
            </span>
          </div>

          {/* Time-of-day heuristic */}
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={12} /> Time‑of‑Day Premium
              <span className="group relative ml-1 cursor-help">
                <Info size={10} className="text-white/30" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Heuristic multiplier · Peak 18:00–22:00 · Off‑peak
                  22:00–06:00
                </div>
              </span>
            </span>
            <span
              className={`text-sm font-bold tabular-nums ${
                premium >= 1 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {premium > 1 ? '+' : ''}
              {((premium - 1) * 100).toFixed(1)}%
            </span>
            <span className="text-[9px] text-white/30">heuristic only</span>
          </div>

          {/* True prices: ZESCO reference + last PCU settlement */}
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-5 py-2 rounded-xl">
            <div className="flex flex-col items-end mr-4">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">
                ZESCO Reference
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-white tabular-nums">
                  {zescoRate !== null ? `K${zescoRate.toFixed(2)}` : '—'}
                </span>
                <span className="text-[10px] text-white/40">per kWh</span>
              </div>
              <span className="text-[9px] text-white/30">
                from tariff_bands
              </span>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">
                Last PCU Settlement
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-white tabular-nums">
                  {lastPcuPrice !== null
                    ? `K${lastPcuPrice.toFixed(2)}`
                    : '—'}
                </span>
                <span className="text-[10px] text-white/40">per PCU</span>
              </div>
              <span className="text-[9px] text-white/30">
                {lastPcuWindowAt
                  ? `window ${new Date(lastPcuWindowAt).toLocaleTimeString(
                      'en-GB',
                      { hour: '2-digit', minute: '2-digit' }
                    )}`
                  : 'no settlements yet'}
              </span>
            </div>

            <Cpu size={20} className="text-white/40 ml-2" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-[10px] text-white/30 border-t border-white/5 pt-2 mt-2">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-amber-400/60" />
          <span>Energy unit: 1 kWh = 1 PCU</span>
        </div>
        <span className="opacity-30">|</span>
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !error ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span>{!error ? 'Connected' : 'Offline'}</span>
        </div>
        <span className="opacity-30">|</span>
        <span>
          Updated:{' '}
          {lastUpdate
            ? new Date(lastUpdate).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </span>
      </div>
    </div>
  );
}