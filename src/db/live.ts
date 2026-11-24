import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Re-renders whenever the queried IndexedDB data changes. `undefined` while loading. */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(() => v),
      error: (e) => console.error('liveQuery failed', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
