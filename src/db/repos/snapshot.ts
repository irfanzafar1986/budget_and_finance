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
 * For each asset, return the balance saved in the period BEFORE the most
 * recent one. Two queries total (no N+1): one to identify the previous
 * period by id, one to fetch its snapshots.
 *
 * Falls back to opening_balance when there is no prior period (only one
 * update saved ever) or when an asset didn't have a snapshot in that
 * period (created after it).
 */
export async function previousUpdateBalances(
  yearId: number,
  assets: AssetAccount[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (assets.length === 0) return result;

  const { data: periodRows, error: pErr } = await supabase
    .from('period')
    .select('id')
    .eq('budget_year_id', yearId)
    .order('end_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(2);
  if (pErr) throw pErr;
  const periods = (periodRows ?? []) as { id: number }[];

  let snapshotByAsset = new Map<number, number>();
  if (periods.length >= 2) {
    const previousPeriodId = periods[1].id;
    const { data: snaps, error: sErr } = await supabase
      .from('balance_snapshot')
      .select('asset_account_id, balance_amount')
      .eq('period_id', previousPeriodId);
    if (sErr) throw sErr;
    snapshotByAsset = new Map(
      ((snaps ?? []) as { asset_account_id: number; balance_amount: number }[]).map(
        (s) => [s.asset_account_id, Number(s.balance_amount)],
      ),
    );
  }

  for (const asset of assets) {
    const baseline = snapshotByAsset.get(asset.id);
    result.set(asset.id, baseline ?? asset.opening_balance);
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
