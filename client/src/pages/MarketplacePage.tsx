/**
 * Marketplace Page
 * Main page combining all marketplace components
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Cluster } from '../services/supabase';
import ExchangeRateDisplay from '../components/marketplace/ExchangeRateDisplay';
import ClusterList from '../components/marketplace/ClusterList';
import ContributionForm from '../components/marketplace/ContributionForm';
import OwnershipTable from '../components/marketplace/OwnershipTable';
import UserPortfolio from '../components/marketplace/UserPortfolio';
import SupabaseAuth from '../components/auth/SupabaseAuth';

export default function MarketplacePage() {
  const { user } = useAuth();
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleContributionSuccess = () => {
    // Trigger refresh of ownership table
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center">
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                  Enerlectra
                </h1>
                <p className="text-gray-600 font-medium">Fair Energy Ownership Platform</p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <ExchangeRateDisplay />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
                </svg>
                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Demo Banner */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <p className="text-sm text-blue-900">
              <strong>Demo Mode:</strong> All contributions are reversible. If this doesn't feel fair, we stop.
            </p>
          </div>
        </div>

        {/* Auth Section */}
        <SupabaseAuth />

        {/* User Portfolio */}
        <UserPortfolio user={user} />

        {/* Energy Communities */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <svg className="w-7 h-7 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
            </svg>
            Energy Communities
          </h2>
          <ClusterList onSelectCluster={setSelectedCluster} />
        </div>

        {/* Contribution Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <ContributionForm
            user={user}
            cluster={selectedCluster}
            onContributionSuccess={handleContributionSuccess}
          />
        </div>

        {/* Ownership Table */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <OwnershipTable
            key={refreshTrigger}
            clusterId={selectedCluster?.id || null}
            clusterName={selectedCluster?.name}
          />
        </div>

        {/* Footer */}
        <div className="text-center text-white py-8">
          <p className="font-semibold text-lg">Enerlectra • Fair Energy Ownership Platform</p>
          <p className="text-purple-200 text-sm mt-2">
            If this doesn't feel fair, this pilot stops.
          </p>
        </div>
      </div>
    </div>
  );
}