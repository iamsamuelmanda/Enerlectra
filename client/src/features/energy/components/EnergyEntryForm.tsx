// Admin form – POST a manual energy reading to /api/energy/readings
import { useState } from 'react';
import { submitReading } from '../services/energyService';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export function EnergyEntryForm({ clusterId, onSuccess }: Props) {
  const [unitId, setUnitId]           = useState('');
  const [date, setDate]               = useState('');
  const [generation, setGeneration]   = useState('');
  const [consumption, setConsumption] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);

    if (!unitId || !date || !generation || !consumption) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    try {
      await submitReading({
        cluster_id: clusterId,
        unit_id: unitId,
        date,
        generation_kwh: parseFloat(generation),
        consumption_kwh: parseFloat(consumption),
      });
      setSuccess(true);
      setUnitId(''); setDate(''); setGeneration(''); setConsumption('');
      onSuccess?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur">
      <h3 className="text-lg font-semibold text-white">Submit Energy Reading</h3>

      {error   && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">Reading saved successfully.</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/60 mb-1">Unit ID</label>
          <input value={unitId} onChange={e => setUnitId(e.target.value)}
            placeholder="e.g. FLAT-01"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Generation (kWh)</label>
          <input type="number" value={generation} onChange={e => setGeneration(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Consumption (kWh)</label>
          <input type="number" value={consumption} onChange={e => setConsumption(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium text-sm transition-colors">
        {loading ? 'Saving...' : 'Save Reading'}
      </button>
    </div>
  );
}
