import { useEffect, useState } from 'react';

export type TemporalBand = 'peak' | 'standard' | 'off-peak';

export interface MarketState {
  fxRate: number | null;
  liveFx: boolean;
  currentPremium: number;
  temporalBand: TemporalBand;
  zescoReferenceRate: number | null;
  zescoTariffCode: string | null;
  zescoTariffBand: string | null;
  zescoTariffValidFrom: string | null;
  zescoTariffValidTo: string | null;
  lastPcuPriceKz: number | null;
  lastPcuWindowAt: string | null;
  timestamp: string | null;
}

interface UseMarketStateResult {
  market: MarketState | null;
  error: boolean;
  lastUpdatedAt: Date | null;
}

export function useMarketState(): UseMarketStateResult {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        const apiBaseFromEnv = import.meta.env.VITE_API_URL as
          | string
          | undefined;

        // Your backend route is GET /api/protocol/market-state
        const base = (apiBaseFromEnv ||
          'https://enerlectra-backend.onrender.com'
        ).replace(/\/api$/, '');

        const res = await fetch(`${base}/api/protocol/market-state`);
        if (!res.ok) throw new Error('bad response');

        const data = await res.json();

        setMarket({
          fxRate: data.fxRate ?? null,
          liveFx: !!data.liveFx,
          currentPremium: data.currentPremium ?? 1.0,
          temporalBand: (data.temporalBand as TemporalBand) ?? 'standard',
          zescoReferenceRate: data.zescoReferenceRate ?? null,
          zescoTariffCode: data.zescoTariffCode ?? null,
          zescoTariffBand: data.zescoTariffBand ?? null,
          zescoTariffValidFrom: data.zescoTariffValidFrom ?? null,
          zescoTariffValidTo: data.zescoTariffValidTo ?? null,
          lastPcuPriceKz: data.lastPcuPriceKz ?? null,
          lastPcuWindowAt: data.lastPcuWindowAt ?? null,
          timestamp: data.timestamp ?? null,
        });
        setError(false);
      } catch {
        setError(true);
        setMarket(prev =>
          prev
            ? {
                ...prev,
                liveFx: false,
              }
            : null
        );
      }
    };

    fetchMarket();
    const interval = setInterval(fetchMarket, 60_000);
    return () => clearInterval(interval);
  }, []);

  const lastUpdatedAt =
    market?.timestamp ? new Date(market.timestamp) : null;

  return { market, error, lastUpdatedAt };
}
