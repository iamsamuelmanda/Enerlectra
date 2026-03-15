import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { clusterService } from '../features/clusters/services/clusterService';
import { Cluster } from '../types/api';
import { ContributionForm } from '../features/contributions/components/ContributionForm';
import { ContributionHistory } from '../features/contributions/components/ContributionHistory';
import { CampaignProgress } from '../features/campaign/components/CampaignProgress';
import { FundingChart } from '../features/clusters/components/FundingChart';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { MapPin, Sun, Battery, DollarSign, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ClusterView() {
  const { id } = useParams<{ id: string }>();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadCluster() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await clusterService.getById(id);
        setCluster(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load cluster');
      } finally {
        setLoading(false);
      }
    }
    loadCluster();
  }, [id, refreshKey]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-48" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !cluster) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-red-400 mb-4">Error: {error || 'Cluster not found'}</p>
          <Link to="/" className="text-purple-300 hover:text-white underline">
            Return to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-2 text-purple-300 hover:text-white mb-6 transition">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Communities</span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">{cluster.name}</h1>
        <div className="flex items-center gap-2 mt-2 text-purple-200">
          <MapPin className="w-4 h-4" />
          <span>{cluster.location.district}, {cluster.location.province}</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <CampaignProgress cluster={cluster} />
          <FundingChart clusterId={cluster.clusterId} />
          <ContributionForm
            clusterId={cluster.clusterId}
            onSuccess={() => setRefreshKey(prev => prev + 1)}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card variant="glass" padding="md">
            <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-purple-200">Solar target</span>
                </div>
                <span className="font-medium">{cluster.target_kW} kW</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Battery className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-purple-200">Storage target</span>
                </div>
                <span className="font-medium">—</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-purple-200">Monthly generation</span>
                </div>
                <span className="font-medium">{cluster.monthly_kwh ?? '—'} kWh</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-purple-200">Participants</span>
                <span className="font-medium">{cluster.participant_count}</span>
              </div>
            </div>
          </Card>

          <ContributionHistory clusterId={cluster.clusterId} />
        </div>
      </div>
    </div>
  );
}