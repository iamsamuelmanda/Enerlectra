// src/features/grid/components/GlobalTransactionLedger.tsx
//
// Real-time feed of meter readings from Supabase.
// Subscribes to INSERT events on meter_readings via Realtime.
// Shows the 20 most recent readings, newest first.

import { useEffect, useState, useRef } from 'react';
import { supabase, MeterReading } from '@/lib/supabase';
import { Activity, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

// ── Meter type labels ────────────────────────────────────────────────────────
const METER_LABELS: Record<string, { label: string; color: string }> = {
  grid_import:      { label: 'Grid',         color: 'text-sky-400'     },
  grid:             { label: 'Grid',         color: 'text-sky-400'     },
  solar_export:     { label: 'Solar Export', color: 'text-emerald-400' },
  solar_generation: { label: 'Solar',        color: 'text-emerald-400' },
  solar:            { label: 'Solar',        color: 'text-emerald-400' },
  unit_submeter:    { label: 'Unit',         color: 'text-amber-400'   },
  unit:             { label: 'Unit',         color: 'text-amber-400'   },
  generator:        { label: 'Generator',    color: 'text-orange-400'  },
  unknown:          { label: 'Meter',        color: 'text-gray-400'    },
};

function getMeterMeta(type: string) {
  return METER_LABELS[type] ?? { label: type, color: 'text-gray-400' };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-ZM', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatKwh(kwh: number): string {
  return kwh.toFixed(2);
}

// Short cluster ID display
function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8).toUpperCase() : id.toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────────
export function GlobalTransactionLedger() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading]   = useState(true);
  const [newIds, setNewIds]     = useState<Set<string>>(new Set());
  const channelRef              = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch — last 20 readings
  useEffect(() => {
    async function fetchInitial() {
      const { data, error } = await supabase
        .from('meter_readings')
        .select('id, cluster_id, unit_id, user_id, reading_kwh, meter_type, captured_at, reporting_period, source, validated, ocr_confidence, photo_url')
        .order('captured_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setReadings(data as MeterReading[]);
      }
      setLoading(false);
    }
    fetchInitial();
  }, []);

  // Realtime subscription — INSERT events
  useEffect(() => {
    const channel = supabase
      .channel('meter_readings_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meter_readings' },
        (payload) => {
          const newReading = payload.new as MeterReading;

          setReadings(prev => [newReading, ...prev].slice(0, 20));

          // Flash animation for new entry
          setNewIds(ids => new Set(ids).add(newReading.id));
          setTimeout(() => {
            setNewIds(ids => {
              const next = new Set(ids);
              next.delete(newReading.id);
              return next;
            });
          }, 2000);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-brand-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Live Ledger
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-brand-primary">
            {readings.length} entries
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 pr-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Zap size={16} className="text-brand-primary animate-pulse" />
            <span className="ml-2 text-[10px] text-white/40 uppercase tracking-widest">Syncing...</span>
          </div>
        )}

        {!loading && readings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Zap size={24} className="text-white/20" />
            <p className="text-[10px] text-white/30 uppercase tracking-widest text-center">
              No readings yet.<br />Send a meter photo to Ellie.
            </p>
            <a
              href="https://t.me/Enerlectrabot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-primary underline underline-offset-2 hover:text-brand-primary/80"
            >
              Open @Enerlectrabot
            </a>
          </div>
        )}

        {readings.map((r) => {
          const meta = getMeterMeta(r.meter_type);
          const isNew = newIds.has(r.id);

          return (
            <div
              key={r.id}
              className={cn(
                'group relative p-3 rounded-xl border transition-all duration-500',
                isNew
                  ? 'border-brand-primary/50 bg-brand-primary/10 scale-[1.01]'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
              )}
            >
              {/* New badge */}
              {isNew && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-brand-primary rounded text-[8px] font-black uppercase tracking-widest text-black">
                  New
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                {/* Left */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[9px] font-black uppercase tracking-widest', meta.color)}>
                      {meta.label}
                    </span>
                    {r.validated && (
                      <span className="text-[8px] text-emerald-400/60 font-mono">✓ verified</span>
                    )}
                  </div>
                  <p className="text-xl font-display font-black text-white leading-none">
                    {formatKwh(r.reading_kwh)}
                    <span className="text-xs text-white/30 font-normal ml-1">kWh</span>
                  </p>
                  <p className="text-[9px] text-white/30 font-mono truncate">
                    {shortId(r.cluster_id)} · {r.unit_id}
                  </p>
                </div>

                {/* Right */}
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-[9px] font-mono text-white/30">
                    {r.captured_at ? formatTime(r.captured_at) : '—'}
                  </p>
                  <p className="text-[8px] text-white/20 uppercase tracking-widest">{r.source}</p>
                  {r.ocr_confidence !== null && (
                    <p className="text-[8px] font-mono text-white/20">
                      {(r.ocr_confidence * 100).toFixed(0)}% conf
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}