import { usePCUTrend } from '@/hooks/usePCUTrend';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card } from '@/components/ui/Card';
import { TrendingUp, Activity } from 'lucide-react';

export function FundingChart({ clusterId }: { clusterId: string }) {
  const { data, loading } = usePCUTrend(clusterId, 6);

  return (
    <Card variant="glass" padding="lg" className="h-full min-h-[400px]">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Activity className="text-brand-primary" size={20} /> Capital Trajectory
          </h3>
          <p className="text-xs text-muted tracking-wide">On-chain funding accumulation over 6 months</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-display font-black text-emerald-400">+14.2%</span>
          <p className="text-[8px] text-muted uppercase font-bold tracking-widest">Growth</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              hide={false} 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#6b7280', fontSize: 10}} 
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              itemStyle={{ color: '#A855F7', fontWeight: 'bold' }}
            />
            <Area 
              type="monotone" 
              dataKey="cumulative" 
              stroke="#A855F7" 
              strokeWidth={4} 
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
