import { supabase } from '../../lib/supabase';
import { compareIso } from '../../utils/dates';
import {
  calculatedExpenses as calcExpenses,
  generalExpenses as calcGeneral,
  periodStatusFromCalc,
  totalAssets,
} from '../../domain/calculations';
import { rangesOverlap } from '../../domain/validation';
import { listAssets } from './asset';
import type { Period, PeriodStatus } from '../../domain/types';

export async function listPeriods(yearId: number): Promise<Period[]> {
  const { data, error } = await supabase
    .from('period')
    .select('*')
    .eq('budget_year_id', yearId)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Period[];
}

export async function getPeriodById(id: number): Promise<Period | null> {
  const { data, error } = await supabase
    .from('period')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Period | null) ?? null;
}

export async function latestPeriod(yearId: number): Promise<Period | null> {
  const { data, error } = await supabase
    .from('period')
    .select('*')
    .eq('budget_year_id', yearId)
    .order('end_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Period | null) ?? null;
}

export async function checkOverlap(
  yearId: number,
  start: string,
  end: string,
  excludePeriodId?: number,
): Promise<boolean> {
  let query = supabase
    .from('period')
    .select('start_date, end_date')
    .eq('budget_year_id', yearId);
  if (excludePeriodId) query = query.neq('id', excludePeriodId);
  const { data, error } = await query;
  if (error) throw error;
  return rangesOverlap(start, end, (data ?? []) as { start_date: string; end_date: string }[]);
}

/**
 * Resolve "previous total assets" as of the given start date. For each
 * currently-active asset, take its latest balance_snapshot strictly before
 * `start`, falling back to opening_balance when no snapshot exists.
 */
export async function resolvePreviousTotal(
  profileId: number,
  start: string,
): Promise<number> {
  const assets = await listAssets(profileId, true);
  let sum = 0;
  for (const asset of assets) {
    const created = asset.created_at?.slice(0, 10) ?? start;
    if (compareIso(created, start) > 0) continue;

    const { data, error } = await supabase
      .from('balance_snapshot')
      .select('balance_amount')
      .eq('asset_account_id', asset.id)
      .lt('snapshot_date', start)
      .order('snapshot_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      sum += Number(data.balance_amount);
    } else {
      sum += asset.opening_balance;
    }
  }
  return sum;
}

export interface SavePeriodArgs {
  yearId: number;
  profileId: number;
  startDate: string;
  endDate: string;
  balances: { assetId: number; balance: number }[];
  income: { sourceName: string; amount: number; incomeDate: string; note?: string | null }[];
}

export interface SavedPeriodResult {
  period: Period;
  status: PeriodStatus;
}

export interface SaveBalanceUpdatePeriodArgs {
  yearId: number;
  startDate: string;
  endDate: string;
  previousTotalAssets: number;
  currentTotalAssets: number;
  balances: { assetId: number; balance: number }[];
  income: { sourceName: string; amount: number; incomeDate: string; note?: string | null }[];
}

/**
 * Insert the period plus its snapshots and income rows, then update each
 * asset's current_balance. Not atomic at the DB level — Supabase does not
 * expose multi-statement transactions over PostgREST. Failures partway through
 * leave a partial period that the user can delete from the dashboard.
 */
export async function savePeriod(args: SavePeriodArgs): Promise<SavedPeriodResult> {
  const previousTotal = await resolvePreviousTotal(args.profileId, args.startDate);
  const currentTotal = totalAssets(args.balances.map((b) => ({ amount: b.balance })));
  const totalIncome = args.income.reduce((acc, i) => acc + i.amount, 0);
  const calculated = calcExpenses(previousTotal, totalIncome, currentTotal);
  const status: PeriodStatus = periodStatusFromCalc(calculated);

  const period = await insertPeriod({
    yearId: args.yearId,
    startDate: args.startDate,
    endDate: args.endDate,
    previousTotalAssets: previousTotal,
    currentTotalAssets: currentTotal,
    totalIncome,
    calculated,
    status,
  });

  await writePeriodChildren({
    periodId: period.id,
    endDate: args.endDate,
    balances: args.balances,
    income: args.income,
  });

  return { period, status };
}

export async function saveBalanceUpdatePeriod(
  args: SaveBalanceUpdatePeriodArgs,
): Promise<SavedPeriodResult> {
  const totalIncome = args.income.reduce((acc, i) => acc + i.amount, 0);
  const calculated = calcExpenses(
    args.previousTotalAssets,
    totalIncome,
    args.currentTotalAssets,
  );
  const status: PeriodStatus = periodStatusFromCalc(calculated);

  const period = await insertPeriod({
    yearId: args.yearId,
    startDate: args.startDate,
    endDate: args.endDate,
    previousTotalAssets: args.previousTotalAssets,
    currentTotalAssets: args.currentTotalAssets,
    totalIncome,
    calculated,
    status,
  });

  await writePeriodChildren({
    periodId: period.id,
    endDate: args.endDate,
    balances: args.balances,
    income: args.income,
  });

  return { period, status };
}

interface InsertPeriodArgs {
  yearId: number;
  startDate: string;
  endDate: string;
  previousTotalAssets: number;
  currentTotalAssets: number;
  totalIncome: number;
  calculated: number;
  status: PeriodStatus;
}

async function insertPeriod(args: InsertPeriodArgs): Promise<Period> {
  const { data, error } = await supabase
    .from('period')
    .insert({
      budget_year_id: args.yearId,
      start_date: args.startDate,
      end_date: args.endDate,
      previous_total_assets: args.previousTotalAssets,
      current_total_assets: args.currentTotalAssets,
      total_income: args.totalIncome,
      calculated_expenses: args.calculated,
      specific_category_expenses: 0,
      general_expenses: 0,
      status: args.status,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Period;
}

interface WriteChildrenArgs {
  periodId: number;
  endDate: string;
  balances: { assetId: number; balance: number }[];
  income: { sourceName: string; amount: number; incomeDate: string; note?: string | null }[];
}

async function writePeriodChildren(args: WriteChildrenArgs): Promise<void> {
  if (args.balances.length > 0) {
    const snapshotRows = args.balances.map((b) => ({
      asset_account_id: b.assetId,
      period_id: args.periodId,
      balance_amount: b.balance,
      snapshot_date: args.endDate,
    }));
    const { error: snapErr } = await supabase.from('balance_snapshot').insert(snapshotRows);
    if (snapErr) throw snapErr;

    // Update each asset's current_balance. Supabase has no bulk UPDATE-by-id
    // primitive over PostgREST, so we issue these per-asset.
    for (const b of args.balances) {
      const { error } = await supabase
        .from('asset_account')
        .update({ current_balance: b.balance })
        .eq('id', b.assetId);
      if (error) throw error;
    }
  }

  if (args.income.length > 0) {
    const incomeRows = args.income.map((inc) => ({
      period_id: args.periodId,
      source_name: inc.sourceName.trim(),
      amount: inc.amount,
      income_date: inc.incomeDate,
      note: inc.note ?? null,
    }));
    const { error } = await supabase.from('income_entry').insert(incomeRows);
    if (error) throw error;
  }
}

/**
 * Recompute the cached totals on a period from its assignment rows.
 */
export async function refreshPeriodTotals(periodId: number): Promise<void> {
  const period = await getPeriodById(periodId);
  if (!period) return;

  const { data, error } = await supabase
    .from('expense_assignment')
    .select('amount, budget_category!inner(is_system)')
    .eq('period_id', periodId);
  if (error) throw error;

  type Row = { amount: number; budget_category: { is_system: boolean } | { is_system: boolean }[] };
  let specific = 0;
  let general = 0;
  for (const a of ((data ?? []) as unknown as Row[])) {
    const bc = Array.isArray(a.budget_category) ? a.budget_category[0] : a.budget_category;
    if (bc?.is_system) general += a.amount;
    else specific += a.amount;
  }
  const reconciled = calcGeneral(period.calculated_expenses, specific) - general;
  if (reconciled !== 0) general += reconciled;

  const { error: upErr } = await supabase
    .from('period')
    .update({ specific_category_expenses: specific, general_expenses: general })
    .eq('id', periodId);
  if (upErr) throw upErr;
}

export async function setPeriodStatus(id: number, status: PeriodStatus): Promise<void> {
  const { error } = await supabase
    .from('period')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePeriod(id: number): Promise<void> {
  const { error } = await supabase.from('period').delete().eq('id', id);
  if (error) throw error;
}
