class CurrencyService {
  private inrRate: number = 83.5; // Fallback
  private lastFetch: number = 0;
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  async getUsdToInrRate(): Promise<number> {
    const now = Date.now();
    if (now - this.lastFetch > this.CACHE_TTL_MS) {
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates && data.rates.INR) {
            this.inrRate = data.rates.INR;
            this.lastFetch = now;
            console.log(`[CURRENCY] Fetched live USD->INR rate: ₹${this.inrRate}`);
          }
        }
      } catch (e) {
        console.error('[CURRENCY] Failed to fetch live exchange rate, using fallback.', e);
      }
    }
    return this.inrRate;
  }

  async convertUsdToInr(usd: number): Promise<number> {
    const rate = await this.getUsdToInrRate();
    return usd * rate;
  }
}

export const currencyService = new CurrencyService();
