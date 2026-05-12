import { supabase } from '../../lib/supabase';
import type { BudgetCategory } from '../../domain/types';

export async function listCategories(yearId: number): Promise<BudgetCategory[]> {
  const { data, error } = await supabase
    .from('budget_category')
    .select('*')
    .eq('budget_year_id', yearId)
    .order('is_system', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BudgetCategory[];
}

export async function getCategoryById(id: number): Promise<BudgetCategory | null> {
  const { data, error } = await supabase
    .from('budget_category')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as BudgetCategory | null) ?? null;
}

export async function getGeneralCategory(yearId: number): Promise<BudgetCategory | null> {
  const { data, error } = await supabase
    .from('budget_category')
    .select('*')
    .eq('budget_year_id', yearId)
    .eq('is_system', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as BudgetCategory | null) ?? null;
}

export interface CreateCategoryArgs {
  yearId: number;
  name: string;
  yearlyBudgetAmount: number;
}

export async function createCategory(args: CreateCategoryArgs): Promise<BudgetCategory> {
  const { data, error } = await supabase
    .from('budget_category')
    .insert({
      budget_year_id: args.yearId,
      name: args.name.trim(),
      yearly_budget_amount: args.yearlyBudgetAmount,
      used_amount: 0,
      is_system: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BudgetCategory;
}

export async function renameCategory(id: number, name: string): Promise<BudgetCategory> {
  const { data, error } = await supabase
    .from('budget_category')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as BudgetCategory;
}

export async function setYearlyBudget(
  id: number,
  yearlyBudgetAmount: number,
): Promise<BudgetCategory> {
  const { data, error } = await supabase
    .from('budget_category')
    .update({ yearly_budget_amount: yearlyBudgetAmount })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as BudgetCategory;
}

export async function deleteCategory(id: number): Promise<void> {
  const cat = await getCategoryById(id);
  if (!cat) return;
  if (cat.is_system) {
    throw new Error('Cannot delete the system General category.');
  }
  const { count, error: cntErr } = await supabase
    .from('expense_assignment')
    .select('id', { count: 'exact', head: true })
    .eq('budget_category_id', id);
  if (cntErr) throw cntErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete a category with ${count} existing assignment${count === 1 ? '' : 's'}.`,
    );
  }
  const { error } = await supabase.from('budget_category').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Recompute used_amount on every category in a year. Single server-side query
 * via the recompute_used_amounts(p_year_id) RPC defined in supabase/schema.sql.
 */
export async function recomputeUsedAmounts(yearId: number): Promise<void> {
  const { error } = await supabase.rpc('recompute_used_amounts', { p_year_id: yearId });
  if (error) throw error;
}
