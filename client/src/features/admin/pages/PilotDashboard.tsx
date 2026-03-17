import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { EnergyEntryForm } from '../../energy/components/EnergyEntryForm';
import { SettlementTrace } from '../../energy/components/SettlementTrace';
import { OwnershipBar } from '../../energy/components/OwnershipBar';
import { triggerSettlement } from '../../energy/services/settlementService';
import { useAuth } from '../../../hooks/useAuth';
import { useClusters } from '../../../features/clusters/hooks/useClusters';
import { usePCUTrend } from '../../../hooks/usePCUTrend';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Sun, Moon, RefreshCw, AlertCircle } from 'lucide-react';

const CLUSTERS = [
  { id: 'clu_73x96b83', name: 'Ndola Cluster B' },
  { id: 'clu_l8nydwpo', name: 'Ndola Cluster B (v2)' },
  { id: 'clu_rct5pbmy', name: 'Kabwe Solar Cluster A' },
  { id: 'clu_ghkjb95x', name: 'Kabwe Solar Cluster B' },
];

export default function PilotDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { clusters, loading: clustersLoading } = useClusters();
  const [clusterId, setClusterId] = useState<string>(CLUSTERS[0]?.id || '');
  const [settlementDate, setSettlementDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isRunningSettlement, setIsRunningSettlement] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auto-refresh every 45 seconds
  useEffect(() => {
    if (!clusterId) return;
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 45000);
    return () => clearInterval(interval);
  }, [clusterId]);

  const handleTriggerSettlement = async () => {
    if (!clusterId) {
      toast.error('Select a cluster first');
      return;
    }

    setIsRunningSettlement(true);
    const toastId = toast.loading('Triggering settlement...');

    try {
      const res = await triggerSettlement(clusterId, settlementDate);
      toast.success(`Settlement queued (Job: ${res.job_id})`, { id: toastId });
      setRefreshTrigger(p => p + 1);
    } catch (err: any) {
      toast.error(err.message || 'Settlement failed', { id: toastId });
    } finally {
      setIsRunningSettlement(false);
    }
  };

  if (authLoading || clustersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  const selectedClusterName = CLUSTERS.find(c => c.id === clusterId)?.name || 'No cluster selected';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Pilot Dashboard</h1>
          <p className="text-[var(--text-secondary)] text-sm lg:text-base mt-1">
            Manual readings • Settlement • Ownership • {selectedClusterName}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2.5 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-glass)] hover:border-[var(--border-hover)] transition-colors"
            aria-label="Toggle dark/light mode"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Cluster selector */}
          <div>
            <label htmlFor="cluster" className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              Cluster
            </label>
            <select
              id="cluster"
              value={clusterId}
              onChange={e => setClusterId(e.target.value)}
              className="w-full sm:w-64 bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-glow)]"
            >
              <option value="">Select cluster</option>
              {CLUSTERS.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Energy Entry */}
      <section className="space-y-4">
        <h2 className="section-heading">
          Submit Energy Reading
        </h2>
        {clusterId ? (
          <EnergyEntryForm
            clusterId={clusterId}
            onSuccess={() => setRefreshTrigger(p => p + 1)}
          />
        ) : (
          <div className="glass p-8 text-center text-[var(--text-muted)]">
            Select a cluster above to enter readings
          </div>
        )}
      </section>

      {/* Ownership + Chart */}
      <section className="space-y-6">
        <h2 className="section-heading">
          Ownership & PCU Trend
        </h2>

        {clusterId ? (
          <div className="space-y-6">
            <OwnershipBar clusterId={clusterId} refreshTrigger={refreshTrigger} />

            <div className="h-72 lg:h-96 glass p-4 md:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockTrendData /* replace with real data from usePCUTrend */}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" />
                  <YAxis stroke="var(--text-muted)" />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(30,41,59,0.95)',
                      border: '1px solid rgba(102,126,234,0.3)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'var(--text-secondary)' }} />
                  <Bar dataKey="pcu" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} name="Total PCUs" />
                  <Bar dataKey="settled" fill="var(--success)" radius={[4, 4, 0, 0]} name="Settled PCUs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="glass p-8 text-center text-[var(--text-muted)]">
            Select a cluster to view ownership and trends
          </div>
        )}
      </section>

      {/* Settlement */}
      <section className="space-y-6">
        <h2 className="section-heading">
          Run Settlement
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="flex-1">
            <label htmlFor="settlement-date" className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              Settlement Date
            </label>
            <input
              id="settlement-date"
              type="date"
              value={settlementDate}
              onChange={e => setSettlementDate(e.target.value)}
              className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-glow)]"
            />
          </div>

          <RunSettlementButton
            clusterId={clusterId}
            date={settlementDate}
            onSuccess={() => setRefreshTrigger(p => p + 1)}
          />
        </div>

        {clusterId && (
          <SettlementTrace
            clusterId={clusterId}
            date={settlementDate}
            key={`${clusterId}-${settlementDate}-${refreshTrigger}`}
          />
        )}
      </section>
    </div>
  );
}