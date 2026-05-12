import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, useCurrency } from '../state/AppContext';
import { getPeriodById } from '../db/repos/period';
import { listCategories, createCategory, getGeneralCategory } from '../db/repos/category';
import {
  listAssignmentsForPeriod,
  saveAssignments,
} from '../db/repos/assignment';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import type {
  BudgetCategory,
  ExpenseAssignment,
  Period,
} from '../domain/types';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { formatMoney } from '../utils/money';
import { formatHumanDate } from '../utils/dates';
import { generalExpenses } from '../domain/calculations';
import { validateAssignmentTotal, validateName, validateNonNegativeAmount } from '../domain/validation';
import styles from './PeriodAssign.module.css';

export function PeriodAssign() {
  const { id } = useParams<{ id: string }>();
  const periodId = Number(id);
  const { year, revision, refresh } = useApp();
  const currency = useCurrency();
  const navigate = useNavigate();

  const period = useAsyncQuery<Period | null>(
    () => (Number.isFinite(periodId) ? getPeriodById(periodId) : Promise.resolve(null)),
    [periodId, revision],
    null,
  );

  const categories = useAsyncQuery<BudgetCategory[]>(
    () => (year ? listCategories(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );

  const general = useAsyncQuery<BudgetCategory | null>(
    () => (year ? getGeneralCategory(year.id) : Promise.resolve(null)),
    [year?.id, revision],
    null,
  );

  const existing = useAsyncQuery<ExpenseAssignment[]>(
    () => (period ? listAssignmentsForPeriod(period.id) : Promise.resolve([])),
    [period?.id, revision],
    [],
  );

  const [drafts, setDrafts] = useState<Record<number, number>>({});
  const [draftsHydratedFor, setDraftsHydratedFor] = useState<number | null>(null);

  // Seed drafts once the existing assignments arrive for this period.
  useEffect(() => {
    if (!period) return;
    if (draftsHydratedFor === period.id) return;
    const init: Record<number, number> = {};
    for (const a of existing) {
      if (general && a.budget_category_id === general.id) continue;
      init[a.budget_category_id] = (init[a.budget_category_id] ?? 0) + a.amount;
    }
    setDrafts(init);
    setDraftsHydratedFor(period.id);
  }, [period, existing, general, draftsHydratedFor]);
  const [allowOver, setAllowOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (!period || !year) {
    return <div className="muted">Period not found.</div>;
  }

  if (period.status === 'needs_review') {
    return (
      <div className={styles.wrap}>
        <div>
          <h1 className={styles.heading}>
            Period {formatHumanDate(period.start_date)} – {formatHumanDate(period.end_date)}
          </h1>
        </div>
        <div className={styles.banner}>
          This period has negative calculated expenses and needs review before assigning.
          Edit the period from the Dashboard or delete and recreate it.
        </div>
      </div>
    );
  }

  const specifics = categories.filter((c) => !c.is_system);
  const specificTotal = specifics.reduce(
    (acc, c) => acc + (drafts[c.id] ?? 0),
    0,
  );
  const remainder = period.calculated_expenses - specificTotal;
  const generalAmount = generalExpenses(period.calculated_expenses, specificTotal);
  const overAssigned = remainder < 0;

  async function onSave() {
    if (!year || !general) return;
    for (const c of specifics) {
      const v = drafts[c.id] ?? 0;
      const check = validateNonNegativeAmount(v, c.name);
      if (!check.ok) return setError(check.message);
    }
    const totalCheck = validateAssignmentTotal(
      period!.calculated_expenses,
      specificTotal,
      allowOver,
    );
    if (!totalCheck.ok) return setError(totalCheck.message);

    setSaving(true);
    setError(null);
    try {
      await saveAssignments({
        periodId: period!.id,
        yearId: year.id,
        generalCategoryId: general.id,
        calculatedExpenses: period!.calculated_expenses,
        assignments: specifics
          .map((c) => ({ categoryId: c.id, amount: drafts[c.id] ?? 0 }))
          .filter((a) => a.amount > 0),
        allowOverAssign: allowOver,
      });
      await refresh();
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save assignments.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div>
        <h1 className={styles.heading}>Assign expenses</h1>
        <p className={styles.lede}>
          Period {formatHumanDate(period.start_date)} – {formatHumanDate(period.end_date)}.
          Whatever you don't assign goes to <code>General</code>.
        </p>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Calculated expenses</div>
          <div className={styles.summaryValue}>
            {formatMoney(period.calculated_expenses, currency)}
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Previous total</div>
          <div className={styles.summaryValue}>
            {formatMoney(period.previous_total_assets, currency)}
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Income</div>
          <div className={styles.summaryValue}>{formatMoney(period.total_income, currency)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Current total</div>
          <div className={styles.summaryValue}>
            {formatMoney(period.current_total_assets, currency)}
          </div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <Card
        actions={
          <button className="btn btn-sm" onClick={() => setAddOpen(true)}>
            + New budget
          </button>
        }
        title="Expense budgets"
      >
        <div className={styles.rowHead}>
          <div>Category</div>
          <div>Amount</div>
          <div>Note</div>
          <div></div>
        </div>
        {specifics.map((c) => (
          <div key={c.id} className={styles.row}>
            <div>{c.name}</div>
            <div>
              <MoneyInput
                value={drafts[c.id] ?? 0}
                currency={currency}
                onChange={(v) => setDrafts((d) => ({ ...d, [c.id]: v }))}
              />
            </div>
            <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {c.used_amount > 0 ? `Used ${formatMoney(c.used_amount, currency)} YTD` : ''}
            </div>
            <div></div>
          </div>
        ))}
        {general ? (
          <div className={`${styles.row} ${styles.system}`}>
            <div>
              {general.name} <span className="badge">system</span>
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {formatMoney(generalAmount, currency)}
            </div>
            <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              Auto-filled from the remainder.
            </div>
            <div></div>
          </div>
        ) : null}
      </Card>

      <div className={styles.footer}>
        <div className={styles.footerStats}>
          <div className={styles.footerStat}>
            <strong>{formatMoney(specificTotal, currency)}</strong>
            <span className="muted">Specific assigned</span>
          </div>
          <div className={styles.footerStat}>
            <strong>{formatMoney(generalAmount, currency)}</strong>
            <span className="muted">Goes to General</span>
          </div>
          <div className={styles.footerStat}>
            <strong>{formatMoney(period.calculated_expenses, currency)}</strong>
            <span className="muted">Of total</span>
          </div>
        </div>
        <div className={styles.actions}>
          {overAssigned ? (
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={allowOver}
                onChange={(e) => setAllowOver(e.target.checked)}
              />
              Allow over-assignment ({formatMoney(-remainder, currency)} over)
            </label>
          ) : null}
          <button className="btn" onClick={() => navigate('/')}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving || (overAssigned && !allowOver)}
          >
            {saving ? 'Saving…' : 'Save assignments'}
          </button>
        </div>
      </div>

      {addOpen ? (
        <NewCategoryModal
          currency={currency}
          existingNames={categories.map((c) => c.name.toLowerCase())}
          onClose={() => setAddOpen(false)}
          onCreate={async (name, amount) => {
            try {
              await createCategory({ yearId: year.id, name, yearlyBudgetAmount: amount });
              setAddOpen(false);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not create category.');
            }
          }}
        />
      ) : null}
    </div>
  );
}

function NewCategoryModal({
  currency,
  existingNames,
  onClose,
  onCreate,
}: {
  currency: string;
  existingNames: string[];
  onClose: () => void;
  onCreate: (name: string, amount: number) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const nameCheck = validateName(name, 'Name');
    if (!nameCheck.ok) return setErr(nameCheck.message);
    if (existingNames.includes(name.trim().toLowerCase())) {
      return setErr('An expense budget with that name already exists.');
    }
    const aCheck = validateNonNegativeAmount(amount, 'Yearly budget');
    if (!aCheck.ok) return setErr(aCheck.message);
    onCreate(name.trim(), amount);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New expense budget"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Create
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="label" htmlFor="qc-name">Name</label>
          <input
            id="qc-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="qc-budget">Yearly budget (optional)</label>
          <MoneyInput id="qc-budget" value={amount} currency={currency} onChange={setAmount} />
        </div>
        {err ? (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--color-danger-soft)',
              color: 'var(--color-danger)',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {err}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
