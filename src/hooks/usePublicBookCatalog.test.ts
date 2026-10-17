import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePublicBookCatalog } from './usePublicBookCatalog';
import type { PublicBookCatalogReadiness } from '../services/materialCatalog/publicBookCatalogReadiness.service';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../services/materialCatalog/publicBookCatalogReadiness.browser', () => ({ listPublicBookCatalogPageBrowser: read }));
const row = (bookId: string) => ({ bookId, title: bookId } as PublicBookCatalogReadiness);
const page = (bookId: string, hasMore = false) => ({ rows: [row(bookId)], hasMore, cursor: { bookId, updatedAt: '2026-10-03T00:00:00.000Z' } });
beforeEach(() => read.mockReset());

it('loads on activation once, retains cached rows on revisit, and retries bounded cursor reads', async () => {
  read.mockResolvedValueOnce(page('first', true));
  const { result, rerender } = renderHook(({ enabled }) => usePublicBookCatalog('catalog-activation', enabled), { initialProps: { enabled: false } });
  expect(read).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.rows).toEqual([row('first')]));
  expect(read).toHaveBeenCalledTimes(1);
  read.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.rows).toEqual([row('first')]);
  expect(result.current.error).toContain('Try again');
  expect(read).toHaveBeenLastCalledWith({ limit: 12, cursor: page('first').cursor });
  read.mockResolvedValueOnce(page('refreshed'));
  await act(async () => { await result.current.retry(); });
  expect(result.current.rows).toEqual([row('refreshed')]);
  rerender({ enabled: false });
  let finish!: (value: ReturnType<typeof page>) => void;
  read.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  rerender({ enabled: true });
  expect(result.current.rows).toEqual([row('refreshed')]);
  expect(result.current.loading).toBe(true);
  await act(async () => { finish(page('latest')); });
  expect(result.current.rows).toEqual([row('latest')]);
  expect(read).toHaveBeenCalledTimes(4);
});

it('starts the new identity request and discards late responses after identity change', async () => {
  let finishOld!: (value: ReturnType<typeof page>) => void;
  read.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce(page('new-user-book'));
  const { result, rerender } = renderHook(({ studentId }) => usePublicBookCatalog(studentId), { initialProps: { studentId: 'catalog-old-user' } });
  rerender({ studentId: 'catalog-new-user' });
  await waitFor(() => expect(result.current.rows).toEqual([row('new-user-book')]));
  await act(async () => { finishOld(page('old-user-book')); });
  expect(result.current.rows).toEqual([row('new-user-book')]);
  expect(result.current.loading).toBe(false);
  expect(read).toHaveBeenCalledTimes(2);
});
