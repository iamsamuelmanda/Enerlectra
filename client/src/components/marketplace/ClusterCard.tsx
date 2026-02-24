/**
 * Cluster Card Component
 * Displays individual cluster information
 */

import { Cluster } from '../../services/supabase';

interface ClusterCardProps {
  cluster: Cluster;
  selected: boolean;
  onSelect: () => void;
}

export default function ClusterCard({ cluster, selected, onSelect }: ClusterCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`
        bg-white border-2 rounded-xl p-6 cursor-pointer transition-all
        hover:shadow-lg hover:-translate-y-1
        ${selected 
          ? 'border-purple-500 bg-gradient-to-br from-gray-50 to-gray-100' 
          : 'border-gray-200 hover:border-purple-400'
        }
      `}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {cluster.name}
        </h3>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
          {cluster.id.substring(0, 8)}...
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs uppercase text-gray-600 font-medium mb-1">
            Target Solar
          </p>
          <p className="text-xl font-bold text-gray-900">
            {cluster.target_solar_kw} kW
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-600 font-medium mb-1">
            Target Storage
          </p>
          <p className="text-xl font-bold text-gray-900">
            {cluster.target_storage_kwh} kWh
          </p>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`
          w-full py-2 px-4 rounded-lg font-semibold transition-all
          ${selected
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-gradient-to-r from-purple-600 to-purple-800 text-white hover:shadow-md'
          }
        `}
      >
        {selected ? '✓ Selected' : 'Select Community'}
      </button>
    </div>
  );
}