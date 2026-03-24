import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface Transaction {
  id: string;
  type: 'credit' | 'debt' | 'transfer';
  amount_kwh: number;
  description?: string;
  created_at: string;
  cluster_id?: string;
}

export default function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const walletId = searchParams.get('wallet_id');
  const { user } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletId || !user) return;

    const fetchTransactions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('energy_transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setTransactions(data || []);
      }
      setLoading(false);
    };

    fetchTransactions();

    // Realtime
    const channel = supabase
      .channel(`transactions:${walletId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'energy_transactions', filter: `wallet_id=eq.${walletId}` },
        () => fetchTransactions()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [walletId, user]);

  if (!walletId) {
    return <div className="card text-center py-12">No wallet selected.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/wallet" className="flex items-center gap-2 text-purple-300 mb-6 hover:text-white">
        <ArrowLeft size={18} /> Back to Wallet
      </Link>

      <h1 className="text-3xl font-bold text-white mb-2">Transaction History</h1>
      <p className="text-purple-200 mb-8">All credits, debts and transfers for this community wallet</p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />)}
        </div>
      ) : transactions.length === 0 ? (
        <div className="card py-12 text-center">
          <Zap size={48} className="mx-auto mb-4 text-purple-400" />
          <p className="text-xl font-medium">No transactions yet</p>
          <p className="text-purple-200 mt-2">Your first contribution will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((t) => (
            <div
              key={t.id}
              className="card flex justify-between items-center p-5"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    t.type === 'credit' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                  }`}
                >
                  <Zap size={20} />
                </div>
                <div>
                  <p className="font-medium">
                    {t.type === 'credit' ? 'Energy Credit' : t.type === 'debt' ? 'Energy Debt' : 'Transfer'}
                  </p>
                  <p className="text-xs text-purple-300">{t.description || 'Community contribution'}</p>
                </div>
              </div>

              <div className="text-right">
                <p
                  className={`text-2xl font-bold ${
                    t.type === 'credit' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {t.type === 'credit' ? '+' : '-'}{t.amount_kwh} kWh
                </p>
                <p className="text-xs text-purple-300">
                  {new Date(t.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
