const fetch = require('node-fetch');

class ExchangeRateAPI {
  constructor() {
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
    this.baseUrl = 'https://v6.exchangerate-api.com/v6';
  }

  async getLatestRate(from = 'USD', to = 'ZMW') {
    try {
      const response = await fetch(
        `${this.baseUrl}/${this.apiKey}/latest/${from}`
      );
      const data = await response.json();
      return data.conversion_rates[to];
    } catch (error) {
      console.error('Exchange rate fetch failed:', error);
      return 27.5; // Fallback ZMW per USD
    }
  }

  async convert(amount, from = 'USD', to = 'ZMW') {
    const rate = await this.getLatestRate(from, to);
    return Math.round(amount * rate * 100) / 100;
  }
}

module.exports = new ExchangeRateAPI();
