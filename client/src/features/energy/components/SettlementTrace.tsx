// Displays per-unit settlement breakdown for a given cluster + date
import { useSettlement } from '../hooks/useSettlement';
import type { SettlementResult } from '../../../types/api';

interface Props {
  clusterId: string;
  date: string;
}

const statusColour: Record<SettlementResult['status'], string> = {
  pending:  'text-yellow-400',
  settled:  'text-emerald-400',
  disputed: 'text-red-400',
};

export function SettlementTrace({ clusterId, date }: Props) {
  const { results, loading, error } = useSettlement(clusterId, date);

  if (loading) return <p className="text-white/40 text-sm">Loading settlement…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;
  if (!results.length) return <p className="text-white/40 text-sm">No settlement data for {date}.</p>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
        Settlement – {date}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-white/80">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-right">Gen kWh</th>
              <th className="px-4 py-2 text-right">Con kWh</th>
              <th className="px-4 py-2 text-right">Net kWh</th>
              <th className="px-4 py-2 text-right">Credit PCU</th>
              <th className="px-4 py-2 text-right">Debit PCU</th>
              <th className="px-4 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.unit_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-2 font-mono">{r.unit_id}</td>
                <td className="px-4 py-2 text-right">{r.generation_kwh.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{r.consumption_kwh.toFixed(2)}</td>
                <td className={`px-4 py-2 text-right ${r.net_kwh >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.net_kwh.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right text-emerald-400">{r.credit_pcu.toFixed(4)}</td>
                <td className="px-4 py-2 text-right text-red-400">{r.debit_pcu.toFixed(4)}</td>
                <td className={`px-4 py-2 text-center capitalize ${statusColour[r.status]}`}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
