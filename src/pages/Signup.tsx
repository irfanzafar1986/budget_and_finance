import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './Setup.module.css';

export function Signup() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authErr) throw authErr;

      // With email confirmation required, the session is null until the user
      // clicks the link in their inbox. Show a notice and let them log in
      // after confirming. If email confirmation is disabled in the project,
      // the session will be present — route straight into the app.
      if (data.session) {
        navigate('/', { replace: true });
      } else {
        setNotice(
          "Check your inbox to confirm your email — after that, sign in to get started.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.heading}>Create your account</h1>
        <p className={styles.lede}>It's free. Your budget data is private to you.</p>

        <div className={styles.field}>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className={styles.field}>
            <label className="label" htmlFor="confirm">Confirm</label>
            <input
              id="confirm"
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>

        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Already have an account? <Link to="/login">Sign in</Link>.
        </p>
      </form>
    </div>
  );
}
