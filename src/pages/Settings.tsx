import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Card } from '../components/Card';
import styles from './Settings.module.css';

type Notice = { tone: 'success' | 'error'; message: string } | null;

export function Settings() {
  const { profile, refresh } = useApp();
  const { user, signOut } = useAuth();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    if (!profile) return;
    const confirmed = window.confirm(
      'Delete all of your data — categories, accounts, income sources, periods, and history? ' +
        'You will be returned to the setup screen. This cannot be undone.',
    );
    if (!confirmed) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase
        .from('user_profile')
        .delete()
        .eq('id', profile.id);
      if (error) throw error;
      await refresh();
      window.location.assign('/');
    } catch (err) {
      setNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Could not delete data.',
      });
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Settings</h1>
          <p className={styles.lede}>Manage your account.</p>
        </div>
      </header>

      {notice ? (
        <div className={notice.tone === 'error' ? styles.error : styles.success}>
          {notice.message}
        </div>
      ) : null}

      <Card>
        <div className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Account</h2>
            <p className={styles.copy}>
              Signed in as <strong>{user?.email}</strong>.
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </button>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Delete all data</h2>
            <p className={styles.copy}>
              Wipe everything in your account — categories, asset accounts, income sources,
              periods, and history. You'll be returned to the setup screen. Your sign-in
              account is kept; only the budget data is removed.
            </p>
          </div>
          <button type="button" className="btn btn-danger" onClick={handleReset} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete all data'}
          </button>
        </div>
      </Card>
    </div>
  );
}
