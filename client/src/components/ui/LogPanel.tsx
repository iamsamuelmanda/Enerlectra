import { useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle, Terminal, ChevronDown } from 'lucide-react';
import { useLogStore } from '../../store/logStore';

const icons = {
  error:   <AlertCircle   size={12} style={{ color: '#f87171', flexShrink: 0 }} />,
  success: <CheckCircle   size={12} style={{ color: '#34d399', flexShrink: 0 }} />,
  warning: <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />,
  info:    <Info          size={12} style={{ color: '#60a5fa', flexShrink: 0 }} />,
};

const textColors = {
  error:   '#fca5a5',
  success: '#6ee7b7',
  warning: '#fcd34d',
  info:    'rgba(240,240,255,0.7)',
};

export function LogPanel() {
  const { logs, clearLogs } = useLogStore();
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = logs.length;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{
          background: 'rgba(13, 13, 26, 0.9)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          color: 'rgba(240,240,255,0.6)',
          fontSize: '0.75rem',
          fontWeight: 500,
        }}
      >
        <Terminal size={14} style={{ color: '#a78bfa' }} />
        <span>Logs</span>
        {unreadCount > 0 && (
          <span
            className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', minWidth: '16px' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl overflow-hidden"
      style={{
        width: '380px',
        maxHeight: '420px',
        background: 'rgba(10, 10, 20, 0.96)',
        border: '1px solid rgba(102, 126, 234, 0.2)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} style={{ color: '#a78bfa' }} />
          <span className="text-sm font-semibold" style={{ color: '#f0f0ff', fontFamily: 'Outfit, sans-serif' }}>
            Activity Log
          </span>
          {unreadCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
              style={{ background: 'rgba(102,126,234,0.2)', color: '#a78bfa' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearLogs}
            className="text-xs px-2 py-1 rounded-lg transition-all"
            style={{ color: 'rgba(240,240,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(240,240,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,240,255,0.3)')}
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{ color: 'rgba(240,240,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 log-panel" style={{ background: 'transparent' }}>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Terminal size={20} style={{ color: 'rgba(240,240,255,0.15)' }} />
            <p className="text-xs" style={{ color: 'rgba(240,240,255,0.25)' }}>No activity yet</p>
          </div>
        ) : (
          [...logs].reverse().map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              {icons[log.type as keyof typeof icons] ?? icons.info}
              <span
                className="flex-1 text-xs leading-relaxed"
                style={{ color: textColors[log.type as keyof typeof textColors] ?? textColors.info, fontFamily: 'DM Mono, monospace' }}
              >
                {log.message}
              </span>
              <span
                className="text-[10px] whitespace-nowrap flex-shrink-0"
                style={{ color: 'rgba(240,240,255,0.2)', fontFamily: 'DM Mono, monospace' }}
              >
                {log.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}