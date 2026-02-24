/**
 * Exchange Rate Hook
 * Fetches and updates USD to ZMW rate
 */

import { useState, useEffect } from 'react';
import { marketplaceApi } from '../services/marketplaceApi';

export function useExchangeRate() {
  const [rate, setRate] = useState(27.5);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRate = async () => {
    try {
      const newRate = await marketplaceApi.getExchangeRate();
      setRate(newRate);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchRate();

    // Update every 30 seconds
    const interval = setInterval(fetchRate, 30000);

    return () => clearInterval(interval);
  }, []);

  const convertToZMW = (usd: number): number => {
    return usd * rate;
  };

  const convertToUSD = (zmw: number): number => {
    return zmw / rate;
  };

  return {
    rate,
    loading,
    lastUpdated,
    convertToZMW,
    convertToUSD,
    refresh: fetchRate,
  };
}