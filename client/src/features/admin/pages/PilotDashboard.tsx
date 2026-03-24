import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { EnergyEntryForm } from '../../energy/components/EnergyEntryForm';
import { SettlementTrace } from '../../energy/components/SettlementTrace';
import { OwnershipBar } from '../../energy/components/OwnershipBar';
import { triggerSettlement } from '../../energy/services/settlementService';
import { useAuth } from '../../../hooks/useAuth';
import { useClusters } from '../../../features/clusters/hooks/useCluster';
import { usePCUTrend } from '../../../hooks/usePCUTrend';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Sun, Moon, RefreshCw } from 'lucide-react';

// Sub-component for Run Settlement to handle its own loading state
const RunSettlementButton = ({ clusterId, date, onSuccess }: { clusterId: string, date: string, onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!clusterId) return toast.error('Please select a cluster');
    setLoading(true);
    const toastId = toast.loading('Processing settlement...');
    try {
      await triggerSettlement(clusterId, date);
      toast.success('Settlement processed successfully', { id: toastId });
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Settlement failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRun}
      disabled={loading || !clusterId}
      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-all flex items-center gap-2"
    >
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      Run Settlement
    </button>
  );
};

export default function PilotDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { clusters, loading: clustersLoading } = useClusters();
  
  // Use the actual clusters from your database if available, else fallback to hardcoded list
  const activeClusters = clusters?.length ? clusters : [];
  const [clusterId, setClusterId] = useState<string>(activeClusters[0]?.id || '');
  const [settlementDate, setSettlementDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Live Data Hook
  const { data: trendData = [], loading: _trendLoading } = usePCUTrend(clusterId);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (authLoading || clustersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400">Loading Enerlectra Grid...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/signin" replace />;

  const selectedCluster = activeClusters.find(c => c.id === clusterId);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Pilot Dashboard</h1>
          <p className="text-[var(--text-secondary)] text-sm lg:text-base mt-1">
            {selectedCluster?.name || 'Select a Cluster'} • Zambia Energy Internet
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2.5 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-glass)]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <select
            value={clusterId}
            onChange={e => setClusterId(e.target.value)}
            className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-lg px-4 py-2.5 text-sm"
          >
            <option value="">Select cluster</option>
            {activeClusters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column: Entry & Settlement */}
        <div className="space-y-8">
          <section className="glass p-6 rounded-xl space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sun className="w-5 h-5 text-yellow-500" /> Submit Energy Reading
            </h2>
            {clusterId ? (
              <EnergyEntryForm clusterId={clusterId} onSuccess={() => setRefreshTrigger(p => p + 1)} />
            ) : (
              <p className="text-[var(--text-muted)] italic">Please select a cluster to begin.</p>
            )}
          </section>

          <section className="glass p-6 rounded-xl space-y-6">
            <h2 className="text-lg font-semibold">Settlement Operations</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="date"
                value={settlementDate}
                onChange={e => setSettlementDate(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border-glass)] rounded-lg px-4 py-2"
              />
              <RunSettlementButton 
                clusterId={clusterId} 
                date={settlementDate} 
                onSuccess={() => setRefreshTrigger(p => p + 1)} 
              />
            </div>
          </section>
        </div>

        {/* Right Column: Chart & Ownership */}
        <div className="space-y-8">
          <section className="glass p-6 rounded-xl">
            <h2 className="text-lg font-semibold mb-6">Funding & Settlement Trend</h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend />
                  <Bar dataKey="pcu" fill="#10b981" name="Funded PCUs" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="settled" fill="#6366f1" name="Settled PCUs" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <OwnershipBar clusterId={clusterId} refreshTrigger={refreshTrigger} />
        </div>
      </div>

      {clusterId && (
        <section className="glass p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Live Settlement Trace</h2>
          <SettlementTrace clusterId={clusterId} date={settlementDate} key={refreshTrigger} />
        </section>
      )}
    </div>
  );
}
