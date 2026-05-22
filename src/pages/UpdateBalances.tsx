import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useCurrency } from '../state/AppContext';
import { createAsset, listAssets, setActive } from '../db/repos/asset';
import { latestPeriod, saveBalanceUpdatePeriod } from '../db/repos/period';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { Card } from '../components/Card';
import { BulkUploadBalancesModal } from '../components/BulkUploadBalancesModal';
import { formatAmount, formatAmountPlain, parseAmount } from '../utils/money';
import { todayIso } from '../utils/dates';
import { validateAmountAllowNegative, validateName } from '../domain/validation';
import type { AssetAccount } from '../domain/types';
import type { ParsedBulkUpload } from '../utils/csv';
import styles from './UpdateBalances.module.css';

const ASSET_TYPE_HINT = 'Cash, Bank, Savings, Investment, Property, Receivable';

interface DraftAsset {
  id: number;
  name: string;
  assetType: string;
  value: string;
}

interface AssetDiff {
  assetId: number;
  name: string;
  previous: number;
  current: number;
  delta: number;
}

export function UpdateBalances() {
  const { profile, year, revision, refresh } = useApp();
  const currency = useCurrency();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [assetValues, setAssetValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const assets = useAsyncQuery<AssetAccount[]>(
    () => (profile ? listAssets(profile.id, true) : Promise.resolve([])),
    [profile?.id, revision],
    [],
  );

  useEffect(() => {
    setAssetValues((current) => {
      const next: Record<number, string> = {};
      for (const asset of assets) {
        next[asset.id] = current[asset.id] ?? formatAmountPlain(asset.current_balance, currency);
      }
      return next;
    });
  }, [assets, currency]);

  if (!profile || !year) return null;
  const profileId = profile.id;
  const yearId = year.id;
  const budgetYear = year.year;

  function addDraftRow() {
    setDrafts((rows) => [
      ...rows,
      {
        id: Date.now() + rows.length,
        name: '',
        assetType: '',
        value: '',
      },
    ]);
    setError(null);
    setNotice(null);
  }

  function updateDraft(id: number, patch: Partial<DraftAsset>) {
    setDrafts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeDraftRow(id: number) {
    setDrafts((rows) => rows.filter((row) => row.id !== id));
    setError(null);
    setNotice(null);
  }

  async function deactivateAsset(id: number) {
    try {
      await setActive(id, false);
      setError(null);
      setNotice('Asset removed from active tracking. Historical periods remain intact.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove asset.');
    }
  }

  async function reactivateAsset(id: number) {
    try {
      await setActive(id, true);
      setError(null);
      setNotice('Asset reactivated. Its value will be included in the next balance update.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reactivate asset.');
    }
  }

  function computeDiffs(): AssetDiff[] {
    const diffs: AssetDiff[] = [];
    for (const asset of assets) {
      if (!asset.is_active) continue;
      const parsed = parseAmount(assetValues[asset.id] ?? '', currency);
      if (parsed === null) continue;
      const delta = parsed - asset.current_balance;
      if (delta === 0) continue;
      diffs.push({
        assetId: asset.id,
        name: asset.name,
        previous: asset.current_balance,
        current: parsed,
        delta,
      });
    }
    diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return diffs;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    const activeAssets = assets.filter((a) => a.is_active);
    const parsedExisting = activeAssets.map((asset) => {
      const parsed = parseAmount(assetValues[asset.id] ?? '', currency);
      return { asset, parsed };
    });

    for (const { asset, parsed } of parsedExisting) {
      if (parsed === null) return setError(`${asset.name} value must be a valid number.`);
      const amountCheck = validateAmountAllowNegative(parsed, `${asset.name} value`);
      if (!amountCheck.ok) return setError(amountCheck.message);
    }

    for (const [index, draft] of drafts.entries()) {
      const rowLabel = `Row ${index + 1}`;
      const nameCheck = validateName(draft.name, `${rowLabel} name`);
      if (!nameCheck.ok) return setError(nameCheck.message);

      const typeCheck = validateName(draft.assetType, `${rowLabel} type`);
      if (!typeCheck.ok) return setError(typeCheck.message);

      const parsed = parseAmount(draft.value, currency);
      if (parsed === null) return setError(`${rowLabel} value must be a valid number.`);

      const amountCheck = validateAmountAllowNegative(parsed, `${rowLabel} value`);
      if (!amountCheck.ok) return setError(amountCheck.message);
    }

    try {
      const createdAssets: { id: number; balance: number }[] = [];
      for (const draft of drafts) {
        const openingBalance = parseAmount(draft.value, currency) ?? 0;
        const asset = await createAsset({
          userProfileId: profileId,
          name: draft.name,
          assetType: draft.assetType,
          openingBalance,
        });
        createdAssets.push({ id: asset.id, balance: openingBalance });
      }

      if (activeAssets.length > 0) {
        const endDate = todayIso();
        const lastPeriod = await latestPeriod(yearId);
        const startDate = lastPeriod?.end_date ?? `${budgetYear}-01-01`;

        const previousTotalAssets =
          activeAssets.reduce((sum, asset) => sum + asset.current_balance, 0) +
          createdAssets.reduce((sum, asset) => sum + asset.balance, 0);
        const existingBalances = parsedExisting.map(({ asset, parsed }) => ({
          assetId: asset.id,
          balance: parsed ?? asset.current_balance,
        }));
        const allBalances = [
          ...existingBalances,
          ...createdAssets.map((asset) => ({ assetId: asset.id, balance: asset.balance })),
        ];
        const currentTotalAssets = allBalances.reduce((sum, balance) => sum + balance.balance, 0);
        const result = await saveBalanceUpdatePeriod({
          yearId,
          startDate,
          endDate,
          previousTotalAssets,
          currentTotalAssets,
          balances: allBalances,
          income: [],
        });

        await refresh();
        if (result.period.calculated_expenses > 0) {
          navigate(`/period/${result.period.id}/assign`);
          return;
        }

        setNotice(
          result.period.calculated_expenses < 0
            ? 'Balances updated. Calculated expenses are negative, so there is nothing to assign yet.'
            : 'Balances updated. No expenses were calculated for this update.',
        );
      }

      if (activeAssets.length === 0 && createdAssets.length > 0) {
        setNotice('Assets saved. Update balances again later to calculate expenses.');
      }

      setDrafts([]);
      setError(null);
      setShowDiff(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save assets.');
    }
  }

  function applyBulk({ matched, newDrafts: incoming }: ParsedBulkUpload) {
    setAssetValues((prev) => {
      const next = { ...prev };
      for (const { assetId, balance } of matched) {
        next[assetId] = formatAmountPlain(balance, currency);
      }
      return next;
    });
    if (incoming.length > 0) {
      setDrafts((prev) => [
        ...prev,
        ...incoming.map((d, i) => ({
          id: Date.now() + i,
          name: d.name,
          assetType: d.assetType,
          value: d.value,
        })),
      ]);
    }
    const matchedCount = matched.length;
    const draftCount = incoming.length;
    const parts: string[] = [];
    if (matchedCount > 0) parts.push(`${matchedCount} balance${matchedCount !== 1 ? 's' : ''} updated`);
    if (draftCount > 0) parts.push(`${draftCount} new asset${draftCount !== 1 ? 's' : ''} added`);
    setNotice(`Loaded from CSV: ${parts.join(', ')}. Review and click Save.`);
    setError(null);
  }

  const diffs = showDiff ? computeDiffs() : [];
  const totalDelta = diffs.reduce((s, d) => s + d.delta, 0);

  return (
    <form className={styles.wrap} onSubmit={submit}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Update balances</h1>
          <p className={styles.lede}>
            Update asset values. Saving calculates expenses and asks you to assign them.
          </p>
        </div>
      </header>

      <BulkUploadBalancesModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        assets={assets}
        currency={currency}
        onApply={applyBulk}
      />

      <Card
        title="Assets"
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowDiff((v) => !v)}
            >
              {showDiff ? 'Hide changes' : 'Show changes vs last update'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setBulkOpen(true)}>
              Bulk upload
            </button>
            <button type="button" className="btn btn-sm" onClick={addDraftRow}>
              + Add asset
            </button>
          </>
        }
      >
        {showDiff ? (
          <div className={styles.diffPanel}>
            {diffs.length === 0 ? (
              <div className={styles.diffEmpty}>
                No changes vs last update. Edit a value above to see the difference.
              </div>
            ) : (
              <>
                <table className={styles.diffTable}>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className={styles.num}>Previous</th>
                      <th className={styles.num}>New</th>
                      <th className={styles.num}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d) => {
                      const up = d.delta > 0;
                      return (
                        <tr key={d.assetId}>
                          <td>{d.name}</td>
                          <td className={styles.num}>{formatAmount(d.previous, currency)}</td>
                          <td className={styles.num}>{formatAmount(d.current, currency)}</td>
                          <td className={`${styles.num} ${up ? styles.diffUp : styles.diffDown}`}>
                            {up ? '▲ +' : '▼ '}
                            {formatAmount(d.delta, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className={styles.diffTotalLabel}>Net change</td>
                      <td
                        className={`${styles.num} ${totalDelta >= 0 ? styles.diffUp : styles.diffDown}`}
                      >
                        {totalDelta > 0 ? '+' : ''}
                        {formatAmount(totalDelta, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className={styles.num}>Value</th>
                <th className={styles.actionCol}>-</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 && drafts.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    No assets added yet.
                  </td>
                </tr>
              ) : null}
              {assets.map((asset) => (
                <tr key={asset.id} className={asset.is_active ? '' : styles.inactiveRow}>
                  <td>
                    {asset.name}
                    {asset.is_active ? null : (
                      <span className={styles.inactiveTag}>inactive</span>
                    )}
                  </td>
                  <td>{asset.asset_type}</td>
                  <td>
                    <input
                      className={`input ${styles.valueInput}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={assetValues[asset.id] ?? ''}
                      onChange={(event) =>
                        setAssetValues((values) => ({
                          ...values,
                          [asset.id]: event.target.value,
                        }))
                      }
                      disabled={!asset.is_active}
                      aria-label={`${asset.name} value`}
                    />
                  </td>
                  <td className={styles.actionCol}>
                    {asset.is_active ? (
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => void deactivateAsset(asset.id)}
                        aria-label={`Remove ${asset.name}`}
                        title="Remove asset"
                      >
                        -
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => void reactivateAsset(asset.id)}
                        aria-label={`Reactivate ${asset.name}`}
                        title="Reactivate asset"
                      >
                        +
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {drafts.map((draft, index) => (
                <tr key={draft.id}>
                  <td>
                    <input
                      className="input"
                      type="text"
                      value={draft.name}
                      onChange={(event) => updateDraft(draft.id, { name: event.target.value })}
                      placeholder="Asset name"
                      aria-label={`Asset ${index + 1} name`}
                      autoFocus={index === drafts.length - 1}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="text"
                      value={draft.assetType}
                      onChange={(event) =>
                        updateDraft(draft.id, { assetType: event.target.value })
                      }
                      placeholder={ASSET_TYPE_HINT}
                      list="asset-type-suggestions"
                      aria-label={`Asset ${index + 1} type`}
                    />
                  </td>
                  <td>
                    <input
                      className={`input ${styles.valueInput}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={draft.value}
                      onChange={(event) => updateDraft(draft.id, { value: event.target.value })}
                      placeholder="0.00"
                      aria-label={`Asset ${index + 1} value`}
                    />
                  </td>
                  <td className={styles.actionCol}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => removeDraftRow(draft.id)}
                      aria-label={`Remove asset row ${index + 1}`}
                      title="Remove row"
                    >
                      -
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="asset-type-suggestions">
            <option value="Cash" />
            <option value="Bank" />
            <option value="Savings" />
            <option value="Investment" />
            <option value="Property" />
            <option value="Receivable" />
          </datalist>
        </div>
      </Card>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.footer}>
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </div>
    </form>
  );
}
