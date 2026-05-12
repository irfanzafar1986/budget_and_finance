# Budget And Finance App Specification

## 1. Purpose

This app helps a person manage a yearly budget without forcing predefined
expense categories.

The main idea is simple:

1. The user defines their own yearly budget categories.
2. The user periodically updates all assets, cash, bank accounts, and other
   tracked balances.
3. The user enters income received during the same period.
4. The app calculates spending from the change in total tracked assets.
5. The app asks the user to assign the calculated spending to their own budget
   categories.
6. Any amount not assigned by the user is tracked as `General`.
7. The app updates the yearly budget and shows used and remaining amounts.

## 2. Main Concept

Most budget apps ask the user to enter every expense manually. This app works
from balance movement instead.

For each period, the app compares:

- Previous total tracked assets
- Current total tracked assets
- Income received during the period

Then it calculates the amount that must have been spent.

Basic formula:

```text
Calculated Expenses =
Previous Total Assets + Income During Period - Current Total Assets
```

Example:

```text
Previous assets: 10,000
Income:           3,000
Current assets:  11,500

Calculated expenses = 10,000 + 3,000 - 11,500
Calculated expenses = 1,500
```

The app then asks the user to assign that `1,500` into their own budget
categories.

## 3. Product Rules

- The app must not provide fixed default expense categories.
- The user creates all budget categories manually.
- The app keeps one system fallback category named `General` for each budget
  year.
- Income sources are also user-created.
- Assets and accounts are user-created.
- The app calculates expenses from balance changes.
- The user decides how calculated expenses are assigned to categories.
- Any amount not assigned to a specific category is tracked as `General`.
- Remaining yearly budget is recalculated after each assignment.
- Transfers between the user's own accounts must not count as income or expense.
- Buying a tracked asset should not count as an expense if the asset remains in
  the tracked asset list.
- If calculated expenses are negative, the app should ask the user to review the
  period instead of automatically treating it as income.

## 4. Core User Flow

### 4.1 First-Time Setup

The user creates a year profile.

Required fields:

- Year
- Currency
- User name or profile name

The user adds budget categories.

Required fields:

- Category name
- Yearly budget amount

The app stores:

- Total yearly budget
- Used amount per category
- Remaining amount per category
- General expense amount

`General` is created by the app as a fallback bucket. The user can edit its
yearly budget amount, but it should not be part of a larger predefined category
list.

### 4.2 Add Assets And Accounts

The user adds everything they want to track.

Examples:

- Cash
- Bank account
- Savings account
- Investment account
- Property
- Receivable amount
- Other asset

Required fields:

- Account or asset name
- Asset type
- Opening balance
- Current balance
- Start date

The app should allow any asset type text entered by the user.

### 4.3 Periodic Balance Update

The user creates a new period update.

Required fields:

- Period start date
- Period end date
- Current balance for each tracked asset or account

The app calculates:

- Previous total tracked assets
- Current total tracked assets
- Net change in tracked assets

### 4.4 Add Income

The user adds income received during the same period.

Required fields:

- Income source name
- Amount
- Date
- Optional note

Income sources are not predefined. The user can create them freely.

### 4.5 Calculate Expenses

After balances and income are entered, the app calculates period expenses.

```text
Calculated Expenses =
Previous Total Assets + Period Income - Current Total Assets
```

If the result is positive:

- The app shows the amount as expenses to assign.

If the result is zero:

- The app shows that no expenses need assignment.

If the result is negative:

- The app shows a review warning.
- The app asks the user to check balances, missing income, new assets, or data
  entry mistakes.

### 4.6 Assign Expenses

The app asks the user to assign calculated expenses to budget categories.

The user can:

- Select an existing category.
- Create a new category.
- Enter the assigned amount.
- Leave some amount for `General`.

The app validates:

- Assigned total cannot be greater than calculated expenses unless the user
  confirms an override.
- General amount equals calculated expenses minus specifically assigned total.

If the user does not assign the full calculated expense amount, the remaining
amount is automatically saved under `General`.

### 4.7 Update Year Budget

After assignment, the app updates each affected category.

```text
Updated Used Amount =
Previous Used Amount + New Assigned Expense

Remaining Budget =
Yearly Budget Amount - Updated Used Amount
```

The app shows:

- Budget amount
- Used amount
- Remaining amount
- Percent used
- Over-budget amount, if any

## 5. Data Model

### 5.1 UserProfile

```text
id
name
default_currency
created_at
updated_at
```

### 5.2 BudgetYear

```text
id
user_profile_id
year
currency
created_at
updated_at
```

### 5.3 BudgetCategory

```text
id
budget_year_id
name
yearly_budget_amount
used_amount
is_system
created_at
updated_at
```

Notes:

- No predefined category seed data.
- Category names are user-defined.
- A category belongs to one budget year.
- `General` is the only system category.

### 5.4 AssetAccount

```text
id
user_profile_id
name
asset_type
opening_balance
current_balance
is_active
created_at
updated_at
```

Notes:

- `asset_type` is free text.
- Examples may be shown only as placeholder text, not fixed categories.

### 5.5 BalanceSnapshot

```text
id
asset_account_id
period_id
balance_amount
snapshot_date
created_at
updated_at
```

### 5.6 Period

```text
id
budget_year_id
start_date
end_date
previous_total_assets
current_total_assets
total_income
calculated_expenses
specific_category_expenses
general_expenses
status
created_at
updated_at
```

Suggested statuses:

```text
draft
needs_review
ready_to_assign
assigned
closed
```

### 5.7 IncomeEntry

