import { Card } from '../../../components/ui/Card';
import { motion } from 'framer-motion';
import { useClusters } from '../hooks/useClusters';
import { ClusterCard } from './ClusterCard';
import { Skeleton } from '../../../components/ui/Skeleton';

export function ClusterList() {
  const { clusters, loading, error, refresh } = useClusters();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-2">Error: {error}</p>
        <button
          onClick={refresh}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-6 rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <Card variant="glass" padding="lg" className="text-center">
        <p className="text-purple-200 mb-4">No communities found.</p>
        <p className="text-sm text-purple-300">Check back soon or contact the administrator.</p>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {clusters.map((cluster, index) => (
        <motion.div
          key={cluster.id}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: index * 0.1 }}
        >
          <ClusterCard cluster={cluster} />
        </motion.div>
      ))}
    </motion.div>
  );
}