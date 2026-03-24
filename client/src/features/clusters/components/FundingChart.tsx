import { usePCUTrend } from '@/hooks/usePCUTrend';
import { Area, AreaChart, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Activity, TrendingUp } from 'lucide-react';

export function FundingChart({ clusterId }: { clusterId: string }) {
  const { data } = usePCUTrend(clusterId, 6);

  return (
    <Card variant="glass" padding="lg" className="h-full min-h-[400px]">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Activity className="text-brand-primary" size={20} /> Capital Trajectory
          </h3>
          <p className="text-xs text-muted tracking-wide">Funding accumulation over 6 months</p>
        </div>
        {data.length > 0 && (
          <div className="text-right">
            <span className="text-2xl font-display font-black text-emerald-400"><TrendingUp size={20} /></span>
            <p className="text-[8px] text-muted uppercase font-bold tracking-widest">Live</p>
          </div>
        )}
      </div>

      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 rounded-2xl">
            <Activity size={28} className="text-white/20" />
            <p className="text-xs text-white/30 uppercase tracking-widest font-bold">Chart populates after first contribution</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: "#6b7280", fontSize: 10}} />
              <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} itemStyle={{ color: "#A855F7", fontWeight: "bold" }} />
              <Area type="monotone" dataKey="cumulative" stroke="#A855F7" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
