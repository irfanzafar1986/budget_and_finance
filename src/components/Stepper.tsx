import styles from './Stepper.module.css';

export interface Step {
  label: string;
}

export function Stepper({
  steps,
  currentIndex,
}: {
  steps: Step[];
  currentIndex: number;
}) {
  return (
    <ol className={styles.steps} aria-label="Steps">
      {steps.map((step, i) => {
        const state =
          i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
        return (
          <li key={i} className={`${styles.step} ${styles[state]}`}>
            <span className={styles.bubble}>{i < currentIndex ? '✓' : i + 1}</span>
            <span className={styles.label}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
