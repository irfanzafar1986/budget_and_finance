import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../lib/auth';
import { getProfile } from '../db/repos/userProfile';
import { getCurrentYear } from '../db/repos/budgetYear';
import type { BudgetYear, UserProfile } from '../domain/types';

export interface AppState {
  ready: boolean;
  profile: UserProfile | null;
  year: BudgetYear | null;
  /** Increments on every refresh so consumers can re-read async queries. */
  revision: number;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [year, setYear] = useState<BudgetYear | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setYear(null);
      setRevision((r) => r + 1);
      return;
    }
    const [p, y] = await Promise.all([getProfile(), getCurrentYear()]);
    setProfile(p);
    setYear(y);
    setRevision((r) => r + 1);
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, refresh]);

  const value = useMemo<AppState>(
    () => ({ ready, profile, year, revision, refresh }),
    [ready, profile, year, revision, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useCurrency(): string {
  const { year, profile } = useApp();
  return year?.currency ?? profile?.default_currency ?? 'USD';
}
