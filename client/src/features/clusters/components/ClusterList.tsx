import { useClusters } from "../hooks/useCluster";
import { ClusterCard } from "./ClusterCard";
import { LayoutGrid, Loader2 } from "lucide-react";

export default function ClusterList() {
  const { data: clusters, isLoading, error } = useClusters();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/20">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest">Scanning Grid...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 border border-red-500/20 bg-red-500/5 rounded-2xl text-center">
        <p className="text-red-400 text-sm font-bold">Failed to load clusters</p>
      </div>
    );
  }

  // Fallback to empty array if clusters is undefined
  const clusterData = clusters || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-2">
        <LayoutGrid size={14} className="text-brand-primary" />
        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Available Nodes</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clusterData.map((cluster) => (
          <ClusterCard key={cluster.id} cluster={cluster} />
        ))}
      </div>

      {clusterData.length === 0 && (
        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
          <p className="text-white/20 text-sm italic font-medium">No active clusters found in your area.</p>
        </div>
      )}
    </div>
  );
}
