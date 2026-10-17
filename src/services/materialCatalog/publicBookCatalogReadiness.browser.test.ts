import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPublicBookCatalogPageBrowser } from './publicBookCatalogReadiness.browser';
import { endBefore, limitToLast, orderByChild } from 'firebase/database';
const { rows } = vi.hoisted(() => ({ rows: [] as [string, unknown][] }));
vi.mock('../firebaseCore', () => ({ database: {} }));
vi.mock('firebase/database', () => ({
  ref: vi.fn(), query: vi.fn((...args) => args), orderByChild: vi.fn(), endBefore: vi.fn(), limitToLast: vi.fn(),
  get: vi.fn(async () => ({ forEach: (visit: (child: { key: string; val: () => unknown }) => void) => {
    rows.forEach(([key, value]) => visit({ key, val: () => value }));
  } })),
}));
const row = (bookId: string) => ({ schemaVersion: 1, bookId, title: bookId, updatedAt: '2026-10-03T00:00:00.000Z',
  bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1',
  sourceVersionId: 'source-1', sourceStrategy: 'full_pdf', sha256Hex: 'a'.repeat(64), physicalPageCount: 2 });
beforeEach(() => { rows.length = 0; vi.clearAllMocks(); });

describe('public Book catalog browser adapter', () => {
  it('returns a bounded empty page', async () => {
    await expect(listPublicBookCatalogPageBrowser({ limit: 12 })).resolves.toEqual({ rows: [], cursor: null, hasMore: false });
    expect(limitToLast).toHaveBeenCalledWith(13);
  });

  it.each([['Book-Z', 'book-a'], ['2', '10']])('preserves SDK tie ordering for %s and %s with an exact cursor', async (first, last) => {
    rows.push([first, row(first)], [last, row(last)]);
    const page = await listPublicBookCatalogPageBrowser({ limit: 1 });
    expect(page.rows.map((book) => book.bookId)).toEqual([last]);
    expect(page.cursor).toEqual({ bookId: last, updatedAt: row(last).updatedAt });
    expect(page.hasMore).toBe(true);
    rows.pop();
    const next = await listPublicBookCatalogPageBrowser({ limit: 1, cursor: page.cursor! });
    expect(next.rows.map((book) => book.bookId)).toEqual([first]);
    expect(next.hasMore).toBe(false);
    expect(orderByChild).toHaveBeenCalledWith('updatedAt');
    expect(endBefore).toHaveBeenCalledWith(row(last).updatedAt, last);
    expect(limitToLast).toHaveBeenLastCalledWith(2);
  });
});
