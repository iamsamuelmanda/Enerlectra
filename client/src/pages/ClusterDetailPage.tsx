import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// FIXED: Case-sensitive imports to match physical filenames (Tabs.tsx, Card.tsx)
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';

import { 
  ArrowLeft, MapPin, ShieldCheck, Info, 
  Wallet, History, Activity, Zap 
} from 'lucide-react';

// Standardized Aliases to resolve Vercel build errors
import { FundingChart } from '@/features/clusters/components/FundingChart';
import { LiveMonitor } from '@/features/clusters/components/LiveMonitor';
import { SimulationForm } from '@/features/simulation/components/SimulationForm';
import { useCluster } from '@/features/clusters/hooks/useCluster';

// Migration Imports
import { ContributionHistory } from '@/features/contributions/components/ContributionHistory';
import ContributeForm from '@/features/contributions/components/ContributionForm';

export default function ClusterDetailPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const { cluster, loading, refresh } = useCluster(clusterId!);

  const handleContributionSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    refresh(); 
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="font-display font-bold text-muted animate-pulse uppercase tracking-[0.3em]">Syncing Grid Node...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700">
      
      {/* NAVIGATION & IDENTITY */}
      <div className="flex flex-col gap-6">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-brand-primary transition-all group w-fit"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          <span>RETURN TO DASHBOARD</span>
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-primary">
              <MapPin size={14} className="animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                {cluster?.location?.district || 'Central'}, Zambia // Node {clusterId?.slice(-4)}
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-black text-white tracking-tighter uppercase leading-none">
              {cluster?.name}
            </h1>
          </div>
          
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
            <ShieldCheck className="text-emerald-400" size={18} />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest">Status</span>
              <span className="text-xs font-bold text-white tracking-wide uppercase">P2P Node Active</span>
            </div>
          </div>
        </div>
      </div>

      <LiveMonitor 
        generation={cluster?.current_generation ?? 0} 
        consumption={cluster?.current_consumption ?? 0} 
      />

      <Tabs defaultValue="overview" className="space-y-10">
        <TabsList className="bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 inline-flex mb-4">
          <TabsTrigger value="overview">Market Analytics</TabsTrigger>
          <TabsTrigger value="simulate">Simulation Engine</TabsTrigger>
          <TabsTrigger value="governance">Governance & Funding</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-3 gap-8 outline-none">
          <div className="lg:col-span-2 space-y-8">
            <FundingChart clusterId={clusterId!} />
            
            <Card variant="glass" padding="lg" className="border-brand-primary/10">
              <div className="flex items-center gap-2 mb-6 text-brand-primary">
                <span className="p-2 bg-brand-primary/10 rounded-lg"><Info size={18} /></span>
                <h3 className="font-display font-bold uppercase tracking-widest text-sm text-white">Cluster Intelligence</h3>
              </div>
              <p className="text-white/70 leading-relaxed text-lg italic opacity-90">
                "{cluster?.description ?? 'No telemetric description available for this community node.'}"
              </p>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card variant="raised" padding="lg" className="border-brand-primary/20 bg-brand-primary/5">
              <div className="flex items-center gap-2 mb-6">
                <Activity size={16} className="text-brand-primary" />
                <h4 className="font-display font-bold text-white uppercase tracking-widest text-xs">Technical Specs</h4>
              </div>
              <div className="space-y-6">
                <Param label="Solar Capacity" value={`${cluster?.target_kw ?? 0} kW`} icon={<Zap size={12}/>} />
                <Param label="Participants" value={cluster?.participant_count ?? 0} />
                <Param label="Token Yield" value="4.2% APY" />
                <Param label="On-Chain ID" value={`0x...${clusterId?.slice(-6).toUpperCase()}`} />
              </div>
            </Card>
          </aside>
        </TabsContent>

        <TabsContent value="simulate" className="outline-none">
          <div className="max-w-3xl mx-auto">
            <SimulationForm clusterData={cluster} />
          </div>
        </TabsContent>

        <TabsContent value="governance" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card variant="glass" padding="lg" className="border-brand-primary/20 bg-brand-primary/5">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-brand-primary/20 rounded-xl text-brand-primary">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl text-white">Node Contribution</h3>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Fund renewable expansion</p>
                  </div>
                </div>
                
                <ContributeForm 
                  clusterId={clusterId!} 
                  onSuccess={handleContributionSuccess} 
                />
              </Card>
            </div>

            <aside className="space-y-6">
               <div className="flex items-center gap-2 px-2 mb-2">
                <History size={14} className="text-brand-primary" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Transaction Log</span>
              </div>
              <ContributionHistory clusterId={clusterId!} key={refreshKey} />
            </aside>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Param({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0 group">
      <div className="flex items-center gap-2">
        {icon && <span className="text-brand-primary/50 group-hover:text-brand-primary transition-colors">{icon}</span>}
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-white font-display font-bold">{value}</span>
    </div>
  );
}