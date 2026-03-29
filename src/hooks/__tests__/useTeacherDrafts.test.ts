import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetUserThcsDrafts = vi.fn();
const mockDeleteThcsDraft = vi.fn();
const mockGetUserWritingDrafts = vi.fn();
const mockDeleteWritingDraft = vi.fn();

vi.mock('../../services/thcsDraftService', () => ({
  getUserThcsDrafts: (...args: any[]) => mockGetUserThcsDrafts(...args),
  deleteThcsDraft: (...args: any[]) => mockDeleteThcsDraft(...args),
}));

vi.mock('../../services/writingTestService', () => ({
  getUserWritingDrafts: (...args: any[]) => mockGetUserWritingDrafts(...args),
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
  ];

  const mockWritingDrafts = [
    {
      id: 'draft-2',
      testType: 'IELTS',
      skill: 'Writing',
      metadata: { title: 'Writing Task Pack', duration: 60, format: 'full-test' },
      tasks: [{ taskNumber: 1 }, { taskNumber: 2 }],
      status: 'published',
      updatedAt: new Date('2026-03-29T10:00:00Z'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserThcsDrafts.mockResolvedValue({ success: true, data: mockThcsDrafts });
    mockGetUserWritingDrafts.mockResolvedValue({ success: true, data: mockWritingDrafts });
    mockDeleteThcsDraft.mockResolvedValue({ success: true });
    mockDeleteWritingDraft.mockResolvedValue({ success: true });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('loads and merges THCS and writing drafts when enabled', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetUserThcsDrafts).toHaveBeenCalledWith('user-1');
    expect(mockGetUserWritingDrafts).toHaveBeenCalledWith('user-1');
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
    expect(mockGetUserThcsDrafts).not.toHaveBeenCalled();
    expect(mockGetUserWritingDrafts).not.toHaveBeenCalled();
    expect(result.current.drafts).toEqual([]);
  });

  it('sets an error when both draft sources fail', async () => {
    mockGetUserThcsDrafts.mockResolvedValue({
      success: false,
      error: 'THCS drafts failed',
    });
    mockGetUserWritingDrafts.mockResolvedValue({
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

  it('keeps available drafts when one source fails', async () => {
    mockGetUserWritingDrafts.mockResolvedValue({
      success: false,
      error: 'Writing drafts failed',
    });

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.drafts).toEqual([
      expect.objectContaining({ id: 'draft-1', draftKind: 'thcs' }),
    ]);
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

  it('deleteDraft returns false and shows alert on failure', async () => {
    mockDeleteThcsDraft.mockResolvedValue({
      success: false,
      error: 'Permission denied',
    });

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

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
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
    expect(result.current.drafts).toHaveLength(2);

    alertSpy.mockRestore();
  });

  it('deleteDraft returns false and shows alert when service throws', async () => {
    mockDeleteThcsDraft.mockRejectedValue(new Error('Network error'));

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
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
    expect(alertSpy).toHaveBeenCalled();
    expect(result.current.drafts).toHaveLength(2);

    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
