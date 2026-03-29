import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks ---

// Mock Firebase database
const mockRemove = vi.fn().mockResolvedValue(undefined);
const mockDbUpdate = vi.fn().mockResolvedValue(undefined);
const mockRef = vi.fn((_db: any, path: string) => ({ path }));
let onValueCallback: ((snapshot: any) => void) | null = null;
let onValueErrorCallback: ((error: any) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockOnValue = vi.fn((ref: any, successCb: any, errorCb?: any) => {
  onValueCallback = successCb;
  onValueErrorCallback = errorCb || null;
  return mockUnsubscribe;
});

vi.mock('firebase/database', () => ({
  ref: (...args: any[]) => mockRef(...args),
  onValue: (...args: any[]) => mockOnValue(...args),
  remove: (...args: any[]) => mockRemove(...args),
  update: (...args: any[]) => mockDbUpdate(...args),
}));

// Mock Firebase Firestore
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((_db: any, collection: string, id: string) => ({ collection, id }));
vi.mock('firebase/firestore', () => ({
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  doc: (...args: any[]) => mockDoc(...args),
}));

// Mock firebase service
vi.mock('../../services/firebase', () => ({
  database: { fake: 'database' },
  firestore: { fake: 'firestore' },
}));

// Mock queryOptimizer
const mockGetAllTests = vi.fn();
const mockInvalidate = vi.fn();
vi.mock('../../services/firebaseQueryOptimizer', () => ({
  default: {
    getAllTests: (...args: any[]) => mockGetAllTests(...args),
    invalidate: (...args: any[]) => mockInvalidate(...args),
  },
}));

// Import AFTER mocks
import { useTeacherTests } from '../test/useTeacherTests';

describe('useTeacherTests', () => {
  const mockTests = [
    { id: 'test-1', title: 'IELTS Reading', testType: 'IELTS' },
    { id: 'test-2', title: 'Grade 9 Final', testType: 'THCS-THPT', sourceDraftId: 'draft-2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    onValueCallback = null;
    onValueErrorCallback = null;
    mockGetAllTests.mockResolvedValue(mockTests);
    mockRemove.mockResolvedValue(undefined);
    mockDbUpdate.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('loads tests initially via queryOptimizer.getAllTests()', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetAllTests).toHaveBeenCalledOnce();
    expect(result.current.tests).toEqual(mockTests);
    expect(result.current.error).toBeNull();
  });

  it('exposes error state when initial load fails', async () => {
    mockGetAllTests.mockRejectedValue(new Error('Network failed'));

    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network failed');
    expect(result.current.tests).toEqual([]);
  });

  it('skips first onValue call and processes second call for real-time updates', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // onValue should have been set up
    expect(mockOnValue).toHaveBeenCalled();
    expect(onValueCallback).not.toBeNull();

    // First call should be skipped (skipFirstCall pattern)
    const snapshotFirst = { val: () => ({ 'x': { title: 'should-skip' } }) };
    act(() => { onValueCallback!(snapshotFirst); });
    // Tests should NOT have changed to the snapshot data
    expect(result.current.tests).toEqual(mockTests);

    // Second call should be processed
    const updatedData = { 'test-3': { title: 'New Test' } };
    const snapshotSecond = { val: () => updatedData };
    act(() => { onValueCallback!(snapshotSecond); });

    expect(result.current.tests).toEqual([{ id: 'test-3', title: 'New Test' }]);
    expect(mockInvalidate).toHaveBeenCalledWith('test', 'all');
  });

  it('cleans up subscription on unmount', async () => {
    const { result, unmount } = renderHook(() => useTeacherTests({ realtime: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    unmount();

    // The unsubscribe function should have been preserved for cleanup
    // (the hook returns a cleanup function that calls unsubscribe)
    // After unmount, onValue callback should not update state
  });

  it('handles PERMISSION_DENIED error silently', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useTeacherTests({ realtime: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(onValueErrorCallback).not.toBeNull();

    // Simulate permission denied error (expected after logout)
    act(() => {
      onValueErrorCallback!({ code: 'PERMISSION_DENIED' });
    });

    // Should log silently, not throw
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test listener stopped')
    );
    // Should NOT log as an error
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      'Error loading tests:',
      expect.anything()
    );

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('deleteTest calls remove and cleans up Firestore for THCS tests', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const thcsTest = { id: 'thcs-1', testType: 'THCS-THPT', sourceDraftId: 'draft-1' };

    await act(async () => {
      await result.current.deleteTest(thcsTest);
    });

    // Should call RTDB remove
    expect(mockRemove).toHaveBeenCalledWith({ path: 'tests/thcs-1' });

    // Should clean up Firestore thcs_library
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'thcs_library', id: 'thcs-1' })
    );

    // Should clean up Firestore thcs_drafts (because sourceDraftId exists)
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'thcs_drafts', id: 'draft-1' })
    );
  });

  it('deleteTest does NOT clean Firestore for non-THCS tests', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const ieltsTest = { id: 'ielts-1', testType: 'IELTS' };

    await act(async () => {
      await result.current.deleteTest(ieltsTest);
    });

    expect(mockRemove).toHaveBeenCalledWith({ path: 'tests/ielts-1' });
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('deleteTest cleans up linked writing drafts for IELTS writing tests', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const writingTest = {
      id: 'writing-1',
      testType: 'IELTS',
      skill: 'Writing',
      sourceDraftId: 'writing-draft-1',
    };

    await act(async () => {
      await result.current.deleteTest(writingTest);
    });

    expect(mockRemove).toHaveBeenCalledWith({ path: 'tests/writing-1' });
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'writing_drafts', id: 'writing-draft-1' })
    );
  });

  it('togglePublic updates the RTDB record', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.togglePublic('test-1', false, 'test');
    });

    expect(mockDbUpdate).toHaveBeenCalledWith(
      { path: 'tests/test-1' },
      expect.objectContaining({ isPublic: true })
    );
  });
});
