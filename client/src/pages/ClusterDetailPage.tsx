import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { ClusterCard } from '@/components/ClusterCard';
import { ContributeForm } from '@/components/ContributeForm';
import { OwnershipBar } from '@/components/OwnershipBar';
import { SettlementTrace } from '@/components/SettlementTrace';
import { EnergyEntryForm } from '@/energy/components/EnergyEntryForm';
import { useAuth } from '@/hooks/useAuth';
import { useCluster } from '@/features/clusters/hooks/useCluster'; // assume this exists or create it
import { useIsParticipant } from '@/features/clusters/hooks/useIsParticipant'; // new hook below
import { ArrowLeft, Zap, Users, BarChart3, FileText } from 'lucide-react';

export default function ClusterDetailPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cluster, loading: clusterLoading, error: clusterError } = useCluster(clusterId!);
  const { isParticipant, loading: participantLoading } = useIsParticipant(user?.id, clusterId!);
  const [activeTab, setActiveTab] = useState('overview');

  if (clusterLoading || participantLoading) {
    return (
      <div className="page-container py-20 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (clusterError || !cluster) {
    return (
      <div className="page-container py-20 text-center">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Cluster not found</h2>
        <button
          onClick={() => navigate('/clusters')}
          className="btn-primary px-8 py-3"
        >
          Back to Communities
        </button>
      </div>
    );
  }

  return (
    <div className="page-container py-8 lg:py-12">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <button
            onClick={() => navigate('/clusters')}
            className="text-[var(--brand-primary)] hover:underline flex items-center gap-2 mb-4 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Communities
          </button>
          <h1 className="text-3xl lg:text-4xl font-bold">{cluster.name}</h1>
        </div>

        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </div>

      {/* Main cluster summary card */}
      <ClusterCard cluster={cluster} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10">
        <TabsList className="glass mb-8 w-full overflow-x-auto flex justify-start">
          <TabsTrigger value="overview">
            <Zap className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="contribute">
            <DollarSign className="w-4 h-4 mr-2" />
            Contribute
          </TabsTrigger>
          <TabsTrigger value="ownership">
            <Users className="w-4 h-4 mr-2" />
            Ownership
          </TabsTrigger>
          <TabsTrigger value="settlement">
            <BarChart3 className="w-4 h-4 mr-2" />
            Settlement
          </TabsTrigger>
          {isParticipant && (
            <TabsTrigger value="my-meter">
              <FileText className="w-4 h-4 mr-2" />
              My Meter
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-10">
          {/* Add overview content here (stats, description, etc.) */}
          <Card className="p-8">
            <h3 className="text-xl font-semibold mb-6">Cluster Details</h3>
            <p className="text-[var(--text-secondary)]">
              This is a placeholder overview section. Add description, milestones, or quick stats here.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="contribute">
          <ContributeForm clusterId={clusterId!} />
        </TabsContent>

        <TabsContent value="ownership">
          <OwnershipBar clusterId={clusterId!} />
        </TabsContent>

        <TabsContent value="settlement">
          <SettlementTrace clusterId={clusterId!} date={format(new Date(), 'yyyy-MM-dd')} />
        </TabsContent>

        {isParticipant && (
          <TabsContent value="my-meter">
            <div className="space-y-6">
              <h3 className="text-xl font-semibold flex items-center gap-3">
                <FileText className="w-6 h-6 text-[var(--brand-primary)]" />
                Submit Your Meter Reading
              </h3>
              <EnergyEntryForm
                clusterId={clusterId!}
                onSuccess={() => toast.success('Reading submitted successfully')}
              />
              <p className="text-sm text-[var(--text-muted)]">
                Submit your latest meter reading. Data is used for accurate settlement and ownership calculation.
              </p>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}