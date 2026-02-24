/**
 * Ownership Table Component
 * Displays cluster participants and their ownership
 */

import { useState, useEffect } from 'react';
import { marketplaceApi, ClusterParticipant } from '../../services/marketplaceApi';
import { useExchangeRate } from '../../hooks/useExchangeRate';

interface OwnershipTableProps {
  clusterId: string | null;
  clusterName?: string;
}

export default function OwnershipTable({ clusterId, clusterName }: OwnershipTableProps) {
  const { convertToZMW } = useExchangeRate();
  const [participants, setParticipants] = useState<ClusterParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clusterId) {
      loadParticipants();
    } else {
      setParticipants([]);
    }
  }, [clusterId]);

  const loadParticipants = async () => {
    if (!clusterId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await marketplaceApi.getClusterParticipants(clusterId);
      setParticipants(data);
    } catch (err) {
      console.error('Failed to load participants:', err);
      setError('Failed to load ownership data');
    } finally {
      setLoading(false);
    }
  };

  if (!clusterId) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p className="text-gray-600 font-medium">Select a community to view ownership</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-xl p-12 text-center">
        <svg className="w-12 h-12 mx-auto animate-spin text-purple-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="mt-4 text-gray-600">Loading ownership data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <p className="text-red-800 font-semibold">{error}</p>
        <button
          onClick={loadParticipants}
          className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
        <p className="text-gray-600 font-medium">No contributors yet</p>
        <p className="text-sm text-gray-500 mt-1">Be the first to contribute to {clusterName || 'this community'}!</p>
      </div>
    );
  }

  const totalPCUs = participants.reduce((sum, p) => sum + p.pcus, 0);
  const totalUSD = totalPCUs / 100;

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 px-6 py-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
          Ownership Breakdown
        </h3>
        {clusterName && (
          <p className="text-purple-100 text-sm mt-1">{clusterName}</p>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b-2 border-gray-200">
        <div className="text-center">
          <p className="text-xs uppercase text-gray-600 font-medium">Participants</p>
          <p className="text-2xl font-bold text-gray-900">{participants.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase text-gray-600 font-medium">Total PCUs</p>
          <p className="text-2xl font-bold text-purple-600">{totalPCUs.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase text-gray-600 font-medium">Total Value</p>
          <p className="text-2xl font-bold text-gray-900">${totalUSD.toFixed(2)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100 border-b-2 border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Contributor
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Contributions
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                PCUs
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Value (USD)
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Value (ZMW)
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Ownership %
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                kWh/month
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {participants.map((participant, index) => {
              const usdValue = participant.pcus / 100;
              const zmwValue = convertToZMW(usdValue);
              
              return (
                <tr
                  key={participant.userId}
                  className="hover:bg-purple-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                      index === 0 ? 'bg-yellow-100 text-yellow-800' :
                      index === 1 ? 'bg-gray-200 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-semibold text-gray-900">{participant.userName}</p>
                      <p className="text-xs text-gray-500">
                        Since {new Date(participant.firstContributionAt).toLocaleDateString()}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {participant.contributionCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm font-semibold text-purple-600">
                      {participant.pcus.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      ${usdValue.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm text-gray-700">
                      K{zmwValue.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-700"
                          style={{ width: `${Math.min(participant.ownershipPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-purple-700">
                        {participant.ownershipPct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm font-medium text-green-600">
                      {participant.kwhPerMonth.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}