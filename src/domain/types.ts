/**
 * Mirror of the Postgres schema. Money values are integer minor units.
 * Dates are ISO-8601 calendar strings (YYYY-MM-DD). Timestamps are ISO datetimes.
 */

export type PeriodStatus =
  | 'draft'
  | 'needs_review'
  | 'ready_to_assign'
  | 'assigned'
  | 'closed';

export interface UserProfile {
  id: number;
  name: string;
  default_currency: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetYear {
  id: number;
  user_profile_id: number;
  year: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: number;
  budget_year_id: number;
  name: string;
  yearly_budget_amount: number;
  used_amount: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetAccount {
  id: number;
  user_profile_id: number;
  name: string;
  asset_type: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BalanceSnapshot {
  id: number;
  asset_account_id: number;
  period_id: number;
  balance_amount: number;
  snapshot_date: string;
  created_at: string;
}

export interface Period {
  id: number;
  budget_year_id: number;
  start_date: string;
  end_date: string;
  previous_total_assets: number;
  current_total_assets: number;
  total_income: number;
  calculated_expenses: number;
  specific_category_expenses: number;
  general_expenses: number;
  status: PeriodStatus;
  created_at: string;
  updated_at: string;
}

export interface IncomeEntry {
  id: number;
  period_id: number;
  source_name: string;
  amount: number;
  income_date: string;
  note: string | null;
  created_at: string;
}

export interface IncomeSource {
  id: number;
  budget_year_id: number;
  name: string;
  expected_yearly_amount: number;
  created_at: string;
  updated_at: string;
}

export interface YearlyIncomeEntry {
  id: number;
  income_source_id: number;
  amount: number;
  income_date: string;
  note: string | null;
  created_at: string;
}

export interface YearlyIncomeEntryWithSource extends YearlyIncomeEntry {
  source_name: string;
}

export interface ExpenseAssignment {
  id: number;
  period_id: number;
  budget_category_id: number;
  amount: number;
  note: string | null;
  created_at: string;
}
