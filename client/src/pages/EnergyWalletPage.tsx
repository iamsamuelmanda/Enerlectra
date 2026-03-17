import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useClusters } from '@/features/clusters/hooks/useClusters';
import { RealtimeChannel } from '@supabase/supabase-js';
import { initiateContributionPayment } from '@/features/contributions/services/contributionService';

interface Cluster {
  id: string;
  name: string;
}

interface EnergyWallet {
  id: string;
  user_id: string;
  cluster_id: string;
  energy_credit_kwh: number;
  energy_debt_kwh: number;
  updated_at: string;
  clusters?: { name: string } | null;
}

export default function EnergyWalletPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { clusters: availableClusters, loading: clustersLoading } = useClusters();

  const [wallets, setWallets] = useState<EnergyWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deposit modal
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [depositAmount, setDepositAmount] = useState(10);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('energy_wallets')
        .select(`
          id, user_id, cluster_id, energy_credit_kwh, energy_debt_kwh, updated_at,
          clusters (name)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setWallets(data || []);
    } catch (err: any) {
      console.error('Failed to fetch wallets:', err);
      setError(err.message || 'Could not load your wallets');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchWallets();

    const channel = supabase
      .channel(`user_wallets:${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'energy_wallets', filter: `user_id=eq.${user?.id}` }, fetchWallets)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchWallets]);

  const totals = useMemo(() => {
    const credit = wallets.reduce((sum, w) => sum + (w.energy_credit_kwh || 0), 0);
    const debt = wallets.reduce((sum, w) => sum + (w.energy_debt_kwh || 0), 0);
    return {
      credit: Number(credit.toFixed(2)),
      debt: Number(debt.toFixed(2)),
      net: Number((credit - debt).toFixed(2)),
    };
  }, [wallets]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClusterId || depositAmount <= 0 || !user) return;

    setPaymentLoading(true);

    try {
      const result = await initiateContributionPayment({
        clusterId: selectedClusterId,
        amountKwh: depositAmount,
        userId: user.id,
      });

      alert(`Payment request sent!\nReference: ${result.reference}\nCheck your phone for MTN prompt.`);
      setShowDepositModal(false);
      setDepositAmount(10);
      setSelectedClusterId('');
    } catch (err: any) {
      console.error('Deposit error:', err);
      alert('Failed to initiate payment: ' + (err.message || 'Unknown error'));
    } finally {
      setPaymentLoading(false);
    }
  };

  if (authLoading || loading || clustersLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="card text-center py-12">
          <div className="animate-pulse space-y-4 max-w-md mx-auto">
            <div className="h-8 bg-white/10 rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
            <div className="h-32 bg-white/10 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="card text-center py-12">
          <h2 className="text-2xl font-semibold mb-4 text-white">Sign In Required</h2>
          <p className="text-purple-200">Please sign in to view and manage your energy wallet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">My Energy Wallet</h1>
          <p className="text-purple-200 mt-1">Track your credits, debts and net balance</p>
        </div>
        <button
          onClick={fetchWallets}
          disabled={loading}
          className="btn btn-outline btn-sm"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 p-4 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* Totals Card */}
      <div className="card mb-8 p-6 bg-gradient-to-br from-purple-900/20 to-transparent">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-purple-100">Overall Balance</h2>
          <button
            onClick={() => { setSelectedClusterId(''); setShowDepositModal(true); }}
            className="btn btn-primary btn-sm"
          >
            + Deposit
          </button>
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-sm text-green-300">Credit</p>
            <p className="text-2xl font-bold text-green-400">{totals.credit.toLocaleString()} kWh</p>
          </div>
          <div>
            <p className="text-sm text-red-300">Debt</p>
            <p className="text-2xl font-bold text-red-400">{totals.debt.toLocaleString()} kWh</p>
          </div>
          <div>
            <p className="text-sm text-purple-300">Net</p>
            <p className={`text-2xl font-bold ${totals.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totals.net >= 0 ? '+' : ''}{totals.net.toLocaleString()} kWh
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Cards */}
      {wallets.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-purple-200 mb-4">No wallets yet</p>
          <button
            onClick={() => { setSelectedClusterId(''); setShowDepositModal(true); }}
            className="btn btn-primary"
          >
            Create Your First Wallet
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {wallets.map(wallet => {
            const net = wallet.energy_credit_kwh - wallet.energy_debt_kwh;
            return (
              <div key={wallet.id} className="card p-6 hover:border-purple-500/40 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-lg">{wallet.clusters?.name || 'Unknown Cluster'}</h3>
                  <span className="text-xs text-purple-400">
                    {new Date(wallet.updated_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-4 bg-green-900/20 rounded-lg border border-green-800/30">
                    <p className="text-sm text-green-300">Credit</p>
                    <p className="text-xl font-bold text-green-400">{wallet.energy_credit_kwh.toLocaleString()} kWh</p>
                  </div>
                  <div className="text-center p-4 bg-red-900/20 rounded-lg border border-red-800/30">
                    <p className="text-sm text-red-300">Debt</p>
                    <p className="text-xl font-bold text-red-400">{wallet.energy_debt_kwh.toLocaleString()} kWh</p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                  <span className="text-sm text-purple-300">Net Balance</span>
                  <span className={`font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {net >= 0 ? '+' : ''}{net.toLocaleString()} kWh
                  </span>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedClusterId(wallet.cluster_id);
                      setShowDepositModal(true);
                    }}
                    className="flex-1 btn btn-primary btn-sm"
                  >
                    + Deposit
                  </button>
                  <Link
                    to={`/transactions?wallet_id=${wallet.id}`}
                    className="flex-1 btn btn-outline btn-sm text-center"
                  >
                    View History
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full p-8 relative">
            <button
              onClick={() => setShowDepositModal(false)}
              className="absolute top-4 right-4 text-purple-400 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-2xl font-bold mb-6 text-white">Deposit Energy Credits</h3>

            <form onSubmit={handleDeposit} className="space-y-6">
              <div>
                <label className="block text-sm text-purple-300 mb-2">Community</label>
                <select
                  value={selectedClusterId}
                  onChange={e => setSelectedClusterId(e.target.value)}
                  className="w-full bg-white/5 border border-purple-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  required
                >
                  <option value="">Select a community</option>
                  {availableClusters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-purple-300 mb-2">Amount (kWh)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={depositAmount}
                  onChange={e => setDepositAmount(Number(e.target.value))}
                  className="w-full bg-white/5 border border-purple-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentLoading}
                  className="flex-1 btn btn-primary"
                >
                  {paymentLoading ? 'Processing...' : `Deposit ${depositAmount} kWh`}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-purple-400 mt-6">
              You will receive an MTN MoMo prompt on your phone to complete payment.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}