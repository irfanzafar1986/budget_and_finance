import { supabase } from '../../lib/supabase';
import type { BalanceSnapshot } from '../../domain/types';

export async function listSnapshotsForPeriod(periodId: number): Promise<BalanceSnapshot[]> {
  const { data, error } = await supabase
    .from('balance_snapshot')
    .select('*')
    .eq('period_id', periodId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BalanceSnapshot[];
}

export async function listSnapshotsForYear(yearId: number): Promise<BalanceSnapshot[]> {
  // Pull all snapshots whose period belongs to this year. Postgrest filter on
  // the embedded period.budget_year_id, ordered by snapshot_date asc.
  const { data, error } = await supabase
    .from('balance_snapshot')
    .select('*, period!inner(budget_year_id)')
    .eq('period.budget_year_id', yearId)
    .order('snapshot_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  // Strip the joined period object before returning.
  return (data ?? []).map((row: BalanceSnapshot & { period?: unknown }) => {
    const { period: _p, ...rest } = row;
    return rest as BalanceSnapshot;
  });
}
