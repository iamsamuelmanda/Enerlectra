import { Link } from 'react-router-dom';
import { MapPin, Sun, Battery, DollarSign } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import type { Cluster } from '../../../types/api';
import { cn } from '../../../utils/cn';

interface ClusterCardProps {
  cluster: Cluster;
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
  FUNDING: 'bg-green-500/20 text-green-300 border border-green-500/30',
  FUNDED: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  OPERATIONAL: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  LOCKED: 'bg-red-500/20 text-red-300 border border-red-500/30',
  COMPLETED: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  active:   'bg-emerald-500/20 text-emerald-300',
  open:     'bg-sky-500/20 text-sky-300',
  pending:  'bg-yellow-500/20 text-yellow-300',
  inactive: 'bg-white/10 text-white/40',
  // add any lifecycle_state values here as you discover them
};

export function ClusterCard({ cluster }: ClusterCardProps) {
  const percentFunded = cluster.current_usd && cluster.target_usd
  ? (cluster.current_usd / cluster.target_usd) * 100
  : 0;

  return (
    <Card variant="glass" padding="md" className="hover:scale-105 transition-transform">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-semibold text-white">{cluster.name}</h3>
        <span className={cn(
  'px-3 py-1 rounded-full text-xs font-medium',
  statusColors[cluster.lifecycle_state ?? cluster.status] ?? statusColors[cluster.status]
)}>
  {cluster.lifecycle_state ?? cluster.status}
</span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-purple-200">
          <MapPin className="w-4 h-4 mr-2 text-purple-300" />
          <span>{cluster.location.district}, {cluster.location.province}</span>
        </div>
        <div className="flex items-center text-sm">
          <Sun className="w-4 h-4 mr-2 text-yellow-400" />
          <span className="text-white">{cluster.target_kW} kW solar</span>
        </div>
        <div className="flex items-center text-sm">
          <Battery className="w-4 h-4 mr-2 text-green-400" />
          <span className="text-white">{cluster.target_storage_kwh ?? '—'} kWh storage</span>
        </div>
        <div className="flex items-center text-sm">
          <DollarSign className="w-4 h-4 mr-2 text-emerald-400" />
          <span className="text-white">
  ${(cluster.current_usd ?? 0).toLocaleString()} / ${(cluster.target_usd ?? 0).toLocaleString()}
</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percentFunded, 100)}%` }}
          />
        </div>
        <p className="text-right text-xs mt-1 text-purple-300">
          {percentFunded.toFixed(1)}% funded
        </p>
      </div>

      <Link
        to={`/clusters/${cluster.clusterId}`}
        className="block w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-center transition-all"
      >
        View Details
      </Link>
    </Card>
  );
}