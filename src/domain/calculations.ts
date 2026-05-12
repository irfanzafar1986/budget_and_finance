/**
 * Pure calculation engine — every formula maps 1:1 to spec §6.
 *
 * IO-free: all values are integer minor units passed in by callers
 * (typically the period repo, which resolves balances from the DB first).
 */

import type { PeriodStatus } from './types';

export function totalAssets(balances: { amount: number }[]): number {
  let sum = 0;
  for (const b of balances) sum += b.amount;
  return sum;
}

export function netChangeInAssets(prev: number, curr: number): number {
  return curr - prev;
}

/**
 * Calculated Expenses = Previous Total Assets + Period Income − Current Total Assets
 *
 * Negative result means reported balances grew by more than income — the user
 * either missed income, mis-recorded a balance, or transferred from an
 * untracked account. Period status should be `needs_review` in that case.
 */
export function calculatedExpenses(prev: number, income: number, curr: number): number {
  return prev + income - curr;
}

/**
 * Whatever is left after specific assignments goes to the system `General` bucket.
 * Negative values are clamped to 0 — over-assignment is a separate UX concern
 * that the assignment screen handles before reaching here.
 */
export function generalExpenses(calculated: number, specificAssigned: number): number {
  const diff = calculated - specificAssigned;
  return diff > 0 ? diff : 0;
}

export function remainingBudget(yearly: number, used: number): number {
  return yearly - used;
}

export function percentUsed(used: number, yearly: number): number {
  if (yearly <= 0) return used > 0 ? Infinity : 0;
  return (used / yearly) * 100;
}

export function periodStatusFromCalc(calculated: number): Extract<PeriodStatus, 'ready_to_assign' | 'needs_review'> {
  return calculated < 0 ? 'needs_review' : 'ready_to_assign';
}
