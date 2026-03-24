import { motion } from 'framer-motion';
import { useClusters } from '../hooks/useCluster';
import { ClusterCard } from './ClusterCard';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Globe, ShieldCheck } from 'lucide-react';

export function ClusterList() {
  const { clusters, loading, error } = useClusters();

  return (
    <section className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-glass pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-brand-primary">
            <Globe size={16} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Global Network</span>
          </div>
          <h1 className="text-5xl font-display font-black tracking-tighter text-white">Active Communities</h1>
          <p className="text-muted text-lg max-w-xl">
            Verified energy clusters generating peer-to-peer value across Zambia.
          </p>
        </div>
        
        <div className="glass px-6 py-4 rounded-2xl border-emerald-500/20 flex items-center gap-4">
          <ShieldCheck className="text-emerald-400" size={24} />
          <div>
            <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Network Capacity</p>
            <p className="text-xl font-display font-bold text-white">1.28 <span className="text-sm text-emerald-400">MW/h</span></p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[450px] rounded-[2rem] glass" />)}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {clusters.map((cluster: any) => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </motion.div>
      )}
    </section>
  );
}
