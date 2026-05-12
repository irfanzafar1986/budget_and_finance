import { useMemo, useState, type CSSProperties } from 'react';
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

  // Build per-asset, per-month month-end balances from snapshots.
  // monthlyByAsset[assetId][monthIdx] = balance at the end of that month.
  const monthlyByAsset = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const a of assets) map.set(a.id, new Array(12).fill(0));
    for (const snap of snapshots) {
      const m = parseInt(snap.snapshot_date.slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) continue;
      const arr = map.get(snap.asset_account_id);
      if (arr) arr[m] = snap.balance_amount;
    }
    // Forward-fill: if a month is missing, carry the prior month forward.
    for (const arr of map.values()) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] === 0 && arr[i - 1] !== 0) arr[i] = arr[i - 1];
      }
    }
    return map;
  }, [assets, snapshots]);

  const assetSeries = assets.map((a, i) => ({
    asset: a,
    color: ASSET_COLORS[i % ASSET_COLORS.length],
    values: monthlyByAsset.get(a.id) ?? new Array(12).fill(0),
  }));

  // Stacked totals per month for max-axis sizing.
  const monthlyTotals = new Array(12).fill(0).map((_, m) =>
    assetSeries.reduce((s, series) => s + (series.values[m] || 0), 0),
  );
  const hasChartData = monthlyTotals.some((v) => v > 0);
  const lastNonZeroMonth = monthlyTotals.reduce((best, v, i) => (v > 0 ? i : best), 0);
  const maxTotal = Math.max(1, ...monthlyTotals);

  const [activeBar, setActiveBar] = useState(lastNonZeroMonth);
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
                {assetSeries.map(({ asset, color }) => (
                  <li key={asset.id} className={styles.legendItem}>
                    <span
                      className={styles.legendSwatch}
                      style={{ background: `linear-gradient(180deg, ${color.stop1}, ${color.stop2})` } as CSSProperties}
                    />
                    <span className={styles.legendLabel}>{asset.name}</span>
                  </li>
                ))}
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
                    {MONTH_LABELS.map((label, i) => {
                      const total = monthlyTotals[i];
                      const totalHeightPct = total > 0 ? Math.max(4, Math.round((total / maxTotal) * 92)) : 0;
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
                          {isActive && total > 0 ? (
                            <div className={styles.tooltip} role="tooltip">
                              <div className={styles.tooltipLabel}>{label} · Total</div>
                              <div className={styles.tooltipValue}>{formatMoney(total, currency)}</div>
                              <ul className={styles.tooltipBreakdown}>
                                {assetSeries.map(({ asset, color, values }) => {
                                  const v = values[i];
                                  if (!v) return null;
                                  return (
                                    <li key={asset.id}>
                                      <span
                                        className={styles.tooltipDot}
                                        style={{ background: `linear-gradient(180deg, ${color.stop1}, ${color.stop2})` } as CSSProperties}
                                      />
                                      <span className={styles.tooltipName}>{asset.name}</span>
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
                            style={{ height: `${totalHeightPct}%` } as CSSProperties}
                          >
                            {assetSeries.map(({ asset, color, values }) => {
                              const v = values[i];
                              if (!v || total === 0) return null;
                              const seg = (v / total) * 100;
                              return (
                                <span
                                  key={asset.id}
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
                  </div>
                  <div className={styles.xAxis}>
                    {MONTH_LABELS.map((m) => <span key={m}>{m}</span>)}
                  </div>
                </div>
              </div>

              {!hasChartData ? <div className={styles.chartEmpty}>No balance history yet.</div> : null}
            </section>
          </section>

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
