import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useCurrency } from '../state/AppContext';
import { createAsset, listAssets, setActive } from '../db/repos/asset';
import { latestPeriod, saveBalanceUpdatePeriod } from '../db/repos/period';
import { listIncomeSources } from '../db/repos/income';
import type { IncomeSource } from '../domain/types';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { Card } from '../components/Card';
import { BulkUploadBalancesModal } from '../components/BulkUploadBalancesModal';
import { formatAmount, parseAmount } from '../utils/money';
import { isIsoDate, todayIso } from '../utils/dates';
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

interface DraftIncome {
  id: number;
  sourceName: string;
  amount: string;
  incomeDate: string;
  note: string;
}

export function UpdateBalances() {
  const { profile, year, revision, refresh } = useApp();
  const currency = useCurrency();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [incomeDrafts, setIncomeDrafts] = useState<DraftIncome[]>([]);
  const [assetValues, setAssetValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const assets = useAsyncQuery<AssetAccount[]>(
    () => (profile ? listAssets(profile.id, true) : Promise.resolve([])),
    [profile?.id, revision],
    [],
  );

  const incomeSources = useAsyncQuery<IncomeSource[]>(
    () => (year ? listIncomeSources(year.id) : Promise.resolve([])),
    [year?.id],
    [],
  );

  useEffect(() => {
    setAssetValues((current) => {
      const next: Record<number, string> = {};
      for (const asset of assets) {
        next[asset.id] = current[asset.id] ?? formatAmount(asset.current_balance, currency);
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

  function addIncomeRow() {
    setIncomeDrafts((rows) => [
      ...rows,
      {
        id: Date.now() + rows.length,
        sourceName: '',
        amount: '',
        incomeDate: todayIso(),
        note: '',
      },
    ]);
    setError(null);
    setNotice(null);
  }

  function updateIncomeDraft(id: number, patch: Partial<DraftIncome>) {
    setIncomeDrafts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeIncomeRow(id: number) {
    setIncomeDrafts((rows) => rows.filter((row) => row.id !== id));
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

    const income = [];
    for (const [index, draft] of incomeDrafts.entries()) {
      const rowLabel = `Income row ${index + 1}`;
      const nameCheck = validateName(draft.sourceName, `${rowLabel} source`);
      if (!nameCheck.ok) return setError(nameCheck.message);

      const parsed = parseAmount(draft.amount, currency);
      if (parsed === null) return setError(`${rowLabel} amount must be a valid number.`);

      const amountCheck = validateAmountAllowNegative(parsed, `${rowLabel} amount`);
      if (!amountCheck.ok) return setError(amountCheck.message);

      if (!isIsoDate(draft.incomeDate)) return setError(`${rowLabel} date must be valid.`);

      income.push({
        sourceName: draft.sourceName,
        amount: parsed,
        incomeDate: draft.incomeDate,
        note: draft.note,
      });
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
          income,
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
      setIncomeDrafts([]);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save assets.');
    }
  }

  function applyBulk({ matched, newDrafts: incoming }: ParsedBulkUpload) {
    setAssetValues((prev) => {
      const next = { ...prev };
      for (const { assetId, balance } of matched) {
        next[assetId] = formatAmount(balance, currency);
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
            <button type="button" className="btn btn-sm" onClick={() => setBulkOpen(true)}>
              Bulk upload
            </button>
            <button type="button" className="btn btn-sm" onClick={addDraftRow}>
              + Add asset
            </button>
          </>
        }
      >
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

      <Card
        title="Income for this update"
        subtitle="Add income received during this balance period."
        actions={
          <button type="button" className="btn btn-sm" onClick={addIncomeRow}>
            + Add income
          </button>
        }
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Source</th>
                <th className={styles.num}>Amount</th>
                <th>Date</th>
                <th>Note</th>
                <th className={styles.actionCol}>-</th>
              </tr>
            </thead>
            <tbody>
              {incomeDrafts.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No income added for this update.
                  </td>
                </tr>
              ) : null}
              {incomeDrafts.map((draft, index) => (
                <tr key={draft.id}>
                  <td>
                    <select
                      className="input"
                      value={draft.sourceName}
                      onChange={(event) =>
                        updateIncomeDraft(draft.id, { sourceName: event.target.value })
                      }
                      aria-label={`Income ${index + 1} source`}
                    >
                      <option value="">Select source…</option>
                      {incomeSources.map((src) => (
                        <option key={src.id} value={src.name}>
                          {src.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className={`input ${styles.valueInput}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.amount}
                      onChange={(event) =>
                        updateIncomeDraft(draft.id, { amount: event.target.value })
                      }
                      placeholder="0.00"
                      aria-label={`Income ${index + 1} amount`}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="date"
                      value={draft.incomeDate}
                      onChange={(event) =>
                        updateIncomeDraft(draft.id, { incomeDate: event.target.value })
                      }
                      aria-label={`Income ${index + 1} date`}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="text"
                      value={draft.note}
                      onChange={(event) =>
                        updateIncomeDraft(draft.id, { note: event.target.value })
                      }
                      placeholder="Optional"
                      aria-label={`Income ${index + 1} note`}
                    />
                  </td>
                  <td className={styles.actionCol}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => removeIncomeRow(draft.id)}
                      aria-label={`Remove income row ${index + 1}`}
                      title="Remove row"
                    >
                      -
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
