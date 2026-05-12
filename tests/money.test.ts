import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  formatAmount,
  formatMoney,
  decimalsForCurrency,
} from '../src/utils/money';

describe('parseAmount', () => {
  it('parses whole-dollar amount', () => {
    expect(parseAmount('100', 'USD')).toBe(10000);
  });
  it('parses decimal amount', () => {
    expect(parseAmount('1234.56', 'USD')).toBe(123456);
  });
  it('handles thousands separators and currency symbol', () => {
    expect(parseAmount('$1,234.56', 'USD')).toBe(123456);
  });
  it('pads short fractional digits', () => {
    expect(parseAmount('1.5', 'USD')).toBe(150);
  });
  it('truncates extra fractional digits', () => {
    expect(parseAmount('1.999', 'USD')).toBe(199);
  });
  it('returns null for empty', () => {
    expect(parseAmount('', 'USD')).toBeNull();
    expect(parseAmount('   ', 'USD')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseAmount('abc', 'USD')).toBeNull();
    expect(parseAmount('--5', 'USD')).toBeNull();
  });
  it('handles JPY (zero decimals)', () => {
    expect(parseAmount('100', 'JPY')).toBe(100);
    expect(parseAmount('100.99', 'JPY')).toBe(100);
  });
  it('parses negative', () => {
    expect(parseAmount('-50.00', 'USD')).toBe(-5000);
  });
});

describe('formatAmount', () => {
  it('formats whole dollars', () => {
    expect(formatAmount(1000000, 'USD')).toBe('10,000.00');
  });
  it('formats with cents', () => {
    expect(formatAmount(123456, 'USD')).toBe('1,234.56');
  });
  it('formats zero', () => {
    expect(formatAmount(0, 'USD')).toBe('0.00');
  });
  it('formats negative', () => {
    expect(formatAmount(-5000, 'USD')).toBe('-50.00');
  });
  it('formats JPY without decimals', () => {
    expect(formatAmount(1000, 'JPY')).toBe('1,000');
  });
});

describe('formatMoney', () => {
  it('prefixes with currency symbol', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(123456, 'GBP')).toBe('£1,234.56');
  });
  it('moves the symbol after the negative sign', () => {
    expect(formatMoney(-5000, 'USD')).toBe('-$50.00');
  });
});

describe('decimalsForCurrency', () => {
  it('returns 2 for USD/EUR/GBP', () => {
    expect(decimalsForCurrency('USD')).toBe(2);
    expect(decimalsForCurrency('eur')).toBe(2);
  });
  it('returns 0 for JPY', () => {
    expect(decimalsForCurrency('JPY')).toBe(0);
  });
  it('defaults to 2 for unknown', () => {
    expect(decimalsForCurrency('XXX')).toBe(2);
  });
});

describe('roundtrip', () => {
  it('parse → format yields same string for valid input', () => {
    const inputs = ['0', '1', '1.50', '1234.56', '0.01', '999999.99'];
    for (const input of inputs) {
      const minor = parseAmount(input, 'USD');
      expect(minor).not.toBeNull();
      const formatted = formatAmount(minor!, 'USD');
      // Compare numerical equality: re-parse and check.
      expect(parseAmount(formatted, 'USD')).toBe(minor);
    }
  });
});
