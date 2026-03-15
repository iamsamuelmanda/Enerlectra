import { useState, useEffect } from 'react';
import { exchangeRateService } from '../../services/exchangeRate';
import { formatShortDateTime } from '../../utils/dateTime';
import { Card } from './Card';
import { RefreshCw } from 'lucide-react';

export function ExchangeRateDisplay() {
  const [rateInfo, setRateInfo] = useState<{
    rate: number;
    lastUpdated: Date;
    nextUpdate: Date;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRate();
    const interval = setInterval(loadRate, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadRate = async () => {
    try {
      const info = await exchangeRateService.getUSDToZMWRate();
      setRateInfo(info);
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" padding="sm" className="animate-pulse">
        <div className="h-12 bg-white/10 rounded" />
      </Card>
    );
  }

  if (!rateInfo) return null;

  return (
    <Card variant="glass" padding="sm" className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-purple-400 animate-spin-slow" />
        <div>
          <p className="text-sm text-purple-200">USD → ZMW</p>
          <p className="text-xl font-bold text-white">1 USD = {rateInfo.rate.toFixed(2)} ZMW</p>
        </div>
      </div>
      <div className="text-right text-xs text-purple-400">
        <p>Updated: {formatShortDateTime(rateInfo.lastUpdated)}</p>
        <p>Next: {formatShortDateTime(rateInfo.nextUpdate)}</p>
      </div>
    </Card>
  );
}