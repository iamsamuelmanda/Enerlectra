import { useState, useEffect } from 'react';
import { marketplaceApi } from '../../services/marketplaceApi';
interface Cluster { id: string; name: string; target_solar_kw?: number; target_storage_kwh?: number; status?: string; province?: string; }
interface ClusterListProps { onSelectCluster: (cluster: any) => void; }
export default function ClusterList({ onSelectCluster }: ClusterListProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { loadClusters(); }, []);
  const loadClusters = async () => { try { setLoading(true); setError(null); const data = await marketplaceApi.getClusters(); setClusters(data); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load clusters'); } finally { setLoading(false); } };
  const handleSelect = (cluster: Cluster) => { setSelectedId(cluster.id); onSelectCluster(cluster); };
  if (loading) return <div className="text-center py-12"><svg className="w-12 h-12 mx-auto animate-spin text-purple-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><p className="mt-4 text-slate-400">Loading communities...</p></div>;
  if (error) return <div className="bg-red-900/30 border-l-4 border-red-500 p-4 rounded-lg"><p className="font-semibold text-red-300">Failed to load communities</p><p className="text-sm text-red-400 mt-1">{error}</p><button onClick={loadClusters} className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg font-medium">Try Again</button></div>;
  if (clusters.length === 0) return <div className="text-center py-12 bg-slate-700/30 rounded-xl border-2 border-dashed border-slate-600"><p className="text-slate-400 font-medium">No communities available yet</p></div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {clusters.map((cluster) => (
        <div key={cluster.id} onClick={() => handleSelect(cluster)} className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all duration-200 hover:border-purple-500 hover:shadow-lg hover:-translate-y-1 ${selectedId === cluster.id ? 'border-purple-500 bg-purple-900/20' : 'border-slate-600 bg-slate-700/50'}`}>
          {selectedId === cluster.id && <div className="absolute top-3 right-3 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">✓ Selected</div>}
          <div className="mb-4 pr-16"><h4 className="font-bold text-white text-lg leading-tight">{cluster.name}</h4><span className="text-xs text-slate-500 font-mono">{String(cluster.id).substring(0,12)}…</span></div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-2"><p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Target Solar</p><p className="text-xl font-bold text-yellow-400">{cluster.target_solar_kw != null ? `${cluster.target_solar_kw} kW` : '—'}</p></div>
            <div className="bg-slate-800/50 rounded-lg p-2"><p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Target Storage</p><p className="text-xl font-bold text-blue-400">{cluster.target_storage_kwh != null ? `${cluster.target_storage_kwh} kWh` : '—'}</p></div>
            <div className="bg-slate-800/50 rounded-lg p-2"><p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Status</p><p className="text-sm font-semibold text-green-400 capitalize">{cluster.status ?? 'Active'}</p></div>
            <div className="bg-slate-800/50 rounded-lg p-2"><p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Province</p><p className="text-sm font-semibold text-slate-300">{cluster.province ?? 'Zambia'}</p></div>
          </div>
          <button className={`w-full py-2.5 font-semibold rounded-lg transition-all ${selectedId === cluster.id ? 'bg-purple-700 text-white' : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white'}`}>{selectedId === cluster.id ? '✓ Community Selected' : 'Select Community'}</button>
        </div>
      ))}
    </div>
  );
}
