import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, Truck, CheckCircle, Activity } from 'lucide-react';

interface Quote {
  id: string;
  supplier_name: string;
  capacity: string;
  total_cost_usd: number;
  delivery_days: number;
  efficiency_rating: string;
  status: string;
}

interface Bid {
  id: string;
  company_name: string;
  license_number: string;
  timeline_days: number;
  bid_amount_usd: number;
  rating: number;
  previous_installations: number;
  status: string;
}

interface Props {
  clusterId: string;
  fundingPct: number;
  targetUsd: number;
  currentUsd: number;
  lifecycleState: string;
}

export function ClusterEconomics({ clusterId, fundingPct, targetUsd, currentUsd, lifecycleState }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const isFullyFunded = fundingPct >= 100;

  const stage = lifecycleState === 'OPERATIONAL' ? 'yield'
    : lifecycleState === 'INSTALLING' ? 'deployment'
    : lifecycleState === 'FUNDED' ? 'procurement'
    : 'funding';

  useEffect(() => {
    if (stage === 'procurement' || stage === 'deployment' || stage === 'yield') {
      supabase.from('procurement_quotes').select('*').eq('cluster_id', clusterId)
        .then(({ data }) => data && setQuotes(data));
    }
    if (stage === 'deployment' || stage === 'yield') {
      supabase.from('installer_bids').select('*').eq('cluster_id', clusterId)
        .then(({ data }) => data && setBids(data));
    }
  }, [clusterId, stage]);

  const stages = ['funding', 'procurement', 'deployment', 'yield'];
  const currentStageIndex = stages.indexOf(stage);

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10">
      {/* Stage Progress */}
      <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">Cluster Economics</h3>
          <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${isFullyFunded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {isFullyFunded ? 'SIGNAL: READY FOR DEPLOYMENT' : 'PHASE: CAPITAL ACCUMULATION'}
          </span>
        </div>

        <div className="flex items-center justify-between mt-6">
          {[
            { icon: <Zap size={16} />, label: 'Capital', key: 'funding' },
            { icon: <Truck size={16} />, label: 'Procurement', key: 'procurement' },
            { icon: <Activity size={16} />, label: 'Deployment', key: 'deployment' },
            { icon: <CheckCircle size={16} />, label: 'EaaS Yield', key: 'yield' },
          ].map((s, i) => {
            const isActive = s.key === stage;
            const isPast = currentStageIndex > i;
            return (
              <div key={s.key} className="flex flex-col items-center gap-2 flex-1">
                <div className={`p-3 rounded-xl transition-all ${
                  isActive ? 'bg-brand-primary/20 text-brand-primary ring-1 ring-brand-primary/30' :
                  isPast ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-white/5 text-white/20'
                }`}>
                  {s.icon}
                </div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{s.label}</span>
                {i < 3 && <div className={`absolute h-[1px] w-[calc(25%-2rem)] ${isPast ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Content */}
      <div className="p-6">
        {stage === 'funding' && (
          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Funding Progress</p>
              <span className="text-white font-bold">${currentUsd.toLocaleString()} / ${targetUsd.toLocaleString()}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${fundingPct}%` }} />
            </div>
            <div className="mt-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-2">On Funding Complete</p>
              <ul className="space-y-1 text-xs text-white/50">
                <li>→ Smart RFQ sent to verified Zambian solar suppliers</li>
                <li>→ Installer bids opened for certified ERB contractors</li>
                <li>→ Ellie begins meter ingestion protocol</li>
              </ul>
            </div>
          </div>
        )}

        {stage === 'procurement' && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest mb-4">Supplier Quotes</p>
            {quotes.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-xs font-mono">Awaiting supplier responses...</div>
            ) : quotes.map(q => (
              <div key={q.id} className={`p-4 rounded-xl border transition-all ${q.status === 'accepted' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{q.supplier_name}</span>
                      {q.status === 'accepted' && <span className="text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">Selected</span>}
                    </div>
                    <p className="text-xs text-white/40 mt-1">{q.capacity}</p>
                    <div className="flex gap-3 mt-2 text-[10px] text-white/30">
                    <span className="font-mono">{q.efficiency_rating}</span>
                    <span className="font-mono">{q.delivery_days} days</span>
                    </div>
                  </div>
                  <span className="text-lg font-black text-white">${q.total_cost_usd?.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {stage === 'deployment' && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest mb-4">Installer Bids</p>
            {bids.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-xs font-mono">No bids submitted yet...</div>
            ) : bids.map(b => (
              <div key={b.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex justify-between items-center">
                <div>
                  <span className="text-sm font-bold text-white">{b.company_name}</span>
                  <div className="flex gap-3 mt-1 text-[10px] text-white/30">
                    <span>Lic: {b.license_number}</span>
                    <span>⭐ {b.rating}/5</span>
                    <span>{b.previous_installations} installs</span>
                    <span>{b.timeline_days} days</span>
                  </div>
                </div>
                <span className="text-lg font-black text-white">${b.bid_amount_usd?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {stage === 'yield' && (
          <div className="text-center py-8 space-y-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping mx-auto" />
            <p className="text-sm font-bold text-white">EaaS Yield Active</p>
            <p className="text-xs text-white/40">Live reconciliation from Ellie meter readings</p>
          </div>
        )}
      </div>
    </div>
  );
}
