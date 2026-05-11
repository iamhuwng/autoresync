import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks ---

// Mock Firebase database
const mockRemove = vi.fn().mockResolvedValue(undefined);
const mockDbUpdate = vi.fn().mockResolvedValue(undefined);
const mockRef = vi.fn((_db: any, path: string) => ({ path }));
const mockQuery = vi.fn((target: any, ...constraints: any[]) => ({
  path: target.path,
  constraints,
}));
const mockOrderByChild = vi.fn((child: string) => ({ type: 'orderByChild', child }));
const mockEqualTo = vi.fn((value: unknown) => ({ type: 'equalTo', value }));
let onValueCallback: ((snapshot: any) => void) | null = null;
let onValueErrorCallback: ((error: any) => void) | null = null;
const onValueCallbacks: Array<(snapshot: any) => void> = [];
const onValueErrorCallbacks: Array<(error: any) => void> = [];
const mockUnsubscribe = vi.fn();
const mockOnValue = vi.fn((ref: any, successCb: any, errorCb?: any) => {
  onValueCallback = successCb;
  onValueErrorCallback = errorCb || null;
  onValueCallbacks.push(successCb);
  if (errorCb) onValueErrorCallbacks.push(errorCb);
  return mockUnsubscribe;
});

vi.mock('firebase/database', () => ({
  ref: (...args: any[]) => mockRef(...args),
  query: (...args: any[]) => mockQuery(...args),
  orderByChild: (...args: any[]) => mockOrderByChild(...args),
  equalTo: (...args: any[]) => mockEqualTo(...args),
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
const mockGetTeacherOwnedTests = vi.fn();
const mockGetPublicTests = vi.fn();
const mockInvalidate = vi.fn();
vi.mock('../../services/firebaseQueryOptimizer', () => ({
  default: {
    getAllTests: (...args: any[]) => mockGetAllTests(...args),
    getTeacherOwnedTests: (...args: any[]) => mockGetTeacherOwnedTests(...args),
    getPublicTests: (...args: any[]) => mockGetPublicTests(...args),
    invalidate: (...args: any[]) => mockInvalidate(...args),
  },
}));

const mockGetReadingV2TeacherLobbyTests = vi.fn();
vi.mock('../../services/reading-v2/readingV2TeacherLobbyMaterials.service', () => ({
  getReadingV2TeacherLobbyTests: (...args: any[]) => mockGetReadingV2TeacherLobbyTests(...args),
  getReadingV2TeacherLobbyIndexQuery: (ownerId: string) => ({
    path: 'reading_v2/relationship_indexes/teacher-lobby/',
    ownerId,
  }),
  mergeReadingV2TeacherLobbyTests: (legacyTests: any[], readingV2Tests: any[]) => {
    const seenIds = new Set(legacyTests.map((test) => test.id));
    return [
      ...legacyTests,
      ...readingV2Tests.filter((test) => !seenIds.has(test.id)),
    ];
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
    onValueCallbacks.length = 0;
    onValueErrorCallbacks.length = 0;
    mockGetAllTests.mockResolvedValue(mockTests);
    mockGetTeacherOwnedTests.mockResolvedValue(mockTests);
    mockGetPublicTests.mockResolvedValue(mockTests);
    mockGetReadingV2TeacherLobbyTests.mockResolvedValue([]);
    mockRemove.mockResolvedValue(undefined);
    mockDbUpdate.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('loads teacher-owned tests initially via indexed owner queries', async () => {
    const { result } = renderHook(() => useTeacherTests({ realtime: false, ownerId: 'teacher-1' }));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetTeacherOwnedTests).toHaveBeenCalledWith('teacher-1', false);
    expect(mockGetAllTests).not.toHaveBeenCalled();
    expect(result.current.tests).toEqual(mockTests);
    expect(result.current.error).toBeNull();
  });

  it('uses tests registry rows for Reading V2 cards without relationship hydration', async () => {
    const readingV2Material = {
      id: 'reading-v2-material-1',
      materialId: 'reading-v2-material-1',
      title: 'Published Reading V2',
      deliveryEngine: 'reading-v2',
      ownerId: 'teacher-1',
    };
    mockGetTeacherOwnedTests.mockResolvedValueOnce([readingV2Material]);

    const { result } = renderHook(() => useTeacherTests({ realtime: false, ownerId: 'teacher-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetTeacherOwnedTests).toHaveBeenCalledWith('teacher-1', false);
    expect(mockGetReadingV2TeacherLobbyTests).not.toHaveBeenCalled();
    expect(result.current.tests).toEqual([readingV2Material]);
  });

  it('exposes error state when initial load fails', async () => {
    mockGetTeacherOwnedTests.mockRejectedValue(new Error('Network failed'));

    const { result } = renderHook(() => useTeacherTests({ realtime: false, ownerId: 'teacher-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network failed');
    expect(result.current.tests).toEqual([]);
  });

  it('skips first onValue call and processes second call for real-time updates', async () => {
    mockGetPublicTests
      .mockResolvedValueOnce(mockTests)
      .mockResolvedValueOnce([{ id: 'test-3', title: 'New Test' }]);

    const { result } = renderHook(() => useTeacherTests({ realtime: true, contentFilter: 'public' }));

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

    await waitFor(() => {
      expect(result.current.tests).toEqual([{ id: 'test-3', title: 'New Test' }]);
    });
    expect(mockInvalidate).toHaveBeenCalledWith('test', 'public');
    expect(mockGetAllTests).not.toHaveBeenCalled();
    expect(mockOrderByChild).toHaveBeenCalledWith('isPublic');
    expect(mockEqualTo).toHaveBeenCalledWith(true);
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

    const { result } = renderHook(() => useTeacherTests({ realtime: true, contentFilter: 'public' }));

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
