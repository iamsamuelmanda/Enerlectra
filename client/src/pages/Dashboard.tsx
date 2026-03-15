import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ClusterList } from '../features/clusters/components/ClusterList';
import { ExchangeRateDisplay } from '../components/ui/ExchangeRateDisplay';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Building2, DollarSign, Zap } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalClusters: 0,
    totalUSD: 0,
    totalPCUs: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { count: clusterCount } = await supabase
          .from('clusters')
          .select('*', { count: 'exact', head: true });

        const { data: contributions } = await supabase
          .from('contributions')
          .select('amount_usd, pcus')
          .eq('status', 'COMPLETED');

        const totalUSD = contributions?.reduce((sum, c) => sum + c.amount_usd, 0) || 0;
        const totalPCUs = contributions?.reduce((sum, c) => sum + c.pcus, 0) || 0;

        setStats({
          totalClusters: clusterCount || 0,
          totalUSD,
          totalPCUs,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      label: 'Total Communities',
      value: stats.totalClusters,
      icon: Building2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Total USD Contributed',
      value: `$${stats.totalUSD.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Total PCUs Issued',
      value: stats.totalPCUs.toLocaleString(),
      icon: Zap,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          The Energy Internet
        </h1>
        <p className="text-purple-200 text-lg">
          Democratizing energy access through community-owned solar infrastructure.
        </p>
      </div>

      <div className="mb-8">
        <ExchangeRateDisplay />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {loading
          ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)
          : statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} variant="glass" padding="md" className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-sm mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </Card>
              );
            })}
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-4">Active Communities</h2>
        <ClusterList />
      </div>
    </div>
  );
}