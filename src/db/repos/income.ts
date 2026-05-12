import { supabase } from '../../lib/supabase';
import type {
  IncomeEntry,
  IncomeSource,
  YearlyIncomeEntry,
  YearlyIncomeEntryWithSource,
} from '../../domain/types';

export async function listIncomeForPeriod(periodId: number): Promise<IncomeEntry[]> {
  const { data, error } = await supabase
    .from('income_entry')
    .select('*')
    .eq('period_id', periodId)
    .order('income_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IncomeEntry[];
}

export async function listIncomeForYear(yearId: number): Promise<IncomeEntry[]> {
  const { data, error } = await supabase
    .from('income_entry')
    .select('*, period!inner(budget_year_id)')
    .eq('period.budget_year_id', yearId)
    .order('income_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: IncomeEntry & { period?: unknown }) => {
    const { period: _p, ...rest } = row;
    return rest as IncomeEntry;
  });
}

export async function listIncomeSources(yearId: number): Promise<IncomeSource[]> {
  const { data, error } = await supabase
    .from('income_source')
    .select('*')
    .eq('budget_year_id', yearId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IncomeSource[];
}

export interface CreateIncomeSourceArgs {
  budgetYearId: number;
  name: string;
  expectedYearlyAmount: number;
}

export async function createIncomeSource(args: CreateIncomeSourceArgs): Promise<IncomeSource> {
  const { data, error } = await supabase
    .from('income_source')
    .insert({
      budget_year_id: args.budgetYearId,
      name: args.name.trim(),
      expected_yearly_amount: args.expectedYearlyAmount,
    })
    .select()
    .single();
  if (error) throw error;
  return data as IncomeSource;
}

export async function listYearlyIncomeEntries(
  yearId: number,
): Promise<YearlyIncomeEntryWithSource[]> {
  const { data, error } = await supabase
    .from('yearly_income_entry')
    .select('*, income_source!inner(budget_year_id, name)')
    .eq('income_source.budget_year_id', yearId)
    .order('income_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(
    (row: YearlyIncomeEntry & { income_source: { name: string; budget_year_id: number } }) => {
      const { income_source, ...rest } = row;
      return { ...rest, source_name: income_source.name } as YearlyIncomeEntryWithSource;
    },
  );
}

export interface CreateYearlyIncomeEntryArgs {
  incomeSourceId: number;
  amount: number;
  incomeDate: string;
  note?: string;
}

export async function createYearlyIncomeEntry(args: CreateYearlyIncomeEntryArgs): Promise<void> {
  const { error } = await supabase.from('yearly_income_entry').insert({
    income_source_id: args.incomeSourceId,
    amount: args.amount,
    income_date: args.incomeDate,
    note: args.note?.trim() || null,
  });
  if (error) throw error;
}
