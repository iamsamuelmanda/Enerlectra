import { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

interface LedgerEntry {
  id: string;
  cluster_id: string;
  unit_id: string;
  date: string;
  event_type: 'generation' | 'consumption' | 'surplus_allocation' | 'grid_import' | 'trade';
  quantity_kwh: number;
  credit_pcu: number;
  debit_pcu: number;
  status: 'pending' | 'settled' | 'disputed';
}

interface Props {
  clusterId: string;
  date: string;
}

export function EnergyLedger({ clusterId, date }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId || !date) return;
    setLoading(true);
    apiGet<LedgerEntry[]>(`/ledger/${clusterId}?date=${date}`)
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [clusterId, date]);

  if (loading) return <p className="text-white/40 text-sm">Loading ledger…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!entries.length) return <p className="text-white/40 text-sm">No ledger entries for {date}.</p>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
        Energy Ledger – {date}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-white/80">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-left">Event</th>
              <th className="px-4 py-2 text-right">kWh</th>
              <th className="px-4 py-2 text-right">Credit (PCU)</th>
              <th className="px-4 py-2 text-right">Debit (PCU)</th>
              <th className="px-4 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-2 font-mono">{entry.unit_id}</td>
                <td className="px-4 py-2 capitalize">{entry.event_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-right">{entry.quantity_kwh.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-emerald-400">{entry.credit_pcu.toFixed(4)}</td>
                <td className="px-4 py-2 text-right text-red-400">{entry.debit_pcu.toFixed(4)}</td>
                <td className={`px-4 py-2 text-center capitalize ${
                  entry.status === 'settled' ? 'text-emerald-400' : entry.status === 'disputed' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {entry.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}