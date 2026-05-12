import { supabase } from '../../lib/supabase';
import type { BudgetYear } from '../../domain/types';

export async function getCurrentYear(): Promise<BudgetYear | null> {
  const { data, error } = await supabase
    .from('budget_year')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as BudgetYear | null) ?? null;
}

export async function getYearById(id: number): Promise<BudgetYear | null> {
  const { data, error } = await supabase
    .from('budget_year')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as BudgetYear | null) ?? null;
}

export async function listYears(): Promise<BudgetYear[]> {
  const { data, error } = await supabase
    .from('budget_year')
    .select('*')
    .order('year', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BudgetYear[];
}

export interface CreateYearArgs {
  userProfileId: number;
  year: number;
  currency: string;
}

/**
 * Create the budget year and seed the system `General` category.
 */
export async function createYearWithGeneral(args: CreateYearArgs): Promise<BudgetYear> {
  const { data: yearRow, error: yearErr } = await supabase
    .from('budget_year')
    .insert({
      user_profile_id: args.userProfileId,
      year: args.year,
      currency: args.currency.toUpperCase(),
    })
    .select()
    .single();
  if (yearErr) throw yearErr;
  const year = yearRow as BudgetYear;

  const { error: catErr } = await supabase.from('budget_category').insert({
    budget_year_id: year.id,
    name: 'General',
    yearly_budget_amount: 0,
    used_amount: 0,
    is_system: true,
  });
  if (catErr) throw catErr;

  return year;
}
