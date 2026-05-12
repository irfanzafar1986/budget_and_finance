import { useState, type FormEvent } from 'react';
import { useApp, useCurrency } from '../state/AppContext';
import {
  createIncomeSource,
  createYearlyIncomeEntry,
  listIncomeSources,
  listYearlyIncomeEntries,
} from '../db/repos/income';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { Card } from '../components/Card';
import { formatMoney, parseAmount } from '../utils/money';
import { isIsoDate, todayIso } from '../utils/dates';
import { validateName, validateNonNegativeAmount } from '../domain/validation';
import type { IncomeSource, YearlyIncomeEntryWithSource } from '../domain/types';
import styles from './Income.module.css';

interface DraftSource {
  id: number;
  name: string;
  expected: string;
}

export function Income() {
  const { year, revision, refresh } = useApp();
  const currency = useCurrency();
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [draftSources, setDraftSources] = useState<DraftSource[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [entrySourceId, setEntrySourceId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso());
  const [entryNote, setEntryNote] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const sources = useAsyncQuery<IncomeSource[]>(
    () => (year ? listIncomeSources(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );
  const entries = useAsyncQuery<YearlyIncomeEntryWithSource[]>(
    () => (year ? listYearlyIncomeEntries(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );

  if (!year) return null;
  const yearId = year.id;

  const expectedTotal = sources.reduce((sum, source) => sum + source.expected_yearly_amount, 0);
  const actualTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const receivedBySource = new Map<number, number>();
  for (const entry of entries) {
    receivedBySource.set(
      entry.income_source_id,
      (receivedBySource.get(entry.income_source_id) ?? 0) + entry.amount,
    );
  }

  function addSourceRow() {
    setDraftSources((rows) => [
      ...rows,
      { id: Date.now() + rows.length, name: '', expected: '' },
    ]);
    setSourceError(null);
  }

  function updateSourceDraft(id: number, patch: Partial<DraftSource>) {
    setDraftSources((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function saveSources(event: FormEvent) {
    event.preventDefault();
    if (draftSources.length === 0) return;

    for (const [index, draft] of draftSources.entries()) {
      const rowLabel = `Row ${index + 1}`;
      const nameCheck = validateName(draft.name, `${rowLabel} source`);
      if (!nameCheck.ok) return setSourceError(nameCheck.message);

      const parsed = parseAmount(draft.expected, currency);
      if (parsed === null) return setSourceError(`${rowLabel} expected income must be a valid number.`);

      const amountCheck = validateNonNegativeAmount(parsed, `${rowLabel} expected income`);
      if (!amountCheck.ok) return setSourceError(amountCheck.message);
    }

    try {
      for (const draft of draftSources) {
        await createIncomeSource({
          budgetYearId: yearId,
          name: draft.name,
          expectedYearlyAmount: parseAmount(draft.expected, currency) ?? 0,
        });
      }
      setDraftSources([]);
      setSourceError(null);
      await refresh();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Could not save income sources.');
    }
  }

  async function saveIncome(event: FormEvent) {
    event.preventDefault();
    const sourceId = Number(entrySourceId);
    if (!sourceId) return setEntryError('Choose an income source.');

    const parsed = parseAmount(entryAmount, currency);
    if (parsed === null) return setEntryError('Amount must be a valid number.');

    const amountCheck = validateNonNegativeAmount(parsed, 'Amount');
    if (!amountCheck.ok) return setEntryError(amountCheck.message);

    if (!isIsoDate(entryDate)) return setEntryError('Date must be valid.');

    try {
      await createYearlyIncomeEntry({
        incomeSourceId: sourceId,
        amount: parsed,
        incomeDate: entryDate,
        note: entryNote,
      });
      setEntryAmount('');
      setEntryDate(todayIso());
      setEntryNote('');
      setEntryError(null);
      await refresh();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Could not save income.');
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Income</h1>
          <p className={styles.lede}>Track yearly expected income and record received income by source.</p>
        </div>
      </header>

      <section className={styles.summary}>
        <div>
          <span>Expected</span>
          <strong>{formatMoney(expectedTotal, currency)}</strong>
        </div>
        <div>
          <span>Received</span>
          <strong>{formatMoney(actualTotal, currency)}</strong>
        </div>
      </section>

      <form onSubmit={saveSources}>
        <Card
          title="Income sources"
          subtitle="Expected income is for the full budget year."
          actions={
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSourcesOpen((open) => !open)}
            >
              {sourcesOpen ? 'Minimize' : 'Show'}
            </button>
          }
        >
          {sourcesOpen ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th className={styles.num}>Expected income</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.length === 0 && draftSources.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={styles.empty}>
                          No income sources added yet.
                        </td>
                      </tr>
                    ) : null}
                    {sources.map((source) => (
                      <tr key={source.id}>
                        <td>{source.name}</td>
                        <td className={styles.num}>
                          {formatMoney(source.expected_yearly_amount, currency)}
                        </td>
                      </tr>
                    ))}
                    {draftSources.map((draft, index) => (
                      <tr key={draft.id}>
                        <td>
                          <input
                            className="input"
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              updateSourceDraft(draft.id, { name: event.target.value })
                            }
                            placeholder="Income source"
                            aria-label={`Income source ${index + 1} name`}
                            autoFocus={index === draftSources.length - 1}
                          />
                        </td>
                        <td>
                          <input
                            className={`input ${styles.valueInput}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={draft.expected}
                            onChange={(event) =>
                              updateSourceDraft(draft.id, { expected: event.target.value })
                            }
                            placeholder="0.00"
                            aria-label={`Income source ${index + 1} expected income`}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2}>
                        <button type="button" className="btn" onClick={addSourceRow}>
                          +
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {sourceError ? <div className={styles.error}>{sourceError}</div> : null}

              <div className={styles.footer}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={draftSources.length === 0}
                >
                  Save sources
                </button>
              </div>
            </>
          ) : (
            <div className={styles.minimized}>
              {sources.length} source(s), {formatMoney(expectedTotal, currency)} expected.
            </div>
          )}
        </Card>
      </form>

      <form onSubmit={saveIncome}>
        <Card title="Add income">
          <div className={styles.entryGrid}>
            <div>
              <label className="label" htmlFor="income-source">Source</label>
              <select
                id="income-source"
                className="input"
                value={entrySourceId}
                onChange={(event) => setEntrySourceId(event.target.value)}
                disabled={sources.length === 0}
              >
                <option value="">Choose source</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="income-amount">Amount</label>
              <input
                id="income-amount"
                className={`input ${styles.valueInput}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={entryAmount}
                onChange={(event) => setEntryAmount(event.target.value)}
                placeholder="0.00"
                disabled={sources.length === 0}
              />
            </div>
            <div>
              <label className="label" htmlFor="income-date">Date</label>
              <input
                id="income-date"
                className="input"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                disabled={sources.length === 0}
              />
            </div>
            <div>
              <label className="label" htmlFor="income-note">Note</label>
              <input
                id="income-note"
                className="input"
                type="text"
                value={entryNote}
                onChange={(event) => setEntryNote(event.target.value)}
                placeholder="Optional"
                disabled={sources.length === 0}
              />
            </div>
          </div>

          {entryError ? <div className={styles.error}>{entryError}</div> : null}

          <div className={styles.footer}>
            <button type="submit" className="btn btn-primary" disabled={sources.length === 0}>
              Add income
            </button>
          </div>
        </Card>
      </form>

      <Card title="Income progress">
        {sources.length === 0 ? (
          <div className={styles.empty}>No income sources added yet.</div>
        ) : (
          <div className={styles.progressList}>
            {sources.map((source) => {
              const received = receivedBySource.get(source.id) ?? 0;
              const expected = source.expected_yearly_amount;
              const percent = expected > 0 ? Math.round((received / expected) * 100) : 0;
              const clamped = Math.max(0, Math.min(percent, 100));
              return (
                <div className={styles.progressItem} key={source.id}>
                  <div className={styles.progressHeader}>
                    <strong>{source.name}</strong>
                    <span>
                      {percent}% · {formatMoney(received, currency)} of{' '}
                      {formatMoney(expected, currency)}
                    </span>
                  </div>
                  <div className={styles.barTrack} aria-label={`${source.name} ${percent}% achieved`}>
                    <div className={styles.barFill} style={{ width: `${clamped}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
