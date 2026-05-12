import { describe, it, expect } from 'vitest';
import {
  validateName,
  validateNonNegativeAmount,
  validateYear,
  validateCurrency,
  validateDateRange,
  validatePeriodOverlap,
  validateAssignmentTotal,
  rangesOverlap,
} from '../src/domain/validation';

describe('validateName', () => {
  it('rejects empty', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
  it('accepts normal', () => {
    expect(validateName('Food').ok).toBe(true);
  });
  it('rejects too long', () => {
    expect(validateName('x'.repeat(81)).ok).toBe(false);
  });
});

describe('validateNonNegativeAmount', () => {
  it('rejects negative', () => {
    expect(validateNonNegativeAmount(-1).ok).toBe(false);
  });
  it('accepts zero and positive', () => {
    expect(validateNonNegativeAmount(0).ok).toBe(true);
    expect(validateNonNegativeAmount(100).ok).toBe(true);
  });
  it('rejects NaN', () => {
    expect(validateNonNegativeAmount(NaN).ok).toBe(false);
  });
});

describe('validateYear', () => {
  it('accepts plausible years', () => {
    expect(validateYear(2026).ok).toBe(true);
  });
  it('rejects nonsense', () => {
    expect(validateYear(99).ok).toBe(false);
    expect(validateYear(3000).ok).toBe(false);
    expect(validateYear(2026.5).ok).toBe(false);
  });
});

describe('validateCurrency', () => {
  it('accepts USD', () => {
    expect(validateCurrency('USD').ok).toBe(true);
  });
  it('rejects empty/short/long', () => {
    expect(validateCurrency('').ok).toBe(false);
    expect(validateCurrency('US').ok).toBe(false);
    expect(validateCurrency('USDOLLAR').ok).toBe(false);
  });
  it('rejects non-letters', () => {
    expect(validateCurrency('US1').ok).toBe(false);
  });
});

describe('validateDateRange', () => {
  it('rejects invalid dates', () => {
    expect(validateDateRange('2026-13-01', '2026-12-31').ok).toBe(false);
  });
  it('rejects start after end', () => {
    expect(validateDateRange('2026-02-01', '2026-01-01').ok).toBe(false);
  });
  it('accepts equal dates (single-day period)', () => {
    expect(validateDateRange('2026-01-01', '2026-01-01').ok).toBe(true);
  });
  it('accepts ascending range', () => {
    expect(validateDateRange('2026-01-01', '2026-01-31').ok).toBe(true);
  });
});

describe('rangesOverlap / validatePeriodOverlap', () => {
  const existing = [
    { start_date: '2026-01-01', end_date: '2026-01-31' },
    { start_date: '2026-03-01', end_date: '2026-03-31' },
  ];

  it('detects exact overlap', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-31', existing)).toBe(true);
  });

  it('detects partial overlap on left', () => {
    expect(rangesOverlap('2025-12-15', '2026-01-15', existing)).toBe(true);
  });

  it('detects partial overlap on right', () => {
    expect(rangesOverlap('2026-01-15', '2026-02-15', existing)).toBe(true);
  });

  it('detects same-day boundary overlap (inclusive)', () => {
    // New period ending on the same day an existing one starts overlaps.
    expect(rangesOverlap('2025-12-15', '2026-01-01', existing)).toBe(true);
  });

  it('allows fully outside ranges', () => {
    expect(rangesOverlap('2026-02-01', '2026-02-28', existing)).toBe(false);
    expect(validatePeriodOverlap('2026-02-01', '2026-02-28', existing).ok).toBe(true);
  });

  it('reports overlap as a validation failure', () => {
    expect(validatePeriodOverlap('2026-01-01', '2026-01-31', existing).ok).toBe(false);
  });
});

describe('validateAssignmentTotal', () => {
  it('rejects negative total', () => {
    expect(validateAssignmentTotal(1000, -1, false).ok).toBe(false);
  });
  it('blocks over-assignment when not allowed', () => {
    expect(validateAssignmentTotal(1000, 1500, false).ok).toBe(false);
  });
  it('permits over-assignment when allowed', () => {
    expect(validateAssignmentTotal(1000, 1500, true).ok).toBe(true);
  });
  it('allows full assignment', () => {
    expect(validateAssignmentTotal(1000, 1000, false).ok).toBe(true);
  });
  it('allows partial assignment (rest goes to General)', () => {
    expect(validateAssignmentTotal(1000, 400, false).ok).toBe(true);
  });
});
