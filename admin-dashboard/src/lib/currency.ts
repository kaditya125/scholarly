/**
 * Display-layer currency helpers for the admin dashboard.
 *
 * Costs are stored/computed in USD (provider pricing is USD-based). These helpers
 * convert USD amounts to a chosen display currency using live FX rates (fetched via
 * useExchangeRates) with an approximate fallback when live rates are unavailable.
 * Nothing here changes stored data — it is presentation only.
 */

export interface Currency {
  code: string;
  symbol: string;
  locale: string;
  label: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'US Dollar' },
  { code: 'INR', symbol: '₹', locale: 'en-IN', label: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', label: 'Euro' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', label: 'British Pound' },
  { code: 'AED', symbol: 'AED', locale: 'en-AE', label: 'UAE Dirham' },
  { code: 'AUD', symbol: 'A$', locale: 'en-AU', label: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', locale: 'en-CA', label: 'Canadian Dollar' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG', label: 'Singapore Dollar' },
  { code: 'JPY', symbol: '¥', locale: 'ja-JP', label: 'Japanese Yen' },
];

/** Approximate USD-based rates, used only if live rates cannot be fetched. */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1, INR: 83.3, EUR: 0.92, GBP: 0.79, AED: 3.67, AUD: 1.52, CAD: 1.36, SGD: 1.34, JPY: 157,
};

export const DEFAULT_CURRENCY = 'INR';
const STORAGE_KEY = 'admin-cost-currency';

export function getStoredCurrency(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function storeCurrency(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function findCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

/** Convert a USD amount to the target currency using the given rate. */
export function convert(amountUsd: number, rate: number): number {
  return (amountUsd || 0) * (rate || 1);
}

/**
 * Format a USD amount into a display string in the target currency.
 * Small fractional amounts get more decimals so sub-cent costs remain visible.
 */
export function formatMoney(amountUsd: number, currency: Currency, rate: number, fractionDigits?: number): string {
  const value = convert(amountUsd, rate);
  const abs = Math.abs(value);
  const maxFrac = fractionDigits ?? (abs > 0 && abs < 1 ? 4 : 2);
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: Math.min(2, maxFrac),
      maximumFractionDigits: maxFrac,
    }).format(value);
  } catch {
    return `${currency.symbol}${value.toFixed(maxFrac)}`;
  }
}
