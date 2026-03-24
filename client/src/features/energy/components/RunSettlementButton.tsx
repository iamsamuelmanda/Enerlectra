import { useState } from 'react';
import { apiPost } from '../../../lib/api';

interface Props {
  clusterId: string;
  date: string;
  onSuccess?: () => void;
}

export function RunSettlementButton({ clusterId, date, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiPost<{ job_id: string }>('/settlement/run', {
        cluster_id: clusterId,
        date,
      });
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRun}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
      >
        {loading ? 'Running…' : 'Run Settlement'}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
