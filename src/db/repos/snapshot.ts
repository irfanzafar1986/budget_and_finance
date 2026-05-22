import { supabase } from '../../lib/supabase';
import type { AssetAccount, BalanceSnapshot } from '../../domain/types';

export async function listSnapshotsForPeriod(periodId: number): Promise<BalanceSnapshot[]> {
  const { data, error } = await supabase
    .from('balance_snapshot')
    .select('*')
    .eq('period_id', periodId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BalanceSnapshot[];
}

/**
 * For each asset, return the balance from the period BEFORE the most recent
 * one. Lets "Show changes vs last update" diff the current state against the
 * baseline the latest update started from, rather than against itself.
 *
 * Falls back to the asset's opening_balance when no prior snapshot exists.
 * Ordering uses (snapshot_date DESC, id DESC) so multiple updates on the same
 * calendar date stay disambiguated by row id.
 */
export async function previousUpdateBalances(
  assets: AssetAccount[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  for (const asset of assets) {
    const { data, error } = await supabase
      .from('balance_snapshot')
      .select('balance_amount')
      .eq('asset_account_id', asset.id)
      .order('snapshot_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(2);
    if (error) throw error;
    const rows = (data ?? []) as { balance_amount: number }[];
    if (rows.length >= 2) {
      result.set(asset.id, Number(rows[1].balance_amount));
    } else {
      result.set(asset.id, asset.opening_balance);
    }
  }
  return result;
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
