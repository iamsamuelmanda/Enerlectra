import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Cluster } from '../../../types/api';
import { Card } from '../../../components/ui/Card';
import { Calendar, Target, Trophy } from 'lucide-react';
import { daysRemaining, isDeadlinePassed, formatDate } from '../../../utils/dateTime';

interface CampaignProgressProps {
  cluster: Cluster;
}

export function CampaignProgress({ cluster }: CampaignProgressProps) {
  const [currentUSD, setCurrentUSD] = useState<number>(cluster.current_usd ?? 0);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (!cluster.deadline) return;

    const updateTime = () => {
      const days = daysRemaining(cluster.deadline!);
      setTimeRemaining(days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : 'Deadline passed');
    };

    updateTime();
    const timer = setInterval(updateTime, 60 * 1000);

    const subscription = supabase
      .channel('cluster-updates')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clusters', filter: `id=eq.${cluster.clusterId}` },
        (payload) => { setCurrentUSD(payload.new.current_usd ?? 0); }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      clearInterval(timer);
    };
  }, [cluster.clusterId, cluster.deadline]);

  // Campaign fields are optional — show placeholder if backend hasn't provided them yet
  if (!cluster.target_usd || !cluster.deadline) {
    return (
      <Card variant="glass" padding="md">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Campaign Progress</h3>
        </div>
        <p className="text-sm text-white/40">
          Campaign data not yet available for this cluster.
        </p>
      </Card>
    );
  }

  const percentComplete = (currentUSD / cluster.target_usd) * 100;
  const deadlinePassed = isDeadlinePassed(cluster.deadline);

  return (
    <Card variant="glass" padding="md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Campaign Progress</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-purple-300">Deadline</p>
          <p className="text-sm font-medium">{formatDate(cluster.deadline, 'MMM d, yyyy')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-purple-200">${currentUSD.toLocaleString()}</span>
            <span className="text-purple-200">Goal: ${cluster.target_usd.toLocaleString()}</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-4">
            <div
              className="bg-gradient-to-r from-purple-600 to-indigo-600 h-4 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(percentComplete, 100)}%` }}
            />
          </div>
          <p className="text-right text-sm mt-1 text-purple-300">
            {percentComplete.toFixed(1)}% complete
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-purple-300" />
            <span className="text-purple-200">Time remaining</span>
          </div>
          <span className={`font-semibold ${deadlinePassed ? 'text-red-400' : 'text-green-400'}`}>
            {timeRemaining}
          </span>
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-purple-300" />
            <h4 className="text-sm font-semibold">Milestones</h4>
          </div>
          <div className="space-y-2">
            {[
              { threshold: 40, label: 'Feasibility & quote' },
              { threshold: 70, label: 'Panel procurement' },
              { threshold: 100, label: 'Battery expansion' },
            ].map((milestone) => (
              <div key={milestone.threshold} className="flex items-center">
                <div className={`w-4 h-4 rounded-full mr-2 ${
                  percentComplete >= milestone.threshold ? 'bg-green-500' : 'bg-white/20'
                }`} />
                <span className="text-sm text-purple-200">{milestone.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}