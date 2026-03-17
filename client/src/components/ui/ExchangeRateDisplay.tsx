// ─── ExchangeRateDisplay ─────────────────────────────────────
import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { exchangeRateService } from '../../services/exchangeRate';
import { formatShortDateTime } from '../../utils/dateTime';

export function ExchangeRateDisplay() {
  const [rateInfo, setRateInfo] = useState<{
    rate: number;
    lastUpdated: Date;
    nextUpdate: Date;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    loadRate();
    const interval = setInterval(loadRate, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadRate = async () => {
    setSpinning(true);
    try {
      const info = await exchangeRateService.getUSDToZMWRate();
      setRateInfo(info);
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 800);
    }
  };

  if (loading) {
    return (
      <div className="skeleton h-[72px] rounded-2xl" />
    );
  }

  if (!rateInfo) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-2xl"
      style={{
        background: 'rgba(102, 126, 234, 0.08)',
        border: '1px solid rgba(102, 126, 234, 0.2)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(102, 126, 234, 0.15)' }}
        >
          <TrendingUp size={14} style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: 'rgba(240,240,255,0.45)', letterSpacing: '0.05em' }}>
            USD → ZMW
          </p>
          <p className="font-display font-bold text-lg leading-none" style={{ color: '#f0f0ff' }}>
            1 USD = {rateInfo.rate.toFixed(2)} ZMW
          </p>
        </div>
      </div>
      <div className="text-right flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <div className="live-dot" />
          <span className="text-xs font-medium" style={{ color: '#34d399' }}>Live</span>
        </div>
        <button
          onClick={loadRate}
          className="flex items-center gap-1 text-xs"
          style={{ color: 'rgba(240,240,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <RefreshCw size={10} className={spinning ? 'animate-spin' : ''} />
          {formatShortDateTime(rateInfo.lastUpdated)}
        </button>
      </div>
    </div>
  );
}