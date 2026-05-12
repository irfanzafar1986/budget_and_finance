/**
 * Validators per spec §9. Pure functions returning a discriminated union so
 * UI and repo layers can both consume them. Repo-layer checks act as
 * defense-in-depth against future direct callers.
 */

import { compareIso, isIsoDate } from '../utils/dates';

export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export const ok: ValidationResult = { ok: true };
export const fail = (message: string): ValidationResult => ({ ok: false, message });

export function validateName(name: string, label = 'Name'): ValidationResult {
  if (!name || name.trim() === '') return fail(`${label} is required.`);
  if (name.length > 80) return fail(`${label} must be 80 characters or fewer.`);
  return ok;
}

export function validateNonNegativeAmount(amount: number, label = 'Amount'): ValidationResult {
  if (!Number.isFinite(amount)) return fail(`${label} must be a number.`);
  if (amount < 0) return fail(`${label} cannot be negative.`);
  return ok;
}

export function validateAmountAllowNegative(amount: number, label = 'Amount'): ValidationResult {
  if (!Number.isFinite(amount)) return fail(`${label} must be a number.`);
  return ok;
}

export function validateYear(year: number): ValidationResult {
  if (!Number.isInteger(year)) return fail('Year must be a whole number.');
  if (year < 1900 || year > 2200) return fail('Year is outside the allowed range.');
  return ok;
}

export function validateCurrency(currency: string): ValidationResult {
  if (!currency || currency.length < 3 || currency.length > 4) {
    return fail('Currency must be a 3-letter code (e.g. USD).');
  }
  if (!/^[A-Za-z]+$/.test(currency)) {
    return fail('Currency must contain only letters.');
  }
  return ok;
}

export function validateDateRange(start: string, end: string): ValidationResult {
  if (!isIsoDate(start)) return fail('Start date must be a valid YYYY-MM-DD.');
  if (!isIsoDate(end)) return fail('End date must be a valid YYYY-MM-DD.');
  if (compareIso(start, end) > 0) return fail('Start date must be on or before end date.');
  return ok;
}

/**
 * True when the proposed range overlaps any of the existing ranges.
 * Two ranges overlap iff NOT (a.end < b.start OR a.start > b.end).
 */
export function rangesOverlap(
  newStart: string,
  newEnd: string,
  existing: { start_date: string; end_date: string }[],
): boolean {
  for (const e of existing) {
    if (compareIso(newEnd, e.start_date) >= 0 && compareIso(newStart, e.end_date) <= 0) {
      return true;
    }
  }
  return false;
}

export function validatePeriodOverlap(
  start: string,
  end: string,
  existing: { start_date: string; end_date: string }[],
): ValidationResult {
  if (rangesOverlap(start, end, existing)) {
    return fail('This period overlaps an existing one.');
  }
  return ok;
}

/**
 * Sum of category assignments must not exceed calculated expenses unless
 * the user explicitly opted in to over-assignment.
 */
export function validateAssignmentTotal(
  calculated: number,
  totalAssigned: number,
  allowOver: boolean,
): ValidationResult {
  if (totalAssigned < 0) return fail('Total assigned cannot be negative.');
  if (!allowOver && totalAssigned > calculated) {
    return fail('Total assigned exceeds calculated expenses.');
  }
  return ok;
}
