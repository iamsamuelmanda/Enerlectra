// Visual stake breakdown per cluster participant
import { useOwnership } from '../hooks/useOwnership';

interface Props {
  clusterId: string;
}

const COLOURS = [
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-sky-500', 'bg-indigo-500', 'bg-violet-500',
];

export function OwnershipBar({ clusterId }: Props) {
  const { ownership, loading, error } = useOwnership(clusterId);

  if (loading) return <div className="h-6 rounded-full bg-white/10 animate-pulse" />;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;
  if (!ownership.length) return <p className="text-white/40 text-sm">No ownership data.</p>;

  return (
    <div className="space-y-3">
      <div className="flex rounded-full overflow-hidden h-5 w-full gap-px">
        {ownership.map((entry, i) => (
          <div
            key={entry.participant_id}
            className={`${COLOURS[i % COLOURS.length]} transition-all`}
            style={{ width: `${entry.ownership_percent}%` }}
            title={`${entry.display_name}: ${entry.ownership_percent.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {ownership.map((entry, i) => (
          <div key={entry.participant_id} className="flex items-center gap-1.5 text-xs text-white/70">
            <span className={`w-2.5 h-2.5 rounded-full ${COLOURS[i % COLOURS.length]}`} />
            <span>{entry.display_name}</span>
            <span className="text-white/40">{entry.ownership_percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
