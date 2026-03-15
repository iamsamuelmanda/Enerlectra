import { useState } from 'react';
import { EnergyEntryForm }   from '../../energy/components/EnergyEntryForm';
import { SettlementTrace }   from '../../energy/components/SettlementTrace';
import { OwnershipBar }      from '../../energy/components/OwnershipBar';
import { triggerSettlement } from '../../energy/services/settlementService';

// Real clusters from your backend — replace/extend as clusters are added
const CLUSTERS = [
  { id: 'clu_73x96b83', name: 'Ndola Cluster B' },
  { id: 'clu_l8nydwpo', name: 'Ndola Cluster B (v2)' },
  { id: 'clu_rct5pbmy', name: 'Kabwe Solar Cluster A' },
  { id: 'clu_ghkjb95x', name: 'Kabwe Solar Cluster B' },
];

export default function PilotDashboard() {
  const [clusterId, setClusterId] = useState(CLUSTERS[0].id);
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [running, setRunning]     = useState(false);
  const [runMsg, setRunMsg]       = useState<string | null>(null);
  const [refresh, setRefresh]     = useState(0);

  const handleTrigger = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await triggerSettlement(clusterId, date);
      setRunMsg(`Settlement job queued: ${res.job_id}`);
      setRefresh(r => r + 1);
    } catch (e: any) {
      setRunMsg(`Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 space-y-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pilot Dashboard</h1>
          <p className="text-white/50 text-sm mt-1">Manual data entry and settlement control</p>
        </div>

        {/* Cluster selector — top-level, affects all sections */}
        <div>
          <label className="block text-xs text-white/40 mb-1">Active Cluster</label>
          <select
            value={clusterId}
            onChange={e => setClusterId(e.target.value)}
            className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {CLUSTERS.map(c => (
              <option key={c.id} value={c.id} className="bg-gray-900">
                {c.name} — {c.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Energy Entry */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
          Submit Reading
        </h2>
        <EnergyEntryForm
          clusterId={clusterId}
          onSuccess={() => setRefresh(r => r + 1)}
        />
      </section>

      {/* Ownership */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
          Cluster Ownership
        </h2>
        <OwnershipBar clusterId={clusterId} />
      </section>

      {/* Settlement */}
      <section className="space-y-4">
        <div className="flex items-end gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
              Settlement
            </h2>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleTrigger}
            disabled={running}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {running ? 'Running…' : 'Trigger Settlement'}
          </button>
        </div>
        {runMsg && <p className="text-xs text-white/60">{runMsg}</p>}
        <SettlementTrace key={`${clusterId}-${refresh}`} clusterId={clusterId} date={date} />
      </section>
    </div>
  );
}