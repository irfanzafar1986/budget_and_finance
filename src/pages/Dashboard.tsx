import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useCurrency } from '../state/AppContext';
import { listAssets } from '../db/repos/asset';
import { listIncomeForYear } from '../db/repos/income';
import { listPeriods } from '../db/repos/period';
import { listSnapshotsForYear } from '../db/repos/snapshot';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { formatMoney } from '../utils/money';
import { totalAssets } from '../domain/calculations';
import type {
  AssetAccount,
  BalanceSnapshot,
  IncomeEntry,
  Period,
} from '../domain/types';
import styles from './Dashboard.module.css';

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const ASSET_COLORS = [
  { stop1: '#5eead4', stop2: '#14b8a6' }, // teal
  { stop1: '#a78bfa', stop2: '#7c3aed' }, // violet
  { stop1: '#60a5fa', stop2: '#2563eb' }, // blue
  { stop1: '#fbbf24', stop2: '#f59e0b' }, // amber
  { stop1: '#fb7185', stop2: '#e11d48' }, // rose
  { stop1: '#34d399', stop2: '#059669' }, // emerald
];

export function Dashboard() {
  const { profile, year, revision } = useApp();
  const currency = useCurrency();

  const assets = useAsyncQuery<AssetAccount[]>(
    () => (profile ? listAssets(profile.id, false) : Promise.resolve([])),
    [profile?.id, revision],
    [],
  );
  const snapshots = useAsyncQuery<BalanceSnapshot[]>(
    () => (year ? listSnapshotsForYear(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );
  const incomeEntries = useAsyncQuery<IncomeEntry[]>(
    () => (year ? listIncomeForYear(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );
  const periods = useAsyncQuery<Period[]>(
    () => (year ? listPeriods(year.id) : Promise.resolve([])),
    [year?.id, revision],
    [],
  );

  if (!year) return null;

  const balanceTotal = totalAssets(assets.map((a) => ({ amount: a.current_balance })));
  const openingTotal = totalAssets(assets.map((a) => ({ amount: a.opening_balance })));
  const ytdDelta = balanceTotal - openingTotal;
  const ytdPct = openingTotal !== 0 ? (ytdDelta / Math.abs(openingTotal)) * 100 : 0;
  const deltaPositive = ytdDelta >= 0;

  // Build per-asset, per-month month-end balances from snapshots, then
  // aggregate by asset_type (category) so the chart shows Cash/Bank/etc.
  // rather than individual accounts.
  const categorySeries = useMemo(() => {
    const perAsset = new Map<number, number[]>();
    for (const a of assets) perAsset.set(a.id, new Array(12).fill(0));
    for (const snap of snapshots) {
      const m = parseInt(snap.snapshot_date.slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) continue;
      const arr = perAsset.get(snap.asset_account_id);
      if (arr) arr[m] = snap.balance_amount;
    }
    for (const arr of perAsset.values()) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] === 0 && arr[i - 1] !== 0) arr[i] = arr[i - 1];
      }
    }

    const byCategory = new Map<string, number[]>();
    for (const a of assets) {
      const key = a.asset_type?.trim() || 'Other';
      const values = perAsset.get(a.id) ?? new Array(12).fill(0);
      const acc = byCategory.get(key) ?? new Array(12).fill(0);
      for (let i = 0; i < 12; i++) acc[i] += values[i];
      byCategory.set(key, acc);
    }

    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, values], i) => ({
        category,
        color: ASSET_COLORS[i % ASSET_COLORS.length],
        values,
      }));
  }, [assets, snapshots]);

  // Only show months up to today for the current year; full year for past years.
  const today = new Date();
  const monthsToShow =
    year.year < today.getFullYear() ? 12
    : year.year > today.getFullYear() ? 0
    : today.getMonth() + 1;
  const visibleMonths = MONTH_LABELS.slice(0, monthsToShow);

  // Net monthly total (signed, so liabilities subtract).
  const monthlyTotals = new Array(monthsToShow).fill(0).map((_, m) =>
    categorySeries.reduce((s, series) => s + (series.values[m] || 0), 0),
  );
  // Sum of positive segments per month — used for stacked-bar sizing.
  const monthlyPositive = new Array(monthsToShow).fill(0).map((_, m) =>
    categorySeries.reduce((s, series) => s + Math.max(0, series.values[m] || 0), 0),
  );
  const hasChartData = monthlyTotals.some((v) => v !== 0);
  const lastNonZeroMonth = monthlyTotals.reduce((best, v, i) => (v !== 0 ? i : best), 0);
  const maxTotal = Math.max(1, ...monthlyPositive, ...monthlyTotals);

  const [activeBar, setActiveBar] = useState(lastNonZeroMonth);

  // Periods that still need attention — surfaced until the user assigns them.
  const pendingPeriods = periods.filter(
    (p) => p.status === 'ready_to_assign' || p.status === 'needs_review',
  );
  const initials = (profile?.name || 'User').trim().slice(0, 1).toUpperCase();

  // Gauge data
  const incomeYTD = incomeEntries.reduce((s, e) => s + e.amount, 0);
  const expensesYTD = periods.reduce((s, p) => s + Math.max(0, p.calculated_expenses), 0);

  const incomePct = incomeYTD > 0 ? 100 : 0;
  const expenseRatio = incomeYTD > 0 ? Math.round((expensesYTD / incomeYTD) * 100) : 0;
  const expensePct = Math.min(100, expenseRatio);

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.title}>
          <h1>Dashboard</h1>
          <p>Payments updates</p>
        </div>
        <div className={styles.topActions}>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input className={styles.searchInput} placeholder="Search" aria-label="Search" />
          </div>
          <button className={styles.iconBtn} type="button" aria-label="Calendar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9h18" />
              <path d="M8 3v4M16 3v4" />
            </svg>
          </button>
          <button className={styles.iconBtn} type="button" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
              <path d="M10 19a2 2 0 0 0 4 0" />
            </svg>
          </button>
          <div className={styles.user}>
            <div className={styles.avatar}>{initials}</div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </header>

      {/* Top row: net-worth credit card + balance/chart side by side */}
          <section className={styles.topRow}>
            <article className={styles.creditCard}>
              <div className={styles.cardTop}>
                <div className={styles.cardChip} aria-hidden>
                  <svg viewBox="0 0 32 24" fill="none">
                    <rect x="0" y="0" width="32" height="24" rx="4" fill="rgba(255,255,255,0.2)" />
                    <path d="M4 8h24M4 14h24M10 4v16M22 4v16" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
                  </svg>
                </div>
                <div className={styles.cardBrand} aria-hidden>
                  <svg viewBox="0 0 28 28" fill="none">
                    <rect width="28" height="28" rx="7" fill="rgba(255,255,255,0.18)" />
                    <path d="M9 19V9h6a3 3 0 0 1 0 6H9m6 0h1a3 3 0 0 1 0 6H9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              <div className={styles.cardNetWorth}>
                <div className={styles.cardEyebrow}>Net worth</div>
                <div className={styles.cardAmount}>{formatMoney(balanceTotal, currency)}</div>
                {openingTotal !== 0 ? (
                  <div className={`${styles.cardDelta} ${deltaPositive ? styles.cardDeltaPositive : styles.cardDeltaNegative}`}>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {deltaPositive ? <path d="M2 8 6 4l4 4" /> : <path d="M2 4 6 8l4-4" />}
                    </svg>
                    <span>
                      {deltaPositive ? '+' : ''}{formatMoney(ytdDelta, currency)} · {ytdPct.toFixed(1)}% YTD
                    </span>
                  </div>
                ) : null}
              </div>

              <div className={styles.cardFoot}>
                <div>
                  <div className={styles.cardSub}>Holder</div>
                  <div className={styles.cardName}>{profile?.name || 'Card holder'}</div>
                </div>
                <div>
                  <div className={styles.cardSub}>Year</div>
                  <div className={styles.cardName}>{year.year} · {year.currency}</div>
                </div>
              </div>
            </article>

            {/* Balance + stacked chart */}
            <section className={styles.balanceCard}>
              <div className={styles.balanceHead}>
                <div>
                  <div className={styles.eyebrow}>Balance breakdown</div>
                  <div className={styles.balanceValue}>{formatMoney(balanceTotal, currency)}</div>
                </div>
                <div className={styles.balanceMeta}>
                  <span>YEAR TO DATE</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <ul className={styles.legend}>
                {categorySeries.map(({ category, color }) => (
                  <li key={category} className={styles.legendItem}>
                    <span
                      className={styles.legendSwatch}
                      style={{ background: `linear-gradient(180deg, ${color.stop1}, ${color.stop2})` } as CSSProperties}
                    />
                    <span className={styles.legendLabel}>{category}</span>
                  </li>
                ))}
                <li className={styles.legendItem}>
                  <span className={styles.legendLine} aria-hidden />
                  <span className={styles.legendLabel}>Net worth</span>
                </li>
              </ul>

              <div className={styles.chartWrap}>
                <div className={styles.yAxis}>
                  <span>{formatYAxisLabel(maxTotal)}</span>
                  <span>{formatYAxisLabel(maxTotal / 2)}</span>
                  <span>{formatYAxisLabel(maxTotal / 10)}</span>
                </div>
                <div className={styles.chart}>
                  <div className={styles.gridLines} aria-hidden>
                    <span /><span /><span />
                  </div>
                  <div className={styles.bars}>
                    {visibleMonths.map((label, i) => {
                      const total = monthlyTotals[i];
                      const positive = monthlyPositive[i];
                      const stackHeightPct = positive > 0 ? Math.max(4, Math.round((positive / maxTotal) * 92)) : 0;
                      const isActive = i === activeBar;
                      return (
                        <button
                          key={label}
                          type="button"
                          onMouseEnter={() => setActiveBar(i)}
                          onFocus={() => setActiveBar(i)}
                          className={`${styles.barCol} ${isActive ? styles.barColActive : ''}`}
                          aria-label={`${label}: ${formatMoney(total, currency)}`}
                        >
                          {isActive && (positive > 0 || total !== 0) ? (
                            <div className={styles.tooltip} role="tooltip">
                              <div className={styles.tooltipLabel}>{label} · Net worth</div>
                              <div className={styles.tooltipValue}>{formatMoney(total, currency)}</div>
                              <ul className={styles.tooltipBreakdown}>
                                {categorySeries.map(({ category, color, values }) => {
                                  const v = values[i];
                                  if (!v) return null;
                                  return (
                                    <li key={category}>
                                      <span
                                        className={styles.tooltipDot}
                                        style={{ background: `linear-gradient(180deg, ${color.stop1}, ${color.stop2})` } as CSSProperties}
                                      />
                                      <span className={styles.tooltipName}>{category}</span>
                                      <span className={styles.tooltipNum}>{formatMoney(v, currency)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                              <div className={styles.tooltipPin} />
                            </div>
                          ) : null}
                          <div
                            className={styles.stack}
                            style={{ height: `${stackHeightPct}%` } as CSSProperties}
                          >
                            {categorySeries.map(({ category, color, values }) => {
                              const v = values[i];
                              if (!v || v < 0 || positive === 0) return null;
                              const seg = (v / positive) * 100;
                              return (
                                <span
                                  key={category}
                                  className={styles.stackSeg}
                                  style={{
                                    height: `${seg}%`,
                                    background: `linear-gradient(180deg, ${color.stop1}, ${color.stop2})`,
                                  } as CSSProperties}
                                />
                              );
                            })}
                          </div>
                        </button>
                      );
                    })}
                    {hasChartData && monthsToShow > 0 ? (
                      <svg
                        className={styles.trendLine}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <polyline
                          points={monthlyTotals
                            .map((v, i) => {
                              const x = ((i + 0.5) / monthsToShow) * 100;
                              const y = 100 - Math.max(0, Math.min(100, (v / maxTotal) * 92));
                              return `${x.toFixed(2)},${y.toFixed(2)}`;
                            })
                            .join(' ')}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="0.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        {monthlyTotals.map((v, i) => {
                          const x = ((i + 0.5) / monthsToShow) * 100;
                          const y = 100 - Math.max(0, Math.min(100, (v / maxTotal) * 92));
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="0.6"
                              fill="#fbbf24"
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                      </svg>
                    ) : null}
                  </div>
                  <div className={styles.xAxis}>
                    {visibleMonths.map((m) => <span key={m}>{m}</span>)}
                  </div>
                </div>
              </div>

              {!hasChartData ? <div className={styles.chartEmpty}>No balance history yet.</div> : null}
            </section>
          </section>

          {pendingPeriods.length > 0 ? (
            <section className={styles.pendingCard}>
              <header className={styles.pendingHead}>
                <div>
                  <div className={styles.eyebrow}>Needs attention</div>
                  <h3 className={styles.pendingTitle}>
                    {pendingPeriods.length} balance update{pendingPeriods.length === 1 ? '' : 's'} waiting to be assigned
                  </h3>
                </div>
              </header>
              <ul className={styles.pendingList}>
                {pendingPeriods.map((p) => {
                  const reviewing = p.status === 'needs_review';
                  return (
                    <li key={p.id} className={styles.pendingItem}>
                      <div className={styles.pendingMeta}>
                        <div className={styles.pendingRange}>
                          {p.start_date} → {p.end_date}
                        </div>
                        <div
                          className={`${styles.pendingTag} ${reviewing ? styles.pendingTagWarn : styles.pendingTagInfo}`}
                        >
                          {reviewing ? 'Needs review' : 'Ready to assign'}
                        </div>
                      </div>
                      <div className={styles.pendingAmount}>
                        {formatMoney(p.calculated_expenses, currency)}
                      </div>
                      <Link to={`/period/${p.id}/assign`} className={styles.pendingAction}>
                        Assign →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className={styles.gaugeRow}>
            <article className={`${styles.gaugeCard} ${styles.gaugeIncome}`}>
              <div className={styles.gaugeHead}>
                <div className={styles.gaugeIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 17l6-6 4 4 8-8" />
                    <path d="M14 7h7v7" />
                  </svg>
                </div>
                <div>
                  <h3>Income</h3>
                  <p>Year to date from balance updates</p>
                </div>
              </div>
              <div className={styles.gaugeBody}>
                <div
                  className={`${styles.gauge} ${styles.gaugePos}`}
                  style={{ '--progress': `${incomePct}%` } as CSSProperties}
                  role="img"
                  aria-label={`Income year to date ${formatMoney(incomeYTD, currency)}`}
                >
                  <strong>{formatCompactMoney(incomeYTD)}</strong>
                  <span>YTD</span>
                </div>
                <dl className={styles.gaugeStats}>
                  <div>
                    <dt>Earned</dt>
                    <dd>{formatMoney(incomeYTD, currency)}</dd>
                  </div>
                  <div>
                    <dt>Periods</dt>
                    <dd>{periods.length}</dd>
                  </div>
                  <div>
                    <dt>Average</dt>
                    <dd>{periods.length > 0 ? formatMoney(Math.round(incomeYTD / periods.length), currency) : '—'}</dd>
                  </div>
                </dl>
              </div>
            </article>

            <article className={`${styles.gaugeCard} ${styles.gaugeExpense}`}>
              <div className={styles.gaugeHead}>
                <div className={`${styles.gaugeIcon} ${styles.gaugeIconNeg}`} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l6 6 4-4 8 8" />
                    <path d="M21 17h-7v-7" />
                  </svg>
                </div>
                <div>
                  <h3>Expenses</h3>
                  <p>Spent so far vs income earned</p>
                </div>
              </div>
              <div className={styles.gaugeBody}>
                <div
                  className={`${styles.gauge} ${styles.gaugeNeg}`}
                  style={{ '--progress': `${expensePct}%` } as CSSProperties}
                  role="img"
                  aria-label={`Expenses ${expenseRatio}% of income`}
                >
                  <strong>{expenseRatio}%</strong>
                  <span>of income</span>
                </div>
                <dl className={styles.gaugeStats}>
                  <div>
                    <dt>Spent</dt>
                    <dd>{formatMoney(expensesYTD, currency)}</dd>
                  </div>
                  <div>
                    <dt>Income</dt>
                    <dd>{incomeYTD > 0 ? formatMoney(incomeYTD, currency) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Saved</dt>
                    <dd>{incomeYTD > 0 ? formatMoney(Math.max(0, incomeYTD - expensesYTD), currency) : '—'}</dd>
                  </div>
                </dl>
              </div>
            </article>
          </section>
    </div>
  );
}

function formatYAxisLabel(minor: number): string {
  const major = minor / 100;
  if (major >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `${Math.round(major / 1000)}K`;
  return `${Math.round(major)}`;
}

function formatCompactMoney(minor: number): string {
  const major = Math.abs(minor) / 100;
  const sign = minor < 0 ? '-' : '';
  if (major >= 1_000_000) return `${sign}${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `${sign}${Math.round(major / 1_000)}K`;
  return `${sign}${Math.round(major)}`;
}
