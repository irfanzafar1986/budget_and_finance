import { useState, type CSSProperties, type FormEvent } from 'react';
import { useApp, useCurrency } from '../state/AppContext';
import { createCategory, deleteCategory, listCategories } from '../db/repos/category';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { Card } from '../components/Card';
import { formatMoney, parseAmount } from '../utils/money';
import { validateName, validateNonNegativeAmount } from '../domain/validation';
import type { BudgetCategory } from '../domain/types';
import styles from './Expenses.module.css';

interface DraftBudget {
  id: number;
  name: string;
  budget: string;
}

export function Expenses() {
  const { year, revision, refresh } = useApp();
  const currency = useCurrency();
  const [drafts, setDrafts] = useState<DraftBudget[]>([]);
  const [error, setError] = useState<string | null>(null);

  const categories = useAsyncQuery<BudgetCategory[]>(
    () => (year ? listCategories(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );

  if (!year) return null;
  const yearId = year.id;

  const yearlyBudget = categories.reduce((sum, category) => sum + category.yearly_budget_amount, 0);
  const used = categories.reduce((sum, category) => sum + category.used_amount, 0);

  const tracked = categories
    .filter((c) => !c.is_system && c.yearly_budget_amount > 0)
    .map((c) => {
      const pct = Math.round((c.used_amount / c.yearly_budget_amount) * 100);
      const tone: 'good' | 'warn' | 'over' = pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'good';
      return { ...c, pct, tone };
    })
    .sort((a, b) => b.pct - a.pct);

  function addDraftRow() {
    setDrafts((rows) => [...rows, { id: Date.now() + rows.length, name: '', budget: '' }]);
    setError(null);
  }

  function updateDraft(id: number, patch: Partial<DraftBudget>) {
    setDrafts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeDraftRow(id: number) {
    setDrafts((rows) => rows.filter((row) => row.id !== id));
    setError(null);
  }

  async function handleDeleteCategory(category: BudgetCategory) {
    if (category.is_system) return;
    const confirmed = window.confirm(`Delete the "${category.name}" expense budget?`);
    if (!confirmed) return;
    try {
      await deleteCategory(category.id);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete expense.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (drafts.length === 0) return;

    for (const [index, draft] of drafts.entries()) {
      const rowLabel = `Row ${index + 1}`;
      const nameCheck = validateName(draft.name, `${rowLabel} expense`);
      if (!nameCheck.ok) return setError(nameCheck.message);

      if (draft.budget.trim() !== '') {
        const parsed = parseAmount(draft.budget, currency);
        if (parsed === null) return setError(`${rowLabel} budget must be a valid number.`);

        const amountCheck = validateNonNegativeAmount(parsed, `${rowLabel} budget`);
        if (!amountCheck.ok) return setError(amountCheck.message);
      }
    }

    try {
      for (const draft of drafts) {
        await createCategory({
          yearId,
          name: draft.name,
          yearlyBudgetAmount:
            draft.budget.trim() === '' ? 0 : parseAmount(draft.budget, currency) ?? 0,
        });
      }
      setDrafts([]);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save expense budgets.');
    }
  }

  return (
    <form className={styles.wrap} onSubmit={submit}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Expenses</h1>
          <p className={styles.lede}>Set yearly budgets for each expense bucket.</p>
        </div>
      </header>

      <section className={styles.summary}>
        <div>
          <span>Budgeted</span>
          <strong>{formatMoney(yearlyBudget, currency)}</strong>
        </div>
        <div>
          <span>Assigned</span>
          <strong>{formatMoney(used, currency)}</strong>
        </div>
      </section>

      {tracked.length > 0 ? (
        <Card title="Status by category" subtitle="Year-to-date spending against each yearly budget.">
          <ul className={styles.catList}>
            {tracked.map((c) => {
              const fillPct = Math.min(100, Math.max(0, c.pct));
              const toneClass =
                c.tone === 'over' ? styles.catFillOver
                : c.tone === 'warn' ? styles.catFillWarn
                : styles.catFillGood;
              return (
                <li key={c.id} className={styles.catRow}>
                  <div className={styles.catHead}>
                    <span className={styles.catName}>{c.name}</span>
                    <span className={styles.catNums}>
                      <strong>{formatMoney(c.used_amount, currency)}</strong>
                      <span className={styles.catBudget}> · {formatMoney(c.yearly_budget_amount, currency)}</span>
                    </span>
                  </div>
                  <div className={styles.catTrack}>
                    <div
                      className={`${styles.catFill} ${toneClass}`}
                      style={{ width: `${fillPct}%` } as CSSProperties}
                    />
                  </div>
                  <div className={styles.catFoot}>
                    <span className={`${styles.catPct} ${toneClass}`}>{c.pct}%</span>
                    <span className={styles.catRemaining}>
                      {c.pct > 100
                        ? `${formatMoney(c.used_amount - c.yearly_budget_amount, currency)} over`
                        : `${formatMoney(c.yearly_budget_amount - c.used_amount, currency)} left`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card
        title="Expense budgets"
        actions={
          <button type="button" className="btn btn-sm" onClick={addDraftRow}>
            + Add expense
          </button>
        }
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Expense</th>
                <th className={styles.num}>Yearly budget</th>
                <th className={styles.num}>Assigned</th>
                <th className={styles.actionCol}></th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && drafts.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    No expense budgets added yet.
                  </td>
                </tr>
              ) : null}
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    {category.name}
                    {category.is_system ? <span className="badge">system</span> : null}
                  </td>
                  <td className={styles.num}>
                    {formatMoney(category.yearly_budget_amount, currency)}
                  </td>
                  <td className={styles.num}>{formatMoney(category.used_amount, currency)}</td>
                  <td className={styles.actionCol}>
                    {category.is_system ? null : (
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => void handleDeleteCategory(category)}
                        aria-label={`Delete ${category.name}`}
                        title="Delete expense"
                      >
                        -
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
                      placeholder="Expense category"
                      aria-label={`Expense ${index + 1} name`}
                      autoFocus={index === drafts.length - 1}
                    />
                  </td>
                  <td>
                    <input
                      className={`input ${styles.valueInput}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.budget}
                      onChange={(event) => updateDraft(draft.id, { budget: event.target.value })}
                      placeholder="0.00"
                      aria-label={`Expense ${index + 1} yearly budget`}
                    />
                  </td>
                  <td className={styles.num}>—</td>
                  <td className={styles.actionCol}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => removeDraftRow(draft.id)}
                      aria-label={`Remove expense row ${index + 1}`}
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

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.footer}>
        <button type="submit" className="btn btn-primary" disabled={drafts.length === 0}>
          Save
        </button>
      </div>
    </form>
  );
}
