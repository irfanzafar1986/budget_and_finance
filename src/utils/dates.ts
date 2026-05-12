/**
 * Date helpers. All dates in the app are ISO-8601 (YYYY-MM-DD) strings.
 * No time-zone arithmetic — we treat dates as calendar dates only.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round-trip through Date to catch e.g. 2026-02-30.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function compareIso(a: string, b: string): number {
  // Lexicographic comparison works for ISO-8601 calendar dates.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function startOfYearIso(year: number): string {
  return `${year}-01-01`;
}

export function endOfYearIso(year: number): string {
  return `${year}-12-31`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatHumanDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
