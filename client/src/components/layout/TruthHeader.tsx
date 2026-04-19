// src/components/layout/TruthHeader.tsx

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
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useMarketState } from '@/hooks/useMarketState';

const ZESCO_TARIFF_URL = 'https://www.erb.org.zm/tariffs';

export function TruthHeader() {
  const [localTime, setLocalTime] = useState(new Date());
  const [expanded, setExpanded] = useState(false);
  const { market, error, lastUpdatedAt } = useMarketState();

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setLocalTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Derived values
  const fxRate = market?.fxRate ?? null;
  const premium = market?.currentPremium ?? 1.0;
  const bandKey = market?.temporalBand ?? 'standard';
  const liveFx = market?.liveFx ?? false;
  const zescoRate = market?.zescoReferenceRate ?? null;
  const lastPcuPrice = market?.lastPcuPriceKz ?? null;
  const lastPcuWindowAt = market?.lastPcuWindowAt ?? null;

  const bandConfig =
    {
      peak: {
        label: 'Peak hours',
        explanation: 'Busy evening time: more people using power, higher pressure on price.',
      },
      standard: {
        label: 'Normal hours',
        explanation: 'Daytime hours: demand is steady, prices near normal.',
      },
      'off-peak': {
        label: 'Off‑peak hours',
        explanation: 'Night and quiet times: fewer users, prices can be softer.',
      },
    }[bandKey] ?? {
      label: 'Normal hours',
      explanation: 'Daytime hours: demand is steady, prices near normal.',
    };

  const timeDisplay = localTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const premiumDelta = (premium - 1) * 100;
  const premiumPct = Math.abs(premiumDelta).toFixed(1);
  const premiumSign =
    premiumDelta > 0 ? '+' : premiumDelta < 0 ? '−' : '';
  const premiumColor =
    premiumDelta >= 0 ? 'text-rose-400' : 'text-emerald-400';

  const lastPcuTimeLabel = lastPcuWindowAt
    ? new Date(lastPcuWindowAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const oracleTimeLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <header className="w-full sticky top-0 z-[45]">
      {/* Background / border kept subtle to avoid competing with main Header */}
      <div className="absolute inset-0 bg-[#0d0d1a]/92 backdrop-blur-xl border-b border-white/[0.05]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#667eea]/40 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-6">
        {/* ── COMPACT BAR ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 pb-1.5">
          {/* Left: status + time */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Status pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-[0.14em] transition-all ${
                !error
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/25'
              }`}
            >
              {!error ? (
                <Activity size={11} className="animate-pulse" />
              ) : (
                <AlertCircle size={11} />
              )}
              <span className="truncate">
                {!error ? 'Enerlectra online' : 'Connection offline'}
              </span>
            </div>

            {/* Time (small) */}
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/60 font-mono">
              <Clock size={11} className="text-white/35" />
              <span className="tabular-nums">{timeDisplay}</span>
            </div>
          </div>

          {/* Right: key chips + toggle */}
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 flex-1">
            {/* FX chip */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[10px] text-white/80">
              <Globe size={11} className="text-white/55" />
              <span className="uppercase tracking-[0.16em] text-[9px] text-white/45">
                USD→ZMW
              </span>
              <span className="font-mono tabular-nums">
                {fxRate !== null ? fxRate.toFixed(2) : '—'}
              </span>
              <span
                className={`ml-1 text-[9px] ${
                  liveFx ? 'text-emerald-400' : 'text-white/35'
                }`}
              >
                {liveFx ? 'live' : 'saved'}
              </span>
            </div>

            {/* ZESCO chip */}
            <a
              href={ZESCO_TARIFF_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View official ERB ZESCO tariff schedule"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[10px] text-white/80 hover:border-[#667eea]/50 hover:bg-[#667eea]/10 transition-colors"
            >
              <Zap size={11} className="text-amber-300/80" />
              <span className="uppercase tracking-[0.16em] text-[9px] text-white/45">
                ZESCO base
              </span>
              <span className="font-mono tabular-nums">
                {zescoRate !== null ? `K${zescoRate.toFixed(2)}` : '—'}
              </span>
              <ExternalLink size={10} className="text-white/25" />
            </a>

            {/* PCU chip */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[10px] text-white/80">
              <Cpu size={11} className="text-[#667eea]/80" />
              <span className="uppercase tracking-[0.16em] text-[9px] text-white/45">
                PCU
              </span>
              <span className="font-mono tabular-nums">
                {lastPcuPrice !== null ? `K${lastPcuPrice.toFixed(2)}` : '—'}
              </span>
              {lastPcuTimeLabel && (
                <span className="text-[9px] text-white/35">
                  {lastPcuTimeLabel}
                </span>
              )}
            </div>

            {/* Toggle */}
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.12] text-[10px] text-white/75 bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
            >
              <Info size={11} className="text-white/50" />
              <span className="hidden sm:inline">
                Why this price?
              </span>
              <span className="sm:hidden">Why?</span>
              <ChevronDown
                size={11}
                className={`transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Slim footer strip */}
        <div className="flex items-center justify-between gap-3 pb-1.5 border-t border-white/[0.04] pt-1">
          <div className="flex items-center gap-3 text-[9px] text-white/35 font-mono">
            <span className="flex items-center gap-1.5">
              <Zap size={9} className="text-amber-400/60" />
              1 kWh = 1 PCU
            </span>
            <span className="hidden xs:inline opacity-30">·</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !error
                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                    : 'bg-rose-500'
                }`}
              />
              {!error
                ? 'Ledger tracking live'
                : 'Ledger tracking paused'}
            </span>
          </div>

          <span className="text-[9px] text-white/25 font-mono tabular-nums">
            {oracleTimeLabel
              ? `oracle ${oracleTimeLabel}`
              : 'oracle starting…'}
          </span>
        </div>

        {/* ── EXPANDABLE PANEL ─────────────────────────────── */}
        {expanded && (
          <section className="mt-1.5 mb-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-[11px] text-white/75 leading-relaxed space-y-2.5">
            <div className="flex items-start gap-2">
              <Info size={12} className="mt-[2px] text-white/55" />
              <p>
                This strip explains what really shapes your power price:
                the dollar rate, the official ZESCO tariff, and the PCU
                trades on Enerlectra. When these move, the cost of your
                energy moves too.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-2.5">
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45 font-semibold mb-1">
                  <Globe size={11} />
                  Dollar → Kwacha
                </div>
                <p>
                  This is how many Kwacha you need for 1 US dollar. When
                  the dollar gets stronger, importing fuel and power
                  becomes more expensive, and that pressure reaches your
                  tariff.
                </p>
              </div>

              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45 font-semibold mb-1">
                  <TrendingUp size={11} />
                  Time of day
                </div>
                <p className={premiumColor}>
                  {premiumSign}
                  {premiumPct}% · {bandConfig.label}
                </p>
                <p className="mt-0.5">
                  In busy hours many people use power at the same time. In
                  quiet hours fewer people are using it. Enerlectra adds a
                  small adjustment for this, so the price follows real
                  demand. {bandConfig.explanation}
                </p>
              </div>

              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/45 font-semibold mb-1">
                  <Cpu size={11} />
                  From tariff to PCU
                </div>
                <p>
                  ZESCO&apos;s base price comes from the regulator. Enerlectra
                  starts there, then blends in the FX rate and time of day
                  to get a fair PCU price. 1 PCU is 1 unit of energy, so
                  this number is the clearest picture of your real cost.
                </p>
                <a
                  href={ZESCO_TARIFF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#8fa2ff] hover:text-[#b1c2ff]"
                >
                  <ExternalLink size={10} />
                  See official ZESCO tariff (ERB)
                </a>
              </div>
            </div>
          </section>
        )}
      </div>
    </header>
  );
}