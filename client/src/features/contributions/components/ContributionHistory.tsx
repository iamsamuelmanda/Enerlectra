// client/src/features/contributions/components/ContributionHistory.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { contributionService } from '../services/contributionService';
import { Contribution } from '../../../types/contribution';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Users, Calendar, Award } from 'lucide-react';
import { formatDate } from '../../../utils/dateTime';

interface ContributionHistoryProps {
  clusterId: string;
}

export function ContributionHistory({ clusterId }: ContributionHistoryProps) {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadContributions();

    const subscription = supabase
      .channel('contributions')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'contributions', 
          filter: `cluster_id=eq.${clusterId}` 
        },
        (payload) => {
          if (payload.new.status === 'COMPLETED') {
            const newContrib = payload.new as Contribution;
            setContributions(prev => [newContrib, ...prev]);
            setTotal(prev => prev + (newContrib.amount_usd || 0));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [clusterId]);

  async function loadContributions() {
    try {
      const data = await contributionService.getContributionsByCluster(clusterId);
      setContributions(data);
      const totalUSD = data.reduce((sum, c) => sum + (c.amount_usd || 0), 0);
      setTotal(totalUSD);
    } catch (error) {
      console.error('Error loading contributions:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card variant="glass" padding="md">
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" padding="md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Contributors</h3>
        </div>
        <span className="bg-purple-600/30 text-purple-200 px-3 py-1 rounded-full text-sm">
          Total: ${total.toLocaleString()}
        </span>
      </div>

      {contributions.length === 0 ? (
        <div className="text-center py-6 text-purple-300">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No contributions yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {contributions.map((c) => (
            <div key={c.id} className="border-b border-white/10 pb-3 last:border-0">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-white">
                    {c.user_id.substring(0, 8)}...
                  </p>
                  <div className="flex items-center gap-2 text-xs text-purple-300 mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(c.created_at, 'MMM d, yyyy')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-semibold text-white">${c.amount_usd}</span>
                  {c.early_investor_bonus > 1 && (
                    <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                      <Award className="w-3 h-3" />
                      <span>x{c.early_investor_bonus}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
