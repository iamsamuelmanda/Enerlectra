import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../../../components/ui/Card';
import { TrendingUp } from 'lucide-react';

interface FundingChartProps {
  clusterId: string;
}

// This would normally fetch historical data from your API
const mockData = [
  { date: 'Mar 1', amount: 100 },
  { date: 'Mar 5', amount: 250 },
  { date: 'Mar 10', amount: 400 },
  { date: 'Mar 13', amount: 520 },
];

export function FundingChart({ clusterId: _clusterId }: FundingChartProps) {
  return (
    <Card variant="glass" padding="md">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold">Funding Progress</h3>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={mockData}>
          <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
            labelStyle={{ color: '#fff' }}
          />
          <Line type="monotone" dataKey="amount" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}