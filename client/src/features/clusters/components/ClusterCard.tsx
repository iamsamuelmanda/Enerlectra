// src/features/clusters/components/ClusterCard.tsx
import { useNavigate } from 'react-router-dom';
import { usePCUTrend } from '@/hooks/usePCUTrend';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Zap, Battery, DollarSign, Users, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Cluster {
  id: string;
  name: string;
  location?: string;
  lifecycle_state: 'FUNDING' | 'ACTIVE' | 'COMPLETED' | 'SETTLED';
  target_kw: number;
  target_storage_kwh: number;
  target_usd: number;
  current_usd: number;
  monthly_kwh?: number;
  participant_count: number;
  created_at: string;
  deadline: string;
}

interface Props {
  cluster: Cluster;
}

export function ClusterCard({ cluster }: Props) {
  const navigate = useNavigate();
  const { data: trendData, loading: trendLoading } = usePCUTrend(cluster.id, 3); // small dataset for sparkline

  const fundingPct = Math.min(100, Math.round((cluster.current_usd / cluster.target_usd) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(cluster.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const statusColor = {
    FUNDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    ACTIVE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    COMPLETED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    SETTLED: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  }[cluster.lifecycle_state];

  return (
    <div
      onClick={() => navigate(`/clusters/${cluster.id}`)}
      className="glass card-hover group cursor-pointer overflow-hidden relative min-h-[420px] flex flex-col"
    >
      {/* Status accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${statusColor.split(' ')[0].replace('/20', '')}`} />

      <div className="p-6 flex flex-col flex-1 space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white group-hover:text-[var(--brand-primary)] transition-colors">
              {cluster.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-current" />
              {cluster.location || 'Unknown'}
            </p>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {cluster.lifecycle_state}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <Zap className="w-4 h-4" />
              Solar
            </div>
            <p className="text-xl font-bold">{cluster.target_kw} kW</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <Battery className="w-4 h-4" />
              Storage
            </div>
            <p className="text-xl font-bold">{cluster.target_storage_kwh} kWh</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <DollarSign className="w-4 h-4" />
              Goal
            </div>
            <p className="text-xl font-bold">${cluster.target_usd.toLocaleString()}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <Users className="w-4 h-4" />
              Members
            </div>
            <p className="text-xl font-bold">{cluster.participant_count}</p>
          </div>
        </div>

        {/* Sparkline – fixed dimensions */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
            <span>Funding Trend</span>
            <span className={fundingPct > 0 ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}>
              {fundingPct > 0 ? `↑ ${fundingPct}%` : '—'}
            </span>
          </div>

          <div className="w-full h-24 min-h-[96px] bg-gray-900/30 rounded-lg overflow-hidden">
            {trendLoading || trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                {trendLoading ? 'Loading...' : 'No data yet'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="var(--brand-primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Progress & CTA */}
        <div className="space-y-4 pt-3 border-t border-[var(--border-glass)] mt-auto">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Funded</span>
              <span className="font-medium">{fundingPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${fundingPct}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <Clock className="w-4 h-4" />
              {daysLeft > 0 ? `${daysLeft} days left` : 'Deadline passed'}
            </div>

            <button className="text-[var(--brand-primary)] hover:text-[var(--brand-secondary)] font-medium transition-colors flex items-center gap-1.5">
              View Details →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}