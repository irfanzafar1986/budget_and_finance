import { supabase } from '../../lib/supabase';
import type { ExpenseAssignment } from '../../domain/types';

export async function listAssignmentsForPeriod(periodId: number): Promise<ExpenseAssignment[]> {
  const { data, error } = await supabase
    .from('expense_assignment')
    .select('*')
    .eq('period_id', periodId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpenseAssignment[];
}

export interface AssignmentInput {
  categoryId: number;
  amount: number;
  note?: string | null;
}

export interface SaveAssignmentsArgs {
  periodId: number;
  yearId: number;
  generalCategoryId: number;
  calculatedExpenses: number;
  /** User-entered specific assignments (excluding any auto General row). */
  assignments: AssignmentInput[];
  /** True if the user opted in to over-assignment beyond calculated. */
  allowOverAssign: boolean;
}

/**
 * Replace all assignments for a period: delete existing, insert new, write
 * any remainder to General, then refresh period totals and per-category
 * used_amount aggregates.
 *
 * Not transactional at the DB level (Supabase REST has no multi-statement tx).
 * Operations are sequenced so a mid-failure leaves the period either in its
 * prior state (if delete fails) or with a partial new assignment set the user
 * can re-save.
 */
export async function saveAssignments(args: SaveAssignmentsArgs): Promise<void> {
  const { error: delErr } = await supabase
    .from('expense_assignment')
    .delete()
    .eq('period_id', args.periodId);
  if (delErr) throw delErr;

  let specificTotal = 0;
  const insertRows: Array<{
    period_id: number;
    budget_category_id: number;
    amount: number;
    note: string | null;
  }> = [];
  for (const a of args.assignments) {
    if (a.amount <= 0) continue;
    if (a.categoryId === args.generalCategoryId) continue;
    insertRows.push({
      period_id: args.periodId,
      budget_category_id: a.categoryId,
      amount: a.amount,
      note: a.note ?? null,
    });
    specificTotal += a.amount;
  }

  const remainder = args.calculatedExpenses - specificTotal;
  let generalAmount = 0;
  if (remainder > 0) generalAmount = remainder;

  if (generalAmount > 0) {
    insertRows.push({
      period_id: args.periodId,
      budget_category_id: args.generalCategoryId,
      amount: generalAmount,
      note: null,
    });
  }

  if (insertRows.length > 0) {
    const { error: insErr } = await supabase.from('expense_assignment').insert(insertRows);
    if (insErr) throw insErr;
  }

  const { error: pErr } = await supabase
    .from('period')
    .update({
      specific_category_expenses: specificTotal,
      general_expenses: generalAmount,
      status: 'assigned',
    })
    .eq('id', args.periodId);
  if (pErr) throw pErr;

  // Roll per-category used_amount in a single server-side statement.
  const { error: rpcErr } = await supabase.rpc('recompute_used_amounts', {
    p_year_id: args.yearId,
  });
  if (rpcErr) throw rpcErr;
}
