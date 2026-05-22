/**
 * Money handling. All amounts are stored and computed as integers in minor
 * units (cents). Conversion to/from decimal strings only at the IO boundary.
 *
 * Using `number` (safe to ~9e15 minor units) rather than `bigint` for ergonomics.
 * That covers ~$90 trillion in cents — far above realistic personal-finance use.
 */

export const MAX_MINOR = Number.MAX_SAFE_INTEGER;

const DECIMALS_BY_CURRENCY: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  INR: 2,
  PKR: 2,
  JPY: 0,
  KRW: 0,
};

export function decimalsForCurrency(currency: string): number {
  return DECIMALS_BY_CURRENCY[currency.toUpperCase()] ?? 2;
}

/**
 * Parse a user-entered amount string (e.g. "1,234.56") into minor units.
 * Returns null when input is empty or invalid.
 */
export function parseAmount(input: string, currency = 'USD'): number | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (trimmed === '') return null;

  // Strip thousands separators and currency symbols. Keep one decimal point.
  const cleaned = trimmed.replace(/[\s,_$£€¥₹]/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;

  const decimals = decimalsForCurrency(currency);
  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ''] = body.split('.');

  // Pad/truncate fractional digits to currency precision.
  const fractionPadded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  const minorString = (whole || '0') + fractionPadded;
  const minor = Number(minorString);
  if (!Number.isFinite(minor)) return null;
  if (minor > MAX_MINOR) return null;

  return negative ? -minor : minor;
}

/**
 * Plain decimal string without grouping separators. Suitable as the `value`
 * of a native `<input type="number">`, which rejects strings containing
 * commas and renders blank.
 */
export function formatAmountPlain(minor: number, currency = 'USD'): string {
  if (!Number.isFinite(minor)) return '';
  const decimals = decimalsForCurrency(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const factor = 10 ** decimals;
  const whole = Math.floor(abs / factor);
  const fraction = abs - whole * factor;
  if (decimals === 0) return sign + String(whole);
  const fractionString = String(fraction).padStart(decimals, '0');
  return sign + String(whole) + '.' + fractionString;
}

/**
 * Format minor-unit value as a user-readable string. Adds grouping separators
 * but no currency symbol (caller decides where to place the symbol).
 */
export function formatAmount(minor: number, currency = 'USD'): string {
  if (!Number.isFinite(minor)) return '—';
  const decimals = decimalsForCurrency(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const factor = 10 ** decimals;
  const whole = Math.floor(abs / factor);
  const fraction = abs - whole * factor;
  const wholeFormatted = whole.toLocaleString('en-US');
  if (decimals === 0) return sign + wholeFormatted;
  const fractionString = String(fraction).padStart(decimals, '0');
  return sign + wholeFormatted + '.' + fractionString;
}

const SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  PKR: '₨',
  KRW: '₩',
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase() + ' ';
}

export function formatMoney(minor: number, currency = 'USD'): string {
  const symbol = currencySymbol(currency);
  const formatted = formatAmount(minor, currency);
  if (formatted.startsWith('-')) {
    return '-' + symbol + formatted.slice(1);
  }
  return symbol + formatted;
}
