/**
 * Cluster List Component
 * Displays all available energy clusters
 */

import { useState, useEffect } from 'react';
import { clusterHelpers, Cluster } from '../../services/supabase';
import ClusterCard from './ClusterCard';

interface ClusterListProps {
  onSelectCluster: (cluster: Cluster | null) => void;
}

export default function ClusterList({ onSelectCluster }: ClusterListProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clusterHelpers.getClusters();
      setClusters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters');
      console.error('Failed to load clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (cluster: Cluster) => {
    setSelectedId(cluster.id);
    onSelectCluster(cluster);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 mx-auto animate-spin text-purple-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="mt-4 text-gray-600">Loading communities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <div>
            <p className="font-semibold text-red-800">Failed to load communities</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
        <button
          onClick={loadClusters}
          className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <svg className="w-16 h-16 mx-auto text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="mt-4 text-gray-600">No communities available yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {clusters.map((cluster) => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          selected={selectedId === cluster.id}
          onSelect={() => handleSelect(cluster)}
        />
      ))}
    </div>
  );
}