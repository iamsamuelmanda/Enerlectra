import { useExchangeRate } from '../../hooks/useExchangeRate';
import { useState, useEffect } from 'react';

export default function ExchangeRateDisplay() {
  const { rate, loading, lastUpdated } = useExchangeRate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {/* Live Clock */}
      <div className="flex items-center gap-2 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
        </svg>
        <span className="font-mono font-bold text-white">{time}</span>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
        </svg>
        <span className="font-semibold text-white">{date}</span>
      </div>

      {/* Exchange Rate */}
      <div className="flex items-center gap-2 bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
        </svg>
        {loading ? (
          <span className="text-slate-400">Loading rate...</span>
        ) : (
          <span className="font-bold text-green-400">
            1 USD = {rate.toFixed(2)} ZMW
          </span>
        )}
        <span className="text-xs text-green-500 font-semibold animate-pulse">● Live</span>
      </div>

      {lastUpdated && (
        <span className="text-xs text-slate-500">
          Updated {lastUpdated.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
