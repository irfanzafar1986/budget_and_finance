import { useEffect, useState } from 'react';

/**
 * Run an async loader and return its latest result. Re-runs whenever `deps`
 * changes. Returns `initial` until the first resolve. Discards stale
 * resolutions (last-write-wins by request ordering).
 */
export function useAsyncQuery<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loader();
        if (!cancelled) setValue(result);
      } catch (err) {
        if (!cancelled) {
          console.error('useAsyncQuery loader failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
