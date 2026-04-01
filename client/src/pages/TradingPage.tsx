import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Truck, MapPin, Clock, Users, ArrowRight, Shield } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface Job {
  id: string;
  name: string;
  location: string;
  target_kw: number;
  current_usd: number;
  target_usd: number;
  lifecycle_state: string;
  bid_count: number;
  funding_pct: number;
}

export default function TradingPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('clusters')
      .select('id, name, location, target_kw, current_usd, target_usd, lifecycle_state, funding_pct')
      .in('lifecycle_state', ['FUNDED', 'INSTALLING', 'FUNDING'])
      .gte('funding_pct', 80)
      .order('funding_pct', { ascending: false })
      .then(({ data }) => {
        setJobs(data?.map(d => ({ ...d, bid_count: 0 })) || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-display font-black tracking-tighter">Resource Control Layer</h1>
        <p className="text-white/50 mt-2 max-w-2xl">
          Deployment signals for verified solar installers. Clusters approaching or at 100% funding
          are surfaced here for procurement and installation bids.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Signals', value: jobs.length.toString() },
          { label: 'kW Deploying', value: `${jobs.reduce((s, j) => s + (j.target_kw || 0), 0)}` },
          { label: 'Capital Ready', value: `$${jobs.filter(j => j.funding_pct >= 100).reduce((s, j) => s + (j.current_usd || 0), 0).toLocaleString()}` },
          { label: 'Open Bids', value: '0' },
        ].map(s => (
          <Card key={s.label} variant="glass" padding="md">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">{s.label}</p>
            <p className="text-2xl font-display font-black text-white mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="text-white/20 text-xs font-mono text-center py-12">Loading deployment signals...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Truck size={40} className="text-white/10 mx-auto" />
          <p className="text-white/30 text-sm">No clusters at deployment threshold yet.</p>
          <p className="text-white/20 text-xs">Clusters appear here when they reach 80%+ funding.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => {
            const pct = Math.min(Math.round((job.current_usd / job.target_usd) * 100), 100);
            const isReady = pct >= 100;
            return (
              <Card key={job.id} variant="glass" padding="lg" className={`border ${isReady ? 'border-emerald-500/20' : 'border-white/5'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-display font-bold text-white">{job.name}</h3>
                      <span className={`text-[9px] font-mono px-2 py-1 rounded-full ${isReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {isReady ? 'READY FOR DEPLOYMENT' : `${pct}% FUNDED`}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span className="flex items-center gap-1"><MapPin size={12} /> {job.location}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> ~{Math.ceil(job.target_kw / 5)} install days</span>
                      <span className="flex items-center gap-1"><Users size={12} /> {job.bid_count} bids</span>
                    </div>
                    <div className="progress-track h-1.5">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-white/30 uppercase">System Size</p>
                      <p className="text-lg font-black text-white">{job.target_kw} kWp</p>
                    </div>
                    <button
                      onClick={() => navigate(`/clusters/${job.id}`)}
                      className="flex items-center gap-2 px-5 py-3 bg-brand-primary/20 border border-brand-primary/30 text-brand-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-primary/30 transition-all group"
                    >
                      View Node
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="p-6 glass rounded-2xl border border-white/5">
        <div className="flex items-start gap-4">
          <Shield size={24} className="text-brand-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-white mb-1">Installer Certification Required</h4>
            <p className="text-sm text-white/40">
              To bid on Enerlectra deployments you must hold a valid Electrical Contractor
              license from the Energy Regulation Board (ERB) and complete Enerlectra digital
              metering certification.
            </p>
            <button className="text-brand-primary text-xs mt-3 hover:underline">Start Certification →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
