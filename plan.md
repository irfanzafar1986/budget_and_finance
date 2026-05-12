# Budget and Finance App — V1 Implementation Plan

## Context

The repo currently contains only a spec (`budget-finance-app-spec.md`) and a paper-form workflow (`yearly-budget-template.txt`). No code exists yet.

The product idea is unusual and is what the build must preserve: **the user does not enter individual expenses**. They enter periodic asset balances and income, and the app derives total expenses from balance movement:

```
Calculated Expenses = Previous Total Assets + Period Income − Current Total Assets
```

The user then assigns that lump-sum expense to **their own** budget categories. Anything left unassigned falls into a system `General` bucket. There are no predefined categories — that absence is a product rule, not an oversight.

This plan covers the full V1 scope from spec §10: one budget year, custom categories, custom assets, period updates, income entry, expense calculation, expense assignment, dashboard, and local persistence.

## Stack (decided)

- **Vite + React 18 + TypeScript** — strict mode on; types matter for a money app where a wrong sign or unit silently corrupts the ledger.
- **SQLite via sql.js (WASM)** — DB held in memory; the binary blob is persisted to **IndexedDB** after each write (debounced). sql.js is the simpler, well-documented path; OPFS via wa-sqlite is a future upgrade if needed.
- **CSS Modules** — scoped per component; one shared `tokens.css` for colors/spacing.
- **react-router-dom** for navigation; **Vitest** for unit tests on the calculation engine.
- No Redux/Zustand — a single React Context + reducer is enough for V1.

## Money representation (critical)

All monetary amounts are stored and computed as **integers in minor units** (e.g. cents). Convert to/from decimal strings only at the input/display boundary. This eliminates `0.1 + 0.2` rounding drift across hundreds of period assignments.

Helper module: `src/utils/money.ts` — `parseAmount(string) → bigint | number`, `formatAmount(value, currency) → string`. Use `number` (safe to ~9e15 cents = $90 trillion) rather than `bigint` to keep ergonomics simple; document the cap.

## Project layout

```
src/
  main.tsx, App.tsx, index.css
  routes.tsx                  // react-router setup
  db/
    schema.sql                // DDL, embedded as a string at build
    connection.ts             // sql.js init + IndexedDB persistence
    repos/
      budgetYear.ts
      category.ts
      asset.ts
      period.ts
      snapshot.ts
      income.ts
      assignment.ts
  domain/
    types.ts                  // TS types mirroring spec §5
    calculations.ts           // pure functions; spec §6 math
    validation.ts             // spec §9 rules
  state/
    AppContext.tsx            // current year, active period, dispatch
  pages/
    Setup.tsx                 // first-time year setup wizard
    Dashboard.tsx
    Categories.tsx
    Assets.tsx
    PeriodNew.tsx             // multi-step: dates → balances → income → calc
    PeriodAssign.tsx          // expense assignment
    Reports.tsx
  components/
    Layout.tsx, Nav.tsx, MoneyInput.tsx, Card.tsx, Modal.tsx, Stepper.tsx, ...
  utils/
    money.ts, dates.ts
tests/
  calculations.test.ts
  validation.test.ts
```

## Data model (matches spec §5)

SQLite schema in `src/db/schema.sql`:

- `user_profile (id, name, default_currency, created_at, updated_at)`
- `budget_year (id, user_profile_id, year, currency, ...)` — V1 will only have one row, but the FK is kept so multi-year can be added without migration
- `budget_category (id, budget_year_id, name, yearly_budget_amount, used_amount, is_system, ...)` — `is_system = 1` only for the auto-created `General` row per year
- `asset_account (id, user_profile_id, name, asset_type TEXT, opening_balance, current_balance, is_active, ...)`
- `balance_snapshot (id, asset_account_id, period_id, balance_amount, snapshot_date, ...)`
- `period (id, budget_year_id, start_date, end_date, previous_total_assets, current_total_assets, total_income, calculated_expenses, specific_category_expenses, general_expenses, status, ...)` — status enum stored as TEXT, one of `draft | needs_review | ready_to_assign | assigned | closed`
- `income_entry (id, period_id, source_name, amount, income_date, note, ...)`
- `expense_assignment (id, period_id, budget_category_id, amount, note, ...)`

All amounts are `INTEGER` (minor units). All dates are `TEXT` ISO-8601 (`YYYY-MM-DD`). FK constraints on; cascade deletes for child tables (snapshots, income, assignments) when a period is deleted.

Indexes: `(budget_year_id)` on category and period; `(period_id)` on snapshot, income, assignment; `(asset_account_id, snapshot_date DESC)` on snapshot for "latest before date" lookups.

## Calculation engine (`src/domain/calculations.ts`)

Pure functions, no DB, fully unit-tested. Every formula maps 1:1 to spec §6:

```ts
totalAssets(balances: { amount: number }[]): number
netChangeInAssets(prev: number, curr: number): number
calculatedExpenses(prev: number, income: number, curr: number): number
generalExpenses(calculated: number, specificAssigned: number): number
remainingBudget(yearly: number, used: number): number
percentUsed(used: number, yearly: number): number
periodStatusFromCalc(calculated: number): 'ready_to_assign' | 'needs_review'
```

`previousTotalAssets` for a period is computed by the period repo: for each asset active during the period, take the latest `balance_snapshot.balance_amount` strictly before `period.start_date`, falling back to `asset_account.opening_balance` if none exists. The repo passes the resolved numbers into the pure functions above so the engine itself stays IO-free.

## Persistence layer (`src/db/connection.ts`)

