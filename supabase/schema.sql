-- Budget & Finance — v2 Postgres schema for Supabase.
-- Money values are stored as BIGINT minor units (e.g. cents).
-- Dates are DATE (YYYY-MM-DD); timestamps are TIMESTAMPTZ (auto-set to now()).
-- Row Level Security is enforced on every table: a row is visible iff it chains
-- back through user_profile.auth_user_id = auth.uid().
--
-- Run this once in the Supabase SQL Editor against a fresh project.

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_profile (
  id               BIGSERIAL PRIMARY KEY,
  auth_user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  default_currency TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_year (
  id              BIGSERIAL PRIMARY KEY,
  user_profile_id BIGINT NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_profile_id, year)
);
CREATE INDEX IF NOT EXISTS ix_budget_year_profile ON budget_year(user_profile_id);

CREATE TABLE IF NOT EXISTS budget_category (
  id                   BIGSERIAL PRIMARY KEY,
  budget_year_id       BIGINT NOT NULL REFERENCES budget_year(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  yearly_budget_amount BIGINT NOT NULL DEFAULT 0,
  used_amount          BIGINT NOT NULL DEFAULT 0,
  is_system            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (budget_year_id, name)
);
CREATE INDEX IF NOT EXISTS ix_budget_category_year ON budget_category(budget_year_id);

CREATE TABLE IF NOT EXISTS asset_account (
  id              BIGSERIAL PRIMARY KEY,
  user_profile_id BIGINT NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  asset_type      TEXT NOT NULL,
  opening_balance BIGINT NOT NULL DEFAULT 0,
  current_balance BIGINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_asset_account_profile ON asset_account(user_profile_id);

CREATE TABLE IF NOT EXISTS period (
  id                          BIGSERIAL PRIMARY KEY,
  budget_year_id              BIGINT NOT NULL REFERENCES budget_year(id) ON DELETE CASCADE,
  start_date                  DATE NOT NULL,
  end_date                    DATE NOT NULL,
  previous_total_assets       BIGINT NOT NULL DEFAULT 0,
  current_total_assets        BIGINT NOT NULL DEFAULT 0,
  total_income                BIGINT NOT NULL DEFAULT 0,
  calculated_expenses         BIGINT NOT NULL DEFAULT 0,
  specific_category_expenses  BIGINT NOT NULL DEFAULT 0,
  general_expenses            BIGINT NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'draft',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_period_year ON period(budget_year_id);
CREATE INDEX IF NOT EXISTS ix_period_year_dates ON period(budget_year_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS balance_snapshot (
  id               BIGSERIAL PRIMARY KEY,
  asset_account_id BIGINT NOT NULL REFERENCES asset_account(id) ON DELETE CASCADE,
  period_id        BIGINT NOT NULL REFERENCES period(id) ON DELETE CASCADE,
  balance_amount   BIGINT NOT NULL,
  snapshot_date    DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_balance_snapshot_period ON balance_snapshot(period_id);
CREATE INDEX IF NOT EXISTS ix_balance_snapshot_asset_date ON balance_snapshot(asset_account_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS income_entry (
  id          BIGSERIAL PRIMARY KEY,
  period_id   BIGINT NOT NULL REFERENCES period(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  amount      BIGINT NOT NULL,
  income_date DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_income_entry_period ON income_entry(period_id);

CREATE TABLE IF NOT EXISTS income_source (
  id                     BIGSERIAL PRIMARY KEY,
  budget_year_id         BIGINT NOT NULL REFERENCES budget_year(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  expected_yearly_amount BIGINT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (budget_year_id, name)
);
CREATE INDEX IF NOT EXISTS ix_income_source_year ON income_source(budget_year_id);

CREATE TABLE IF NOT EXISTS yearly_income_entry (
  id               BIGSERIAL PRIMARY KEY,
  income_source_id BIGINT NOT NULL REFERENCES income_source(id) ON DELETE CASCADE,
  amount           BIGINT NOT NULL,
  income_date      DATE NOT NULL,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_yearly_income_entry_source ON yearly_income_entry(income_source_id);
CREATE INDEX IF NOT EXISTS ix_yearly_income_entry_date ON yearly_income_entry(income_date);

CREATE TABLE IF NOT EXISTS expense_assignment (
  id                 BIGSERIAL PRIMARY KEY,
  period_id          BIGINT NOT NULL REFERENCES period(id) ON DELETE CASCADE,
  budget_category_id BIGINT NOT NULL REFERENCES budget_category(id) ON DELETE RESTRICT,
  amount             BIGINT NOT NULL,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_expense_assignment_period ON expense_assignment(period_id);
CREATE INDEX IF NOT EXISTS ix_expense_assignment_category ON expense_assignment(budget_category_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- A row is visible iff its user_profile chain ends at auth.uid().
-- Same predicate covers SELECT / INSERT / UPDATE / DELETE for each table.

ALTER TABLE user_profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_year         ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_category     ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_account       ENABLE ROW LEVEL SECURITY;
ALTER TABLE period              ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_snapshot    ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entry        ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_source       ENABLE ROW LEVEL SECURITY;
ALTER TABLE yearly_income_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_assignment  ENABLE ROW LEVEL SECURITY;

-- user_profile: directly keyed to auth.uid().
CREATE POLICY user_profile_owner ON user_profile
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- budget_year: through user_profile.
CREATE POLICY budget_year_owner ON budget_year
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profile p
     WHERE p.id = budget_year.user_profile_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profile p
     WHERE p.id = budget_year.user_profile_id
       AND p.auth_user_id = auth.uid()
  ));

-- asset_account: through user_profile.
CREATE POLICY asset_account_owner ON asset_account
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profile p
     WHERE p.id = asset_account.user_profile_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profile p
     WHERE p.id = asset_account.user_profile_id
       AND p.auth_user_id = auth.uid()
  ));

-- budget_category: through budget_year → user_profile.
CREATE POLICY budget_category_owner ON budget_category
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = budget_category.budget_year_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = budget_category.budget_year_id
       AND p.auth_user_id = auth.uid()
  ));

-- income_source: through budget_year → user_profile.
CREATE POLICY income_source_owner ON income_source
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = income_source.budget_year_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = income_source.budget_year_id
       AND p.auth_user_id = auth.uid()
  ));

-- period: through budget_year → user_profile.
CREATE POLICY period_owner ON period
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = period.budget_year_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_year y
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE y.id = period.budget_year_id
       AND p.auth_user_id = auth.uid()
  ));

-- balance_snapshot: through period → budget_year → user_profile.
CREATE POLICY balance_snapshot_owner ON balance_snapshot
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = balance_snapshot.period_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = balance_snapshot.period_id
       AND p.auth_user_id = auth.uid()
  ));

