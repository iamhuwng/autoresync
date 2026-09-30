import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';

const mockListTeacherThcsDraftPage = vi.fn();
const mockDeleteThcsDraft = vi.fn();
const mockListTeacherWritingDraftPage = vi.fn();
const mockDeleteWritingDraft = vi.fn();

vi.mock('../../services/thcsDraftService', () => ({
  listTeacherThcsDraftPage: (...args: any[]) => mockListTeacherThcsDraftPage(...args),
  deleteThcsDraft: (...args: any[]) => mockDeleteThcsDraft(...args),
}));

vi.mock('../../services/writingTestService', () => ({
  listTeacherWritingDraftPage: (...args: any[]) => mockListTeacherWritingDraftPage(...args),
  deleteWritingDraft: (...args: any[]) => mockDeleteWritingDraft(...args),
}));

import { useTeacherDrafts } from '../thcs/useTeacherDrafts';

describe('useTeacherDrafts', () => {
  const mockThcsDrafts = [
    {
      id: 'draft-1',
      metadata: { title: 'Grade 9 Midterm' },
      status: 'editing',
      updatedAt: new Date('2026-03-28T10:00:00Z'),
    },
    {
      id: 'published-thcs',
      metadata: { title: 'Published THCS test' },
      status: 'published',
      publishedTestId: 'test-thcs',
      updatedAt: new Date('2026-03-30T10:00:00Z'),
    },
  ];

  const mockWritingDrafts = [
    {
      id: 'draft-2',
      testType: 'IELTS',
      skill: 'Writing',
      metadata: { title: 'Writing Task Pack', duration: 60, format: 'full-test' },
      tasks: [{ taskNumber: 1 }, { taskNumber: 2 }],
      status: 'editing',
      updatedAt: new Date('2026-03-29T10:00:00Z'),
    },
    {
      id: 'published-writing',
      metadata: { title: 'Published Writing test' },
      status: 'published',
      publishedTestId: 'test-writing',
      updatedAt: new Date('2026-03-31T10:00:00Z'),
    },
    {
      id: 'linked-writing',
      metadata: { title: 'Linked Writing test' },
      status: 'editing',
      publishedTestId: 'test-linked',
      updatedAt: new Date('2026-04-01T10:00:00Z'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockListTeacherThcsDraftPage.mockResolvedValue({ success: true, data: mockThcsDrafts });
    mockListTeacherWritingDraftPage.mockResolvedValue({ success: true, data: mockWritingDrafts });
    mockDeleteThcsDraft.mockResolvedValue({ success: true });
    mockDeleteWritingDraft.mockResolvedValue({ success: true });
  });

  it('shows only unpublished THCS and Writing drafts when enabled', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockListTeacherThcsDraftPage).toHaveBeenCalledWith('user-1', undefined);
    expect(mockListTeacherWritingDraftPage).toHaveBeenCalledWith('user-1', undefined);
    expect(result.current.drafts).toEqual([
      expect.objectContaining({ id: 'draft-2', draftKind: 'writing' }),
      expect.objectContaining({ id: 'draft-1', draftKind: 'thcs' }),
    ]);
    expect(result.current.error).toBeNull();
  });

  it('does not load when enabled is false', () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: false })
    );

    expect(result.current.loading).toBe(false);
    expect(mockListTeacherThcsDraftPage).not.toHaveBeenCalled();
    expect(mockListTeacherWritingDraftPage).not.toHaveBeenCalled();
    expect(result.current.drafts).toEqual([]);
  });

  it('sets an error when both draft sources fail', async () => {
    mockListTeacherThcsDraftPage.mockResolvedValue({
      success: false,
      error: 'THCS drafts failed',
    });
    mockListTeacherWritingDraftPage.mockResolvedValue({
      success: false,
      error: 'Writing drafts failed',
    });

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('THCS drafts failed');
    expect(result.current.drafts).toEqual([]);
  });

  it('clears a failed page error after refresh succeeds', async () => {
    mockListTeacherThcsDraftPage.mockResolvedValueOnce({ success: false, error: 'THCS drafts failed' });
    const { result } = renderHook(() => useTeacherDrafts({ userId: 'user-1', enabled: true }));
    await waitFor(() => expect(result.current.error).toBe('THCS drafts failed'));

    await act(async () => { await result.current.refreshDrafts(); });
    expect(result.current.error).toBeNull();
    expect(result.current.drafts).toHaveLength(2);
  });

  it('clears stale rows and cursors when Load More fails', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: 'thcs-' + String(index).padStart(2, '0'),
      status: 'editing',
      updatedAt: new Date(Date.UTC(2026, 4, 30, 0, 0, 59 - index)),
    }));
    mockListTeacherThcsDraftPage
      .mockResolvedValueOnce({ success: true, data: rows })
      .mockResolvedValueOnce({ success: false, error: 'Page failed' })
      .mockResolvedValue({ success: true, data: rows });
    mockListTeacherWritingDraftPage.mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useTeacherDrafts({ userId: 'user-1', enabled: true }));
    await waitFor(() => expect(result.current.drafts).toHaveLength(25));
    expect(result.current.hasMore).toBe(true);

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toBe('Page failed');
    expect(result.current.drafts).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    await act(async () => { await result.current.refreshDrafts(); });
    expect(mockListTeacherThcsDraftPage).toHaveBeenLastCalledWith('user-1', undefined);
    expect(result.current.error).toBeNull();
    expect(result.current.drafts).toHaveLength(25);
  });

  it('ignores an obsolete request failure after the user changes', async () => {
    let rejectOld!: (error: Error) => void;
    mockListTeacherThcsDraftPage.mockImplementation((userId: string) => userId === 'old'
      ? new Promise((_resolve, reject) => { rejectOld = reject; })
      : Promise.resolve({ success: true, data: mockThcsDrafts }));
    const { result, rerender } = renderHook(
      ({ userId }) => useTeacherDrafts({ userId, enabled: true }),
      { initialProps: { userId: 'old' } },
    );
    rerender({ userId: 'new' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { rejectOld(new Error('Old request failed')); });
    expect(result.current.error).toBeNull();
    expect(result.current.drafts).toHaveLength(2);
  });

  it('keeps available drafts when one source fails', async () => {
    mockListTeacherWritingDraftPage.mockResolvedValue({
      success: false,
      error: 'Writing drafts failed',
    });

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Writing drafts failed');
    expect(result.current.drafts).toEqual([]);
  });

  it('loads bounded merged pages without skipping rows from either store', async () => {
    const makeRows = (kind: string, offset: number) => Array.from({ length: 30 }, (_, index) => ({
      id: kind + '-' + index,
      status: index === 2 ? 'published' : 'editing',
      updatedAt: new Date(Date.UTC(2026, 2, 30, 0, 0, offset - index * 2)),
    }));
    const thcsRows = makeRows('thcs', 59);
    const writingRows = makeRows('writing', 58);
    const page = (rows: typeof thcsRows, cursor?: { id: string }) =>
      ({ success: true, data: rows.slice(cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0).slice(0, 26) });
    mockListTeacherThcsDraftPage.mockImplementation((_user: string, cursor?: { id: string }) => page(thcsRows, cursor));
    mockListTeacherWritingDraftPage.mockImplementation((_user: string, cursor?: { id: string }) => page(writingRows, cursor));

    const { result } = renderHook(() => useTeacherDrafts({ userId: 'user-1', enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.drafts).toHaveLength(23);
    expect(result.current.hasMore).toBe(true);
    expect(mockListTeacherThcsDraftPage).toHaveBeenCalledWith('user-1', undefined);
    expect(mockListTeacherWritingDraftPage).toHaveBeenCalledWith('user-1', undefined);

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.drafts).toHaveLength(48);
    expect(new Set(result.current.drafts.map((row) => row.draftKind + ':' + row.id)).size).toBe(48);
    expect(mockListTeacherThcsDraftPage).toHaveBeenLastCalledWith('user-1', { id: 'thcs-12', updatedAt: Timestamp.fromDate(thcsRows[12].updatedAt) });
    expect(mockListTeacherWritingDraftPage).toHaveBeenLastCalledWith('user-1', { id: 'writing-11', updatedAt: Timestamp.fromDate(writingRows[11].updatedAt) });
    expect(result.current.loadingMore).toBe(false);

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.drafts).toHaveLength(58);
    expect(result.current.hasMore).toBe(false);
  });

  it('orders and cursors rows by Firestore nanoseconds within one millisecond', async () => {
    const makeRows = (kind: string, offset: number) => Array.from({ length: 13 }, (_, index) => {
      const cursorUpdatedAt = new Timestamp(1000, offset - index * 20_000);
      return {
        id: kind + '-' + index,
        status: 'editing',
        updatedAt: cursorUpdatedAt.toDate(),
        cursorUpdatedAt,
      };
    });
    const thcsRows = makeRows('thcs', 998_900_000);
    const writingRows = makeRows('writing', 998_890_000);
    const page = (rows: typeof thcsRows, cursor?: { id: string }) =>
      ({ success: true, data: rows.slice(cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0).slice(0, 26) });
    mockListTeacherThcsDraftPage.mockImplementation((_user: string, cursor?: { id: string }) => page(thcsRows, cursor));
    mockListTeacherWritingDraftPage.mockImplementation((_user: string, cursor?: { id: string }) => page(writingRows, cursor));

    const { result } = renderHook(() => useTeacherDrafts({ userId: 'user-1', enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.drafts).toHaveLength(25);
    expect(result.current.drafts.slice(0, 4).map((row) => row.id)).toEqual([
      'thcs-0', 'writing-0', 'thcs-1', 'writing-1',
    ]);
    expect(result.current.drafts.every((row) => row.updatedAt.getTime() === thcsRows[0].updatedAt.getTime())).toBe(true);

    await act(async () => { await result.current.loadMore(); });
    expect(mockListTeacherWritingDraftPage).toHaveBeenLastCalledWith('user-1', {
      id: 'writing-11',
      updatedAt: writingRows[11].cursorUpdatedAt,
    });
    expect(result.current.drafts).toHaveLength(26);
    expect(result.current.drafts[25].id).toBe('writing-12');
    expect(result.current.hasMore).toBe(false);
  });

  it('deleteDraft removes a THCS draft from state on success', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(2);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(true);
    expect(mockDeleteThcsDraft).toHaveBeenCalledWith('draft-1');
    expect(result.current.drafts).toEqual([
      expect.objectContaining({ id: 'draft-2', draftKind: 'writing' }),
    ]);
  });

  it('deleteDraft routes IELTS writing drafts to the writing draft service', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(2);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-2');
    });

    expect(deleteResult!).toBe(true);
    expect(mockDeleteWritingDraft).toHaveBeenCalledWith('draft-2');
    expect(result.current.drafts).toEqual([
      expect.objectContaining({ id: 'draft-1', draftKind: 'thcs' }),
    ]);
  });

  it('does not send a published or missing draft to either delete service', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(await result.current.deleteDraft('published-thcs')).toBe(false);
      expect(await result.current.deleteDraft('published-writing')).toBe(false);
      expect(await result.current.deleteDraft('missing')).toBe(false);
    });
    expect(mockDeleteThcsDraft).not.toHaveBeenCalled();
    expect(mockDeleteWritingDraft).not.toHaveBeenCalled();
  });

  it('deleteDraft returns false on service failure', async () => {
    mockDeleteThcsDraft.mockResolvedValue({
      success: false,
      error: 'Permission denied',
    });

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(2);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(false);
    expect(result.current.drafts).toHaveLength(2);
  });

  it('deleteDraft returns false when service throws', async () => {
    mockDeleteThcsDraft.mockRejectedValue(new Error('Network error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(2);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(false);
    expect(result.current.drafts).toHaveLength(2);

    consoleErrorSpy.mockRestore();
  });
});