1. On boot: `initSqlJs()`, then read DB blob from IndexedDB key `budget-app-db`. If absent, run `schema.sql` against a fresh in-memory DB.
2. Expose `db.exec`, `db.run`, plus a `commit()` that calls `db.export()` and writes the resulting `Uint8Array` to IndexedDB.
3. `commit()` is debounced ~200ms so a flurry of repo writes coalesces into one save.
4. A "Reset all data" action clears the IndexedDB key and reloads.
5. (Optional, low effort) "Export backup" downloads the blob as `budget-YYYY.sqlite`; "Import backup" reads a file and overwrites the IndexedDB key.

## Screens (spec §8)

### Setup (first-run wizard, `/setup`)
Year + currency + profile name → creates `user_profile`, `budget_year`, and seeds the system `General` category with `yearly_budget_amount = 0` (user can edit later). Redirect to Dashboard.

### Dashboard (`/`)
Cards: current total assets, YTD income, YTD calculated expenses, YTD specific-category expenses, YTD General expenses, total yearly budget used / remaining, latest period status. CTA buttons to "New period" and "View categories".

### Categories (`/categories`)
Table of categories: name, yearly budget, used, remaining, % used, over-budget badge. Add/rename/delete (block delete if `is_system` or has assignments). Inline-edit yearly budget.

### Assets (`/assets`)
Table of assets/accounts: name, type, opening, current, last updated. Add (asset_type is free-text input, with a non-binding placeholder list of suggestions: Cash, Bank, Savings, Investment, Property, Receivable). Edit, mark inactive (soft delete — keeps historical snapshots intact).

### Period Update (`/period/new`, multi-step)
Stepper: **1. Dates** → **2. Balances** (one MoneyInput per active asset, prefilled with current balance) → **3. Income** (rows: source / amount / date / note, add/remove) → **4. Calculate** (shows previous total, current total, income, calculated expenses; if negative, shows the spec §7 review checklist and marks status `needs_review`; if zero, shows "no expenses to assign"; otherwise status `ready_to_assign`).

On Save: insert `period`, snapshots, income rows in a single SQL transaction; update each asset's `current_balance`; set period status; navigate to assignment if `ready_to_assign`.

### Expense Assignment (`/period/:id/assign`)
List all categories (including `General`) with a MoneyInput per row. Live footer: "Assigned X of Y. General will receive Z." Validation:
- Each amount ≥ 0.
- Sum ≤ calculated_expenses unless user toggles "allow over-assignment".
- Any unassigned remainder auto-saves as a `General` assignment so totals reconcile.

Save in one transaction: write `expense_assignment` rows, increment `budget_category.used_amount` for each, set period status to `assigned`, update `period.specific_category_expenses` and `period.general_expenses`. Allow editing assignments later (replace previous rows for the period; recompute `used_amount` deltas).

"Create new category" inline action opens a small modal — useful flow per spec §4.6.

### Reports (`/reports`)
Read-only tables/charts (charts can be plain CSS bars in V1, no library):
- Budget remaining by category
- Expense assignments grouped by period
- Income by source
- Asset growth over time (period-by-period totals)
- General expenses trend

## Validation (spec §9, in `src/domain/validation.ts`)

Pure validators returning `{ ok: true } | { ok: false; message: string }`. Called from forms and again at the repo layer as a defense-in-depth check.

- Period overlap is checked at write time: `SELECT 1 FROM period WHERE budget_year_id = ? AND NOT (end_date < ? OR start_date > ?)` against the new period's dates.
- Negative calculated expenses → period saved with `status = 'needs_review'` and the assignment screen is gated until the user revisits the balances/income.

## Implementation order

1. **Scaffold**: `npm create vite@latest`, add deps (`react-router-dom`, `sql.js`, `vitest`, `@types/sql.js`), set up CSS Modules, baseline `Layout` + `Nav`.
2. **DB layer**: `schema.sql`, `connection.ts` with sql.js + IndexedDB persistence + debounced `commit()`. Smoke test: write/read a row, reload page, row still there.
3. **Domain types + calculations + validation** with unit tests. **Do this before any screen** — the math is the heart of the app.
4. **Repos** for each entity. Each repo function is one transaction.
5. **Setup wizard** + **AppContext** loading current year on boot.
6. **Categories** screen (simplest CRUD, gets the read/write loop end-to-end).
7. **Assets** screen.
8. **Period multi-step** flow, including the negative-expenses review state.
9. **Expense Assignment** screen — the trickiest UX piece. Get the live-totals footer right.
10. **Dashboard** + **Reports**.
11. **Polish pass**: empty states, error toasts, "Reset all data" + "Export/Import backup", a11y on forms, currency formatting per `budget_year.currency`.

## Edge cases to handle (spec §7)

- **Transfers between tracked accounts** — handled implicitly by the math (zero net change). No special UI needed; just keep both accounts tracked.
- **Buying a tracked asset** — same: cash down, asset up, net zero. The asset must be added to the tracked list before the period it's purchased in, otherwise the period before its existence won't include it.
- **Untracked-asset purchase** — shows up as a normal expense (correct). Optional tooltip on the assignment screen suggesting "track this as an asset?" — defer to polish.
- **Negative calculated expenses** — `needs_review` status, assignment blocked, dashboard shows a banner with the spec §7 checklist.
- **New asset added mid-year** — the asset's `opening_balance` is treated as its balance at its `created_at`. Periods predating it ignore it. Document this clearly in the Add-Asset form so the user enters the *current* opening balance, not a historic one.
- **Liabilities** — out of V1 (spec §7 explicitly defers them). Schema leaves room: a future `liability_account` table mirroring `asset_account` plus a swap of total-assets for net-position in the calc engine.

