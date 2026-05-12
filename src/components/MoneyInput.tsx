import { useEffect, useState } from 'react';
import { currencySymbol, formatAmount, parseAmount } from '../utils/money';
import styles from './MoneyInput.module.css';

export interface MoneyInputProps {
  value: number;
  onChange: (minor: number) => void;
  currency?: string;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  /** Allow negative input. Defaults to false. */
  allowNegative?: boolean;
  disabled?: boolean;
}

export function MoneyInput({
  value,
  onChange,
  currency = 'USD',
  placeholder,
  ariaLabel,
  id,
  allowNegative = false,
  disabled,
}: MoneyInputProps) {
  // Local string state so users can type freely (e.g. "1.0" before typing "5").
  const [text, setText] = useState<string>(() => formatAmount(value, currency));
  const [focused, setFocused] = useState(false);

  // Sync external value into the field unless the user is actively editing it.
  useEffect(() => {
    if (focused) return;
    setText(formatAmount(value, currency));
  }, [value, currency, focused]);

  const symbol = currencySymbol(currency);

  return (
    <div className={styles.wrap}>
      <span className={styles.symbol} aria-hidden="true">
        {symbol}
      </span>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        placeholder={placeholder ?? '0.00'}
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          // Show raw value (no thousands separators) for easier editing.
          setText(value === 0 ? '' : String(formatAmount(value, currency).replace(/,/g, '')));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseAmount(text, currency);
          if (parsed === null) {
            setText(formatAmount(value, currency));
            return;
          }
          const final = allowNegative ? parsed : Math.max(0, parsed);
          onChange(final);
          setText(formatAmount(final, currency));
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (!allowNegative && v.includes('-')) return;
          setText(v);
          const parsed = parseAmount(v, currency);
          if (parsed !== null) {
            onChange(allowNegative ? parsed : Math.max(0, parsed));
          }
        }}
      />
    </div>
  );
}