-- income_entry: through period → budget_year → user_profile.
CREATE POLICY income_entry_owner ON income_entry
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = income_entry.period_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = income_entry.period_id
       AND p.auth_user_id = auth.uid()
  ));

-- yearly_income_entry: through income_source → budget_year → user_profile.
CREATE POLICY yearly_income_entry_owner ON yearly_income_entry
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM income_source s
      JOIN budget_year y ON y.id = s.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE s.id = yearly_income_entry.income_source_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM income_source s
      JOIN budget_year y ON y.id = s.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE s.id = yearly_income_entry.income_source_id
       AND p.auth_user_id = auth.uid()
  ));

-- expense_assignment: through period → budget_year → user_profile.
CREATE POLICY expense_assignment_owner ON expense_assignment
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = expense_assignment.period_id
       AND p.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM period pe
      JOIN budget_year y ON y.id = pe.budget_year_id
      JOIN user_profile p ON p.id = y.user_profile_id
     WHERE pe.id = expense_assignment.period_id
       AND p.auth_user_id = auth.uid()
  ));

-- =============================================================================
-- Triggers: keep updated_at fresh.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profile_updated     BEFORE UPDATE ON user_profile     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_budget_year_updated      BEFORE UPDATE ON budget_year      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_budget_category_updated  BEFORE UPDATE ON budget_category  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_asset_account_updated    BEFORE UPDATE ON asset_account    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_period_updated           BEFORE UPDATE ON period           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_income_source_updated    BEFORE UPDATE ON income_source    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- RPC: recompute_used_amounts(yearId)
-- Called from the client after assignments change to roll the per-category
-- used_amount aggregates in one server-side statement (avoids N round-trips).
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_used_amounts(p_year_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  UPDATE budget_category bc
     SET used_amount = COALESCE((
           SELECT SUM(ea.amount) FROM expense_assignment ea
            WHERE ea.budget_category_id = bc.id
         ), 0)
   WHERE bc.budget_year_id = p_year_id;
END;
$$;