```text
id
period_id
source_name
amount
income_date
note
created_at
updated_at
```

### 5.8 ExpenseAssignment

```text
id
period_id
budget_category_id
amount
note
created_at
updated_at
```

## 6. Calculation Details

### 6.1 Total Assets

```text
Total Assets = sum of all active asset/account balances for the period
```

### 6.2 Net Change In Assets

```text
Net Change In Assets = Current Total Assets - Previous Total Assets
```

### 6.3 Calculated Expenses

```text
Calculated Expenses =
Previous Total Assets + Total Period Income - Current Total Assets
```

### 6.4 General Expenses

```text
General Expenses =
Calculated Expenses - Specific Category Expenses
```

If the user assigns every expense to a specific category, `General Expenses`
will be zero.

The app should save the general amount as an expense assignment against the
system `General` category so yearly budget totals stay consistent.

### 6.5 Category Remaining Budget

```text
Remaining Budget =
Yearly Budget Amount - Used Amount
```

## 7. Important Edge Cases

### Transfers

If the user moves money from one tracked bank account to another tracked bank
account, total assets do not change. No expense should be calculated.

### New Asset Purchase

If the user buys an asset and tracks it in the app, the purchase should not
appear as a normal expense because total tracked assets still include the new
asset value.

Example:

```text
Cash decreases by 5,000
Tracked asset increases by 5,000
Total assets unchanged
Expense calculated as 0
```

### Untracked Asset Purchase

If the user buys something valuable but does not track it as an asset, the app
will treat the cash reduction as an expense. This is acceptable, but the app can
suggest adding it as an asset if the user wants to track wealth more accurately.

### Negative Calculated Expenses

A negative result usually means one of these happened:

- Income was missed.
- Current asset balances are too high.
- Previous balances were too low.
- A new asset was added without a proper opening balance.
- The user received money that was not entered as income.

The app should mark the period as `needs_review`.

### Debt And Liabilities

Version 1 can focus on assets only. However, the design should leave room for
liabilities later because loans, credit cards, and debts affect real net worth.

Future formula:

```text
Net Position = Total Assets - Total Liabilities

Calculated Expenses =
Previous Net Position + Income During Period - Current Net Position
```

## 8. Screens

### Dashboard

Shows:

- Current total assets
- Year-to-date income
- Year-to-date calculated expenses
- Year-to-date specific category expenses
- Year-to-date general expenses
- Budget used and remaining
- Latest period status

### Budget Categories

Allows the user to:

- Add category
- Rename category
- Set yearly budget amount
- View used amount
- View remaining amount
- View over-budget amount

### Assets And Accounts

Allows the user to:

- Add asset/account
- Edit asset/account
- Mark asset/account inactive
- View latest balance
- View balance history

### Period Update

Allows the user to:

- Create a new period
- Enter current balances
- Add income
- Calculate expenses
- See review warnings

### Expense Assignment

Allows the user to:

- View calculated expenses
- Assign amounts to budget categories
- Create category while assigning
- See remaining amount that will be saved as `General`
- Save assignment

### Reports

Shows:

- Budget remaining by category
- Expense assignments by period
- Income by source
- Asset growth over time
- General expenses trend

## 9. Validation Rules

- Year must be valid.
- Budget category name cannot be empty.
- Budget amount must be zero or greater.
- Asset/account name cannot be empty.
- Asset balance must be numeric.
- Income amount must be greater than zero.
- Period end date must be after or equal to period start date.
- Periods in the same budget year should not overlap.
- Expense assignment amount must be zero or greater.
- Total assigned expenses should not exceed calculated expenses unless the user
  confirms an override.

## 10. Suggested Version 1 Build

Build the first version as a local web app.

Recommended stack:

- Frontend: React
- Styling: CSS
- Storage: browser localStorage or SQLite
- Later upgrade: backend API with database

Version 1 features:

- Create one budget year.
- Add custom budget categories.
- Add custom assets/accounts.
- Create period updates.
- Add income entries.
- Calculate expenses.
- Assign expenses to categories.
- Track remaining assigned amount as `General`.
- Show remaining yearly budget.
- Store data locally.

Version 1 does not need:

- Bank integrations
- Multi-user accounts
- Automatic transaction import
- Tax reporting
- Complex investment valuation

## 11. Implementation Plan

### Step 1: Data Structure

Create models for:

- Budget year
- Budget categories
- Asset accounts
- Periods
- Balance snapshots
- Income entries
- Expense assignments

### Step 2: Budget Setup UI

Create screens for:

- Year setup
- Category creation
- Category budget amounts

### Step 3: Asset Tracking UI

Create screens for:

- Adding assets/accounts
- Updating balances
- Showing latest balances

### Step 4: Period Update Flow

Create a guided flow:

1. Select period dates.
2. Enter balances.
3. Enter income.
4. Calculate expenses.
5. Review result.

### Step 5: Expense Assignment Flow

Create assignment screen:

- Show calculated expenses.
- Let user assign amount to categories.
- Show assigned and `General` totals live.
- Save assignments.

### Step 6: Dashboard And Reports

Create summary views:

- Current assets
- Income this year
- Expenses this year
- Remaining budgets
- General expenses

## 12. Success Criteria

The app is successful when:

- A user can create their own budget categories.
- A user can enter assets, cash, and bank balances periodically.
- A user can enter income for a period.
- The app calculates expenses from the asset difference.
- The user can assign calculated expenses to categories.
- The app updates used and remaining yearly budget amounts.
- The user can clearly see how much budget remains.
