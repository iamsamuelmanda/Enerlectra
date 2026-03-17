// src/features/clusters/components/FundingChart.tsx
import { usePCUTrend } from '@/hooks/usePCUTrend';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/Card';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface FundingChartProps {
  clusterId: string;
}

export function FundingChart({ clusterId }: FundingChartProps) {
  const { data, loading, error } = usePCUTrend(clusterId, 6); // last 6 months

  if (loading) {
    return (
      <Card variant="glass" padding="md" className="min-h-[280px]">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-purple-400 animate-pulse" />
          <h3 className="text-lg font-semibold text-white">Funding Progress</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-purple-300">Loading chart data...</div>
        </div>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card variant="glass" padding="md" className="min-h-[280px]">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Funding Progress</h3>
        </div>
        <div className="h-64 flex flex-col items-center justify-center text-center text-purple-300">
          <AlertCircle className="w-10 h-10 mb-3 opacity-70" />
          <p className="text-sm">
            {error ? 'Failed to load funding data' : 'No funding history yet'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" padding="md" className="overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Funding Progress</h3>
        </div>
        <span className="text-xs text-purple-300">
          Last {data.length} months
        </span>
      </div>

      <div className="w-full h-64 min-h-[256px] md:h-80 md:min-h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis
              dataKey="date"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#e5e7eb',
                padding: '12px',
              }}
              labelStyle={{ color: '#fff', fontWeight: 600 }}
              itemStyle={{ color: '#a78bfa' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Cumulative']}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#a78bfa"
              strokeWidth={2.5}
              dot={{ stroke: '#a78bfa', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 8, stroke: '#a78bfa', strokeWidth: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}