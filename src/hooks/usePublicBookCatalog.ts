import { useCallback, useEffect, useRef, useState } from 'react';
import { listPublicBookCatalogPageBrowser } from '../services/materialCatalog/publicBookCatalogReadiness.browser';
import type { PublicBookCatalogCursor, PublicBookCatalogReadiness } from '../services/materialCatalog/publicBookCatalogReadiness.service';
type CatalogState = { rows: PublicBookCatalogReadiness[]; cursor: PublicBookCatalogCursor | null; hasMore: boolean };
const empty: CatalogState = { rows: [], cursor: null, hasMore: false };
const cache = new Map<string, CatalogState>();
// Library owns this summary dataset; revisits retain content while refreshing.
export const usePublicBookCatalog = (studentId: string, enabled = true) => {
  const [view, setView] = useState(() => ({ studentId, state: cache.get(studentId) ?? empty }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (!enabled || !studentId || pending.current) return;
    const previous = cache.get(studentId) ?? empty;
    if (!reset && !previous.hasMore) return;
    const request = ++generation.current;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await listPublicBookCatalogPageBrowser({
        limit: 12, cursor: reset ? undefined : previous.cursor ?? undefined,
      });
      if (request !== generation.current) return;
      const next = { rows: reset ? page.rows : [...previous.rows, ...page.rows], cursor: page.cursor, hasMore: page.hasMore };
      cache.set(studentId, next);
      setView({ studentId, state: next });
    } catch {
      if (request === generation.current) setError('Public Books could not be loaded. Try again.');
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [enabled, studentId]);

  useEffect(() => {
    setView({ studentId, state: cache.get(studentId) ?? empty });
    setError(null);
    setLoading(false);
    void load(true);
    return () => { generation.current++; pending.current = false; };
  }, [load, studentId]);

  const state = view.studentId === studentId ? view.state : cache.get(studentId) ?? empty;
  return { ...state, loading, error, retry: () => load(true), loadMore: () => load(false) };
};
