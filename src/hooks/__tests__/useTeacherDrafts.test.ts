import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks ---
const mockGetUserThcsDrafts = vi.fn();
const mockDeleteThcsDraft = vi.fn();

vi.mock('../../services/thcsDraftService', () => ({
  getUserThcsDrafts: (...args: any[]) => mockGetUserThcsDrafts(...args),
  deleteThcsDraft: (...args: any[]) => mockDeleteThcsDraft(...args),
}));

// Import AFTER mocks
import { useTeacherDrafts } from '../thcs/useTeacherDrafts';

describe('useTeacherDrafts', () => {
  const mockDrafts = [
    { id: 'draft-1', title: 'Grade 9 Midterm', status: 'editing' },
    { id: 'draft-2', title: 'Grade 10 Final', status: 'published' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserThcsDrafts.mockResolvedValue({ success: true, data: mockDrafts });
    mockDeleteThcsDraft.mockResolvedValue({ success: true });
    // Suppress alert() in test environment
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('loads drafts successfully when enabled', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetUserThcsDrafts).toHaveBeenCalledWith('user-1');
    expect(result.current.drafts).toEqual(mockDrafts);
    expect(result.current.error).toBeNull();
  });

  it('does not load when enabled is false', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: false })
    );

    // Should not be loading and should not call the service
    expect(result.current.loading).toBe(false);
    expect(mockGetUserThcsDrafts).not.toHaveBeenCalled();
    expect(result.current.drafts).toEqual([]);
  });

  it('sets error when getUserThcsDrafts fails', async () => {
    mockGetUserThcsDrafts.mockResolvedValue({
      success: false,
      error: 'Database query failed',
    });

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Database query failed');
    expect(result.current.drafts).toEqual([]);
  });

  it('sets error when getUserThcsDrafts throws', async () => {
    mockGetUserThcsDrafts.mockRejectedValue(new Error('Network timeout'));

    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network timeout');
    expect(result.current.drafts).toEqual([]);
  });

  it('deleteDraft removes draft from state on success', async () => {
    const { result } = renderHook(() =>
      useTeacherDrafts({ userId: 'user-1', enabled: true })
    );

    await waitFor(() => {
      expect(result.current.drafts).toEqual(mockDrafts);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(true);
    expect(mockDeleteThcsDraft).toHaveBeenCalledWith('draft-1');
    // draft-1 should be removed, draft-2 should remain
    expect(result.current.drafts).toEqual([mockDrafts[1]]);
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
      expect(result.current.drafts).toEqual(mockDrafts);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
    // State should be unchanged
    expect(result.current.drafts).toEqual(mockDrafts);

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
      expect(result.current.drafts).toEqual(mockDrafts);
    });

    let deleteResult: boolean;
    await act(async () => {
      deleteResult = await result.current.deleteDraft('draft-1');
    });

    expect(deleteResult!).toBe(false);
    expect(alertSpy).toHaveBeenCalled();
    // State should be unchanged
    expect(result.current.drafts).toEqual(mockDrafts);

    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
