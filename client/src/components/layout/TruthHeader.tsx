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
    <div className="w-full sticky top-0 z-[100] border-b border-white/10 bg-slate-950/85 backdrop-blur-2xl py-5 px-4 md:px-8 shadow-header-soft">
      <div className="max-w-[1440px] mx-auto rounded-4xl border border-white/10 bg-header-gradient px-4 md:px-6 py-4 md:py-5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-start">
          <div
            className={`flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wide ${
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

          <div className="hidden md:flex items-center gap-3 text-white/70 text-xs border-l border-white/15 pl-6">
            <Clock size={14} />
            <span className="text-white/90 font-medium tabular-nums">
              {timeDisplay}
            </span>
            <span className="text-white/60">{dateDisplay}</span>
            <span
              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${bandStyles}`}
            >
              {bandLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-7 w-full md:w-auto">
          {/* FX index */}
          <div className="hidden sm:flex flex-col items-end min-w-[170px]">
            <span className="text-[11px] text-white/60 uppercase tracking-wider flex items-center gap-1">
              <Globe size={12} /> Exchange Rate (USD → ZMW)
            </span>
            <span className="text-base font-bold text-white/90 tabular-nums">
              {fxRate !== null ? `${fxRate.toFixed(2)} ZMW` : '—'}
            </span>
            <span className="text-[10px] text-white/50">
              {liveFx ? 'Live feed' : 'Stale / unavailable'}
            </span>
          </div>

          {/* Time-of-day heuristic */}
          <div className="hidden sm:flex flex-col items-end min-w-[170px]">
            <span className="text-[11px] text-white/60 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={12} /> Time‑based Rate
              <span className="group relative ml-1 cursor-help">
                <Info size={10} className="text-white/50" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Time-based multiplier · Peak 18:00–22:00 · Off‑peak
                  22:00–06:00
                </div>
              </span>
            </span>
            <span
              className={`text-base font-bold tabular-nums ${
                premium >= 1 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {premium > 1 ? '+' : ''}
              {((premium - 1) * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] text-white/50">estimated guide</span>
          </div>

          {/* True prices: ZESCO reference + last PCU settlement */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white/8 border border-white/15 px-4 sm:px-6 md:px-7 py-3.5 rounded-2xl min-w-fit shadow-card">
            <div className="flex flex-col items-start sm:items-end sm:mr-4">
              <span className="text-[11px] text-white/60 uppercase tracking-wider">
                Utility Price Guide
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {zescoRate !== null ? `K${zescoRate.toFixed(2)}` : '—'}
                </span>
                <span className="text-[11px] text-white/50">per kWh</span>
              </div>
              <span className="text-[10px] text-white/50">
                based on current tariff data
              </span>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[11px] text-white/60 uppercase tracking-wider">
                Last Community Payout Rate
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {lastPcuPrice !== null
                    ? `K${lastPcuPrice.toFixed(2)}`
                    : '—'}
                </span>
                <span className="text-[11px] text-white/50">per unit</span>
              </div>
              <span className="text-[10px] text-white/50">
                {lastPcuWindowAt
                  ? `window ${new Date(lastPcuWindowAt).toLocaleTimeString(
                      'en-GB',
                      { hour: '2-digit', minute: '2-digit' }
                    )}`
                  : 'no payout history yet'}
              </span>
            </div>

            <Cpu size={22} className="hidden sm:block text-white/50 ml-2" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 text-[11px] text-white/60 border-t border-white/10 pt-4 mt-4">
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
    </div>
  );
}