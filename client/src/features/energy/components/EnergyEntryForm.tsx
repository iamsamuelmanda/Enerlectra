import { useState } from 'react';
import toast from 'react-hot-toast';
import { submitReading } from '../services/energyService';
import { Card } from '../../../components/ui/Card';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export function EnergyEntryForm({ clusterId, onSuccess }: Props) {
  const [unitId, setUnitId] = useState('');
  const [date, setDate] = useState('');
  const [generation, setGeneration] = useState('');
  const [consumption, setConsumption] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!unitId.trim()) return 'Unit ID is required';
    if (!date) return 'Date is required';
    if (!generation || Number(generation) < 0) return 'Generation must be ≥ 0';
    if (!consumption || Number(consumption) < 0) return 'Consumption must be ≥ 0';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Saving reading...');

    try {
      await submitReading({
        cluster_id: clusterId,
        unit_id: unitId.trim(),
        date,
        generation_kwh: Number(generation),
        consumption_kwh: Number(consumption),
      });

      toast.success('Reading saved successfully', { id: toastId });
      setUnitId('');
      setDate('');
      setGeneration('');
      setConsumption('');
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save reading', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="glass" padding="lg" className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Submit Energy Reading</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="unit-id" className="block text-sm text-gray-300 mb-1">
            Unit ID
          </label>
          <input
            id="unit-id"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="e.g. FLAT-01"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="date" className="block text-sm text-gray-300 mb-1">
            Date
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="generation" className="block text-sm text-gray-300 mb-1">
            Generation (kWh)
          </label>
          <input
            id="generation"
            type="number"
            step="0.01"
            min="0"
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="consumption" className="block text-sm text-gray-300 mb-1">
            Consumption (kWh)
          </label>
          <input
            id="consumption"
            type="number"
            step="0.01"
            min="0"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2 min-w-[140px] justify-center"
        >
          {loading && <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/></svg>}
          {loading ? 'Saving...' : 'Save Reading'}
        </button>
      </div>
    </Card>
  );
}
