import { useLogStore } from '../../store/logStore';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export function LogPanel() {
  const { logs, clearLogs } = useLogStore();
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-purple-600 text-white p-3 rounded-full shadow-lg hover:bg-purple-700 transition z-50"
        title="View logs"
      >
        <span className="sr-only">Logs</span>
        <div className="relative">
          <Info className="w-5 h-5" />
          {logs.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {logs.length}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-gray-900 border border-white/20 rounded-lg shadow-xl z-50 flex flex-col">
      <div className="flex justify-between items-center p-3 border-b border-white/10">
        <h3 className="font-semibold text-white">Activity Log</h3>
        <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-80">
        {logs.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">No logs yet</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="text-xs border-l-2 border-white/10 pl-2 py-1">
              <div className="flex items-start gap-1">
                {getIcon(log.type)}
                <span className={`flex-1 ${log.type === 'error' ? 'text-red-300' : log.type === 'success' ? 'text-green-300' : 'text-white/80'}`}>
                  {log.message}
                </span>
                <span className="text-white/40 whitespace-nowrap">
                  {log.timestamp.toLocaleTimeString()}
                </span>
              </div>
              {log.details && (
                <pre className="mt-1 text-white/40 text-[10px] overflow-x-auto">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
      <div className="p-2 border-t border-white/10">
        <button
          onClick={clearLogs}
          className="text-xs text-white/60 hover:text-white transition"
        >
          Clear logs
        </button>
      </div>
    </div>
  );
}