import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const values = new Map<string, unknown>();
const mockGet = vi.fn(async (target: { path?: string }) => {
  const value = values.get(target.path ?? '');
  return {
    exists: () => value !== undefined && value !== null,
    val: () => value,
  };
});
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const unsubscribe = vi.fn();
let realtimeSuccess: (() => void) | undefined;
let realtimeError: ((error: Error) => void) | undefined;
const mockOnValue = vi.fn((
  _target: unknown,
  success: () => void,
  error: (failure: Error) => void,
) => {
  realtimeSuccess = success;
  realtimeError = error;
  return unsubscribe;
});

vi.mock('firebase/database', () => ({
  ref: (_database: unknown, path?: string) => ({ path }),
  get: (target: { path?: string }) => mockGet(target),
  update: (...args: unknown[]) => mockUpdate(...args),
  onValue: (...args: any[]) => mockOnValue(...args),
}));

const deleteDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
  firestore: {},
}));

import { useTeacherTests } from '../test/useTeacherTests';

const summary = (overrides: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries({
    schemaVersion: 1,
    materialId: 'material-1',
    producerId: 'generic-test',
    materialKind: 'full-test',
    surfaceFamily: 'assessment',
    ownerId: 'teacher-1',
    title: 'Material',
    visibility: 'private',
    lifecycleState: 'active',
    skillId: 'reading',
    testTypeIds: ['ielts'],
    tags: ['material'],
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides,
  }).filter(([, value]) => value !== undefined));

describe('useTeacherTests universal material summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    values.clear();
    realtimeSuccess = undefined;
    realtimeError = undefined;
  });

  it('loads owned test material kinds from the universal index without passages or books', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
      {
        test: summary(),
        publicTest: summary({
          materialId: 'public-test',
          visibility: 'public',
        }),
        writing: summary({
          materialId: 'writing-1',
          producerId: 'writing',
          materialKind: 'writing-prompt',
          skillId: 'writing',
        }),
        thcs: summary({
          materialId: 'thcs-1',
          producerId: 'thcs-thpt',
          materialKind: 'thcs-thpt-test',
          skillId: 'thcs',
          testTypeIds: ['thcs-thpt'],
        }),
        listening: summary({
          materialId: 'listening-1',
          producerId: 'listening',
          materialKind: 'listening-part',
          skillId: 'listening',
        }),
        passage: summary({
          materialId: 'passage-1',
          producerId: 'reading-v2-passage',
          materialKind: 'reading-passage',
          surfaceFamily: 'passage',
        }),
        book: summary({
          materialId: 'book-1',
          producerId: 'material-book',
          materialKind: 'book',
          surfaceFamily: 'book',
          skillId: undefined,
        }),
      },
    );

    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      realtime: false,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tests.map((row) => row.materialKind)).toEqual(expect.arrayContaining([
      'full-test',
      'listening-part',
      'thcs-thpt-test',
      'writing-prompt',
    ]));
    expect(result.current.tests.map((row) => row.materialKind)).not.toEqual(expect.arrayContaining([
      'book',
      'reading-passage',
    ]));
    expect(result.current.tests.map((row) => row.materialId)).toEqual(expect.arrayContaining([
      'material-1',
      'public-test',
      'writing-1',
      'thcs-1',
      'listening-1',
    ]));
    expect(result.current.tests.map((row) => row.visibility).sort()).toEqual([
      'private',
      'private',
      'private',
      'private',
      'public',
    ]);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith({
      path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
    });
  });

  it('loads Public Library from the public summary index', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_visibility/public',
      {
        ownedPublic: summary({ visibility: 'public' }),
      },
    );
    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      contentFilter: 'public',
      realtime: false,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tests).toHaveLength(1);
    expect(result.current.tests[0].ownerId).toBe('teacher-1');
  });

  it('surfaces malformed rows and missing owner instead of believable empties', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
      { malformed: { title: 'Missing contract' } },
    );
    const malformed = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      realtime: false,
    }));
    await waitFor(() => expect(malformed.result.current.loading).toBe(false));
    expect(malformed.result.current.error).toMatch(/shared listing contract/i);
    malformed.unmount();

    const missingOwner = renderHook(() => useTeacherTests({ realtime: false }));
    await waitFor(() => expect(missingOwner.result.current.loading).toBe(false));
    expect(missingOwner.result.current.error).toMatch(/authenticated owner/i);
  });

  it('clears stale rows when a new material scope fails to load', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
      { owned: summary() },
    );
    values.set(
      'material_catalog/material_summary_indexes/v1/by_visibility/public',
      { malformed: { title: 'Missing contract' } },
    );

    const { result, rerender } = renderHook(
      ({ contentFilter }: { contentFilter: 'my' | 'public' }) => useTeacherTests({
        ownerId: 'teacher-1',
        contentFilter,
        realtime: false,
      }),
      { initialProps: { contentFilter: 'my' as 'my' | 'public' } },
    );

    await waitFor(() => expect(result.current.tests).toHaveLength(1));
    rerender({ contentFilter: 'public' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/shared listing contract/i);
    expect(result.current.tests).toEqual([]);
    expect(result.current.loadedScope).toBeNull();
  });

  it('surfaces realtime listener failures and unsubscribes', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
      { owned: summary() },
    );
    const { result, unmount } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
    }));
    await waitFor(() => expect(mockOnValue).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.tests).toHaveLength(1));

    act(() => realtimeError?.(new Error('Permission denied')));
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.tests).toEqual([]);
    expect(result.current.loadedScope).toBeNull();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('atomically removes a legacy runtime record and active summary rows', async () => {
    const current = {
      id: 'writing-1',
      ownerId: 'teacher-1',
      title: 'Writing',
      testType: 'IELTS',
      skill: 'Writing',
      sourceDraftId: 'draft-1',
      updatedAt: 1_700_000_000_000,
    };
    values.set('tests/writing-1', current);
    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      enabled: false,
    }));

    await act(async () => {
      await result.current.deleteTest(current);
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      { path: undefined },
      expect.objectContaining({
        'tests/writing-1': null,
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/writing-1':
          null,
        'material_catalog/material_summary_indexes/v1/by_id/writing-1':
          expect.objectContaining({ lifecycleState: 'removed' }),
      }),
    );
    expect(deleteDoc).toHaveBeenCalledWith({
      collection: 'writing_drafts',
      id: 'draft-1',
    });
  });

  it('blocks legacy Listening deletion until the audited removal flow exists', async () => {
    const current = {
      id: 'listening-1',
      ownerId: 'teacher-1',
      title: 'Listening',
      testType: 'IELTS',
      skill: 'Listening',
      updatedAt: 1_700_000_000_000,
    };
    values.set('tests/listening-1', current);
    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      enabled: false,
    }));

    await expect(result.current.deleteTest(current)).rejects.toThrow(/audited deletion flow/i);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('atomically changes public visibility and summary membership', async () => {
    values.set('tests/test-1', {
      id: 'test-1',
      ownerId: 'teacher-1',
      title: 'Test',
      type: 'IELTS',
      skill: 'Reading',
      isPublic: false,
      updatedAt: 1_700_000_000_000,
    });
    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      enabled: false,
    }));

    await act(async () => {
      await result.current.togglePublic('test-1', false);
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      { path: undefined },
      expect.objectContaining({
        'tests/test-1/isPublic': true,
        'material_catalog/material_summary_indexes/v1/by_visibility/private/test-1':
          null,
        'material_catalog/material_summary_indexes/v1/by_visibility/public/test-1':
          expect.objectContaining({ visibility: 'public' }),
      }),
    );
  });
});
