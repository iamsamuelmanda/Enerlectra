/**
 * User Portfolio Component
 * Displays user's total contributions across all clusters
 */

import { useState, useEffect } from 'react';
import { marketplaceApi, Contribution } from '../../services/marketplaceApi';
import { useExchangeRate } from '../../hooks/useExchangeRate';
import type { User } from '@supabase/supabase-js';

interface UserPortfolioProps {
  user: User | null;
}

export default function UserPortfolio({ user }: UserPortfolioProps) {
  const { convertToZMW } = useExchangeRate();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadContributions();
    } else {
      setContributions([]);
    }
  }, [user]);

  const loadContributions = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await marketplaceApi.getUserContributions(user.id);
      setContributions(data);
    } catch (error) {
      console.error('Failed to load contributions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <svg className="w-12 h-12 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
          <div>
            <h3 className="text-xl font-bold text-purple-900">Sign in to view your portfolio</h3>
            <p className="text-sm text-purple-700">Track your contributions and ownership across communities</p>
          </div>
        </div>
      </div>
    );
  }

  const totalContributions = contributions.length;
  const totalPCUs = contributions.reduce((sum, c) => sum + c.pcus, 0);
  const totalUSD = totalPCUs / 100;
  const totalZMW = convertToZMW(totalUSD);
  const uniqueClusters = new Set(contributions.map(c => c.clusterId)).size;

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
          Your Portfolio
        </h3>
        <span className="text-sm text-gray-600">
          {user.email?.split('@')[0]}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="w-8 h-8 animate-spin text-purple-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border-2 border-gray-200 rounded-lg p-4 text-center">
            <p className="text-xs uppercase text-gray-600 font-medium mb-1">Contributions</p>
            <p className="text-3xl font-bold text-purple-600">{totalContributions}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-lg p-4 text-center">
            <p className="text-xs uppercase text-gray-600 font-medium mb-1">Total PCUs</p>
            <p className="text-3xl font-bold text-gray-900">{totalPCUs.toLocaleString()}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-lg p-4 text-center">
            <p className="text-xs uppercase text-gray-600 font-medium mb-1">Investment</p>
            <p className="text-2xl font-bold text-gray-900">${totalUSD.toFixed(2)}</p>
            <p className="text-xs text-gray-500">K{totalZMW.toFixed(0)}</p>
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-lg p-4 text-center">
            <p className="text-xs uppercase text-gray-600 font-medium mb-1">Communities</p>
            <p className="text-3xl font-bold text-green-600">{uniqueClusters}</p>
          </div>
        </div>
      )}
    </div>
  );
}