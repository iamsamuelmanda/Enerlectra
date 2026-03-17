import { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { contributionService } from '../../contributions/services/contributionService';
import { Card } from '../../../components/ui/Card';
import { Wallet, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export function EnergyWallet() {
  const { user } = useAuth();
  const [totalPCU, setTotalPCU] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const contributions = await contributionService.getUserContributions(user.id);
      const total = contributions.reduce((sum, c) => sum + (c.pcus || 0), 0);
      setTotalPCU(total);
    } catch (err: any) {
      setError('Failed to load wallet');
      toast.error('Could not load your energy wallet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, [user?.id]);

  if (!user) {
    return (
      <Card variant="glass" padding="md">
        <div className="flex items-center gap-3 text-purple-300">
          <AlertCircle className="w-5 h-5" />
          <p>Please sign in to view your energy wallet</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" padding="md" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-900/30 rounded-lg">
            <Wallet className="w-6 h-6 text-purple-400" />
          </div>
          <h3 className="text-xl font-semibold text-white">Energy Wallet</h3>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1 bg-purple-900/40 text-purple-300 rounded-full border border-purple-700/30">
            Beta
          </span>
          <button
            onClick={loadWallet}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            title="Refresh wallet"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-emerald-400' : 'text-gray-400'}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-10 bg-gray-800/50 rounded animate-pulse"></div>
          <div className="h-6 bg-gray-800/50 rounded w-2/3 animate-pulse"></div>
        </div>
      ) : error ? (
        <div className="p-5 bg-red-900/20 rounded-lg border border-red-800/30 text-red-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            {error}
            <button
              onClick={loadWallet}
              className="ml-2 text-red-300 hover:text-red-200 underline text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-sm text-gray-400">Total PCUs</p>
            <p className="text-3xl md:text-4xl font-bold text-white">
              {totalPCU !== null ? totalPCU.toLocaleString() : '—'}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-gray-400">Energy Credits</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              <p className="text-xl md:text-2xl text-emerald-400 font-medium">Coming soon</p>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-gray-800 text-sm text-gray-500">
        Your PCUs represent ownership in energy communities. Real energy credits from surplus generation will appear here after settlement runs.
      </div>
    </Card>
  );
}