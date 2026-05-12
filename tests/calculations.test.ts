import { describe, it, expect } from 'vitest';
import {
  totalAssets,
  netChangeInAssets,
  calculatedExpenses,
  generalExpenses,
  remainingBudget,
  percentUsed,
  periodStatusFromCalc,
} from '../src/domain/calculations';

describe('totalAssets', () => {
  it('sums all balances', () => {
    expect(totalAssets([{ amount: 100 }, { amount: 250 }, { amount: 75 }])).toBe(425);
  });
  it('returns 0 for empty', () => {
    expect(totalAssets([])).toBe(0);
  });
  it('handles negative balances', () => {
    expect(totalAssets([{ amount: -50 }, { amount: 150 }])).toBe(100);
  });
});

describe('netChangeInAssets', () => {
  it('positive when assets grew', () => {
    expect(netChangeInAssets(1000, 1500)).toBe(500);
  });
  it('negative when assets shrank', () => {
    expect(netChangeInAssets(1500, 1000)).toBe(-500);
  });
});

describe('calculatedExpenses', () => {
  it('previous + income - current', () => {
    expect(calculatedExpenses(530000, 300000, 445000)).toBe(385000);
  });
  it('zero when there were no expenses (transfer-only period)', () => {
    // Money moves between two tracked accounts, net zero. Income is 0.
    // prev = 1000, curr = 1000, income = 0 → 0 expenses.
    expect(calculatedExpenses(1000, 0, 1000)).toBe(0);
  });
  it('negative when balances grew more than income', () => {
    // Suggests missing income or mis-recorded balance.
    expect(calculatedExpenses(1000, 100, 1500)).toBe(-400);
  });
});

describe('generalExpenses', () => {
  it('whatever is left after specific assignments', () => {
    expect(generalExpenses(385000, 55000)).toBe(330000);
  });
  it('clamps to zero when over-assigned', () => {
    expect(generalExpenses(1000, 1500)).toBe(0);
  });
  it('zero when fully assigned', () => {
    expect(generalExpenses(1000, 1000)).toBe(0);
  });
});

describe('remainingBudget', () => {
  it('yearly minus used', () => {
    expect(remainingBudget(960000, 385000)).toBe(575000);
  });
  it('negative when over budget', () => {
    expect(remainingBudget(120000, 330000)).toBe(-210000);
  });
});

describe('percentUsed', () => {
  it('zero when budget is zero and unused', () => {
    expect(percentUsed(0, 0)).toBe(0);
  });
  it('infinity when budget is zero but used', () => {
    expect(percentUsed(100, 0)).toBe(Infinity);
  });
  it('percentage of yearly budget', () => {
    expect(percentUsed(50, 200)).toBe(25);
  });
});

describe('periodStatusFromCalc', () => {
  it('ready_to_assign for non-negative', () => {
    expect(periodStatusFromCalc(0)).toBe('ready_to_assign');
    expect(periodStatusFromCalc(100)).toBe('ready_to_assign');
  });
  it('needs_review for negative', () => {
    expect(periodStatusFromCalc(-1)).toBe('needs_review');
  });
});
