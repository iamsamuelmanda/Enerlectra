import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const CACHE_KEY = 'zmw_usd_rate';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Free tier API key — replace with your own (sign up at https://www.exchangerate-api.com)
const API_KEY = import.meta.env.VITE_EXCHANGE_RATE_API_KEY;
const DEFAULT_RATE = 19.45; // fallback if API fails

interface ExchangeRateResponse {
  result: string;
  conversion_rates: {
    ZMW: number;
  };
}

export function useExchangeRate() {
  const [rate, setRate] = useState<number>(DEFAULT_RATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRate = useCallback(async () => {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { value, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        setRate(value);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: ExchangeRateResponse = await res.json();

      if (data.result !== 'success' || !data.conversion_rates?.ZMW) {
        throw new Error('Invalid API response');
      }

      const newRate = data.conversion_rates.ZMW;
      setRate(newRate);

      // Cache it
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ value: newRate, timestamp: Date.now() })
      );

      toast.success('Exchange rate updated', { duration: 3000 });
    } catch (err: any) {
      console.error('Exchange rate fetch failed:', err);
      setError('Could not fetch latest rate – using cached value');
      toast.error('Failed to update USD/ZMW rate');
      // Keep using last known rate (or default)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRate();

    // Auto-refresh every 30 minutes
    const interval = setInterval(fetchRate, CACHE_DURATION);
    return () => clearInterval(interval);
  }, [fetchRate]);

  return {
    rate,       // current USD → ZMW rate
    loading,
    error,
    refresh: fetchRate, // manual refresh
  };
}