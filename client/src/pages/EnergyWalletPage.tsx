import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth'; // we'll create this next

export default function EnergyWalletPage() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWallets() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('energy_wallets')
          .select('*, clusters(name)')
          .eq('user_id', user.id);
        if (error) throw error;
        setWallets(data || []);
      } catch (error) {
        console.error('Error fetching wallets:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchWallets();
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="card text-center">
          <p className="text-purple-200">Please sign in to view your energy wallet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 text-white">My Energy Wallet</h1>
      <p className="text-purple-200 mb-6">Track your energy credits and debts across communities.</p>

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-white/10 animate-pulse rounded"></div>
        </div>
      ) : wallets.length === 0 ? (
        <div className="card">
          <p className="text-purple-200">No energy wallet entries yet. Contribute to a community to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="card flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{wallet.clusters?.name || 'Unknown community'}</h3>
                <p className="text-sm text-purple-200">Last updated: {new Date(wallet.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-400">Credit: {wallet.energy_credit_kwh} kWh</p>
                <p className="text-sm text-red-400">Debt: {wallet.energy_debt_kwh} kWh</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}