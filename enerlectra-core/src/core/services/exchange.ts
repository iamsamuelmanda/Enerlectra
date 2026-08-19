import { logger } from './logger.js';

export async function getLiveExchangeRate(): Promise<number> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY not configured');
  const axios = (await import('axios')).default;
  const res = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
  const rate = res.data?.conversion_rates?.ZMW;
  if (!rate) throw new Error('Invalid exchange rate response');
  return rate;
}
