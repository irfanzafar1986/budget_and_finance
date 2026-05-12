import { type ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({
  title,
  subtitle,
  children,
  actions,
  tone = 'neutral',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <section className={`${styles.card} ${styles[tone]}`}>
      {(title || actions) && (
        <header className={styles.header}>
          <div>
            {title ? <h3 className={styles.title}>{title}</h3> : null}
            {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`${styles.stat} ${styles[tone]}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  );
}
