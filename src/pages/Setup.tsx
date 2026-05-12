import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { createProfile } from '../db/repos/userProfile';
import { createYearWithGeneral } from '../db/repos/budgetYear';
import { validateName, validateYear, validateCurrency } from '../domain/validation';
import styles from './Setup.module.css';

export function Setup() {
  const { profile, year, refresh } = useApp();
  const navigate = useNavigate();

  const thisYear = new Date().getFullYear();
  const [name, setName] = useState(profile?.name ?? '');
  const [yearVal, setYearVal] = useState<number>(year?.year ?? thisYear);
  const [currency, setCurrency] = useState(year?.currency ?? profile?.default_currency ?? 'USD');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const checks = [
      validateName(name, 'Your name'),
      validateYear(yearVal),
      validateCurrency(currency),
    ];
    for (const c of checks) {
      if (!c.ok) {
        setError(c.message);
        return;
      }
    }

    setSaving(true);
    try {
      const p = profile ?? (await createProfile(name.trim(), currency));
      if (!year) {
        await createYearWithGeneral({
          userProfileId: p.id,
          year: yearVal,
          currency: currency.toUpperCase(),
        });
      }
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.heading}>Welcome 👋</h1>
        <p className={styles.lede}>
          Let's set up your first budget year. You can change any of this later.
        </p>

        <div className={styles.field}>
          <label className="label" htmlFor="name">Your name</label>
          <input
            id="name"
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam Jones"
            autoFocus
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className="label" htmlFor="year">Budget year</label>
            <input
              id="year"
              className="input"
              type="number"
              value={yearVal}
              onChange={(e) => setYearVal(Number(e.target.value))}
              min={1900}
              max={2200}
            />
          </div>

          <div className={styles.field}>
            <label className="label" htmlFor="currency">Currency</label>
            <input
              id="currency"
              className="input"
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="USD"
            />
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Create budget'}
        </button>

        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Your data is private to your account and synced across your devices.
        </p>
      </form>
    </div>
  );
}
