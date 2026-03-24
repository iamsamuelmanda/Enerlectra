import { useEffect, useState } from 'react';
import { Target, Calendar, Trophy, CheckCircle, Circle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { Cluster } from '../../../types/api';
import { daysRemaining, isDeadlinePassed, formatDate } from '../../../utils/dateTime';

interface CampaignProgressProps {
  cluster: Cluster;
}

const MILESTONES = [
  { threshold: 40,  label: 'Feasibility & supplier quotes' },
  { threshold: 70,  label: 'Solar panel procurement'       },
  { threshold: 100, label: 'Battery expansion'             },
];

export function CampaignProgress({ cluster }: CampaignProgressProps) {
  const [currentUSD, setCurrentUSD] = useState<number>(cluster.current_usd ?? 0);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    if (!cluster.deadline) return;

    const update = () => {
      const days = daysRemaining(cluster.deadline!);
      const passed = isDeadlinePassed(cluster.deadline!);
      setDeadlinePassed(passed);
      setTimeRemaining(
        passed ? 'Deadline passed' :
        days === 0 ? 'Today' :
        `${days} day${days !== 1 ? 's' : ''} left`
      );
    };

    update();
    const timer = setInterval(update, 60_000);

    const sub = supabase
      .channel(`cluster-${cluster.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clusters', filter: `id=eq.${cluster.id}` },
        (payload) => setCurrentUSD(payload.new.current_usd ?? 0)
      )
      .subscribe();

    return () => { sub.unsubscribe(); clearInterval(timer); };
  }, [cluster.id, cluster.deadline]);

  if (!cluster.target_usd || !cluster.deadline) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target size={16} style={{ color: '#a78bfa' }} />
          <span className="font-display font-semibold text-sm" style={{ color: '#f0f0ff' }}>Campaign Progress</span>
        </div>
        <p className="text-sm" style={{ color: 'rgba(240,240,255,0.35)' }}>
          Campaign data not yet available for this cluster.
        </p>
      </div>
    );
  }

  const pct = Math.min((currentUSD / cluster.target_usd) * 100, 100);

  return (
    <div
      className="rounded-2xl p-5 space-y-5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(102,126,234,0.15)' }}
          >
            <Target size={14} style={{ color: '#a78bfa' }} />
          </div>
          <span className="font-display font-semibold text-sm" style={{ color: '#f0f0ff' }}>
            Campaign Progress
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: 'rgba(240,240,255,0.4)' }}>Deadline</p>
          <p className="text-xs font-semibold" style={{ color: '#f0f0ff' }}>
            {formatDate(cluster.deadline, 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-semibold" style={{ color: '#f0f0ff' }}>
            ${currentUSD.toLocaleString()}
          </span>
          <span style={{ color: 'rgba(240,240,255,0.45)' }}>
            of ${cluster.target_usd.toLocaleString()}
          </span>
        </div>
        <div className="progress-track" style={{ height: '8px' }}>
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: pct >= 100
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : 'linear-gradient(90deg, #667eea, #764ba2)',
              boxShadow: pct >= 100
                ? '0 0 10px rgba(16,185,129,0.5)'
                : '0 0 10px rgba(102,126,234,0.5)',
            }}
          />
        </div>
        <div className="flex justify-between">
          <span
            className="text-xs font-bold"
            style={{ color: pct >= 100 ? '#34d399' : '#a78bfa' }}
          >
            {pct.toFixed(1)}% funded
          </span>
          <div className="flex items-center gap-1.5">
            <Calendar size={11} style={{ color: 'rgba(240,240,255,0.35)' }} />
            <span
              className="text-xs font-semibold"
              style={{ color: deadlinePassed ? '#f87171' : '#34d399' }}
            >
              {timeRemaining}
            </span>
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div
        className="space-y-2 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={13} style={{ color: '#fbbf24' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,255,0.4)' }}>
            Milestones
          </span>
        </div>
        {MILESTONES.map(m => {
          const reached = pct >= m.threshold;
          return (
            <div key={m.threshold} className="flex items-center gap-2.5">
              {reached
                ? <CheckCircle size={14} style={{ color: '#34d399', flexShrink: 0 }} />
                : <Circle size={14} style={{ color: 'rgba(240,240,255,0.2)', flexShrink: 0 }} />
              }
              <span
                className="text-xs flex-1"
                style={{ color: reached ? 'rgba(240,240,255,0.8)' : 'rgba(240,240,255,0.4)' }}
              >
                {m.label}
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background: reached ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                  color: reached ? '#34d399' : 'rgba(240,240,255,0.3)',
                }}
              >
                {m.threshold}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
