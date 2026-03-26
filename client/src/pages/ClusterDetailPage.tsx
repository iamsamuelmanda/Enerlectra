import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Zap, Wallet, History, Activity, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { FundingChart } from '@/features/clusters/components/FundingChart';
import { useCluster } from '@/features/clusters/hooks/useCluster';
import { ContributionHistory } from '@/features/contributions/components/ContributionHistory';
import ContributeForm from '@/features/contributions/components/ContributionForm';
import { SimulationForm } from '@/features/simulation/components/SimulationForm';

export default function ClusterDetailPage() {
  const { id: clusterId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: cluster, isLoading: loading, refetch: refresh } = useCluster(clusterId!);

  const handleContributionSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Grid Node...</p>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Zap size={40} className="text-white/20" />
        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Node not found in the Enerlectra Grid</p>
        <button onClick={() => navigate('/')} className="btn-primary px-6 py-2 text-sm">Back to Dashboard</button>
      </div>
    );
  }

  const fundingPct = cluster.target_usd > 0
    ? Math.min(Math.round((cluster.current_usd / cluster.target_usd) * 100), 100)
    : 0;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">

      {/* HEADER */}
      <div className="space-y-6">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-bold text-white/30 hover:text-brand-primary transition-all group w-fit">
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-brand-primary" />
              <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                {cluster.location ?? 'Zambia'} · Node {clusterId?.slice(-4).toUpperCase()}
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-black tracking-tighter uppercase leading-none">
              {cluster.name}
            </h1>
          </div>

          <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <ShieldCheck className="text-emerald-400" size={18} />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest">State</span>
              <span className="text-xs font-bold text-white uppercase">{cluster.lifecycle_state ?? 'Fundraising'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FUNDING PROGRESS */}
      <Card variant="glass" padding="lg">
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Funding Progress</p>
            <span className="text-3xl font-display font-black text-white">{fundingPct}%</span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Raised</p>
            <span className="text-xl font-display font-bold text-white">${cluster.current_usd ?? 0} <span className="text-white/30 text-sm">/ ${cluster.target_usd}</span></span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${fundingPct}%` }} />
        </div>
      </Card>

      {/* TABS */}
      <Tabs defaultValue="contribute" className="space-y-8">
        <TabsList className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 inline-flex">
          <TabsTrigger value="contribute">Contribute</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="simulate">Simulation</TabsTrigger>
        </TabsList>

        {/* CONTRIBUTE TAB */}
        <TabsContent value="contribute" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card variant="glass" padding="lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-brand-primary/20 rounded-xl text-brand-primary"><Wallet size={20} /></div>
                  <div>
                    <h3 className="font-display font-bold text-xl text-white">Join This Node</h3>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Contribute via MTN or Airtel MoMo</p>
                  </div>
                </div>
                <ContributeForm clusterId={clusterId!} onSuccess={handleContributionSuccess} />
              </Card>
            </div>

            <aside className="space-y-6">
              <Card variant="raised" padding="lg">
                <div className="flex items-center gap-2 mb-6">
                  <Activity size={16} className="text-brand-primary" />
                  <h4 className="font-display font-bold text-white uppercase tracking-widest text-xs">Node Specs</h4>
                </div>
                <div className="space-y-5">
                  <Param label="Solar Capacity" value={`${cluster.target_kw ?? 0} kW`} />
                  <Param label="Funding Target" value={`$${cluster.target_usd ?? 0}`} />
                  <Param label="Funding Raised" value={`$${cluster.current_usd ?? 0}`} />
                  <Param label="Node ID" value={`...${clusterId?.slice(-6).toUpperCase()}`} />
                </div>
              </Card>

              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <History size={14} className="text-brand-primary" />
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Transaction Log</span>
                </div>
                <ContributionHistory clusterId={clusterId!} key={refreshKey} />
              </div>
            </aside>
          </div>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="outline-none">
          <FundingChart clusterId={clusterId!} />
        </TabsContent>

        {/* SIMULATION TAB */}
        <TabsContent value="simulate" className="outline-none">
          <div className="max-w-3xl mx-auto">
            <SimulationForm clusterData={cluster} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
      <span className="text-white font-display font-bold">{value}</span>
    </div>
  );
}
