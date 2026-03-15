const EXCHANGE_RATE_API_KEY = 'e59cedb6057afc86cd879862'; 
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

export interface ExchangeRateResponse {
  result: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  target_code: string;
  conversion_rate: number;
}

class ExchangeRateService {
  private cache: {
    rate: number | null;
    timestamp: number | null;
    nextUpdate: number | null;
  } = {
    rate: null,
    timestamp: null,
    nextUpdate: null,
  };

  async getUSDToZMWRate(): Promise<{
    rate: number;
    lastUpdated: Date;
    nextUpdate: Date;
  }> {
    // Return cached rate if still valid
    if (this.cache.rate && this.cache.nextUpdate && Date.now() < this.cache.nextUpdate) {
      return {
        rate: this.cache.rate,
        lastUpdated: new Date(this.cache.timestamp!),
        nextUpdate: new Date(this.cache.nextUpdate),
      };
    }

    try {
      const response = await fetch(
        `${BASE_URL}/${EXCHANGE_RATE_API_KEY}/latest/USD`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch exchange rate');
      }

      const data = await response.json();
      
      // ZMW conversion rate from USD
      const rate = data.conversion_rates.ZMW;
      
      // Cache the result
      this.cache = {
        rate,
        timestamp: Date.now(),
        nextUpdate: data.time_next_update_unix * 1000, // Convert to milliseconds
      };

      return {
        rate,
        lastUpdated: new Date(data.time_last_update_unix * 1000),
        nextUpdate: new Date(data.time_next_update_unix * 1000),
      };
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      
      // Fallback to hardcoded rate if API fails
      const fallbackRate = 22.5;
      return {
        rate: fallbackRate,
        lastUpdated: new Date(),
        nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours later
      };
    }
  }

  // Convert USD to ZMW
  async usdToZmw(usd: number): Promise<number> {
    const { rate } = await this.getUSDToZMWRate();
    return usd * rate;
  }

  // Convert ZMW to USD
  async zmwToUsd(zmw: number): Promise<number> {
    const { rate } = await this.getUSDToZMWRate();
    return zmw / rate;
  }
}

export const exchangeRateService = new ExchangeRateService();
