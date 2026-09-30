import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const values = new Map<string, unknown>();
type QueryTarget = { path?: string; constraints?: Array<{ kind: string; value?: string | number; key?: string }> };
const mockGet = vi.fn(async (target: QueryTarget) => {
  const path = target.path ?? '';
  let value = values.get(path);
  if (target.constraints?.length && value && typeof value === 'object') {
    const cursor = target.constraints.find((constraint) => constraint.kind === 'endBefore');
    const limit = target.constraints.find((constraint) => constraint.kind === 'limitToLast');
    const entries = Object.entries(value).sort(([leftKey, left], [rightKey, right]) => {
      const a = (left as { updatedAt: string }).updatedAt;
      const b = (right as { updatedAt: string }).updatedAt;
      return a < b ? -1 : a > b ? 1 : leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }).filter(([key, row]) => !cursor ||
      (row as { updatedAt: string }).updatedAt < cursor.value! ||
      ((row as { updatedAt: string }).updatedAt === cursor.value && key < cursor.key!));
    value = Object.fromEntries(entries.slice(-(limit?.value as number ?? entries.length)));
  }
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
  query: (target: QueryTarget, ...constraints: QueryTarget['constraints']) => ({ ...target, constraints }),
  orderByChild: (value: string) => ({ kind: 'orderByChild', value }),
  limitToLast: (value: number) => ({ kind: 'limitToLast', value }),
  endBefore: (value: string, key: string) => ({ kind: 'endBefore', value, key }),
  get: (target: QueryTarget) => mockGet(target),
  update: (...args: unknown[]) => mockUpdate(...args),
  onValue: (...args: any[]) => mockOnValue(...args),
}));

const deleteDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  doc: (_db: unknown, ...segments: string[]) => ({
    collection: segments.slice(0, -1).join('/'),
    id: segments[segments.length - 1],
    path: segments.join('/'),
  }),
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
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      {
        'material-1': summary(),
        'public-test': summary({
          materialId: 'public-test',
          visibility: 'public',
        }),
        'writing-1': summary({
          materialId: 'writing-1',
          producerId: 'writing',
          materialKind: 'writing-prompt',
          skillId: 'writing',
        }),
        'thcs-1': summary({
          materialId: 'thcs-1',
          producerId: 'thcs-thpt',
          materialKind: 'thcs-thpt-test',
          skillId: 'thcs',
          testTypeIds: ['thcs-thpt'],
        }),
        'listening-1': summary({
          materialId: 'listening-1',
          producerId: 'listening',
          materialKind: 'listening-part',
          skillId: 'listening',
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
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({
      path: 'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
    }));
  });

  it('keeps My Content owned-only even when other teachers have public tests', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      {
        'owned-thcs': summary({
          materialId: 'owned-thcs',
          producerId: 'thcs-thpt',
          materialKind: 'thcs-thpt-test',
          skillId: 'thcs',
          testTypeIds: ['thcs-thpt'],
        }),
      },
    );
    values.set(
      'material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment',
      {
        'other-public-thcs': summary({
          materialId: 'other-public-thcs',
          ownerId: 'teacher-2',
          producerId: 'thcs-thpt',
          materialKind: 'thcs-thpt-test',
          skillId: 'thcs',
          testTypeIds: ['thcs-thpt'],
          visibility: 'public',
        }),
      },
    );

    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      realtime: false,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tests.map((row) => row.materialId)).toEqual(['owned-thcs']);
    expect(result.current.tests.map((row) => row.ownerId)).toEqual(['teacher-1']);
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({
      path: 'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
    }));
    expect(mockGet).not.toHaveBeenCalledWith(expect.objectContaining({
      path: 'material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment',
    }));
  });

  it('preserves Reading V2 readiness fields so My Content rows can be assigned', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      {
        'reading-v2-full': summary({
          materialId: 'reading-v2-full',
          producerId: 'reading-v2-full-test',
          materialKind: 'full-test',
          skillId: 'reading',
          questionCount: 40,
          sourceSnapshotVersionId: 'snapshot-v2',
          hasStudentSafeProjection: true,
          deliveryProjectionReady: true,
          studentSafeProjectionReady: true,
          passageRefCount: 3,
        }),
      },
    );

    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      realtime: false,
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tests).toHaveLength(1);
    expect(result.current.tests[0]).toMatchObject({
      id: 'reading-v2-full',
      deliveryEngine: 'reading-v2',
      questionCount: 40,
      publishedSnapshotVersionId: 'snapshot-v2',
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      studentSafeProjectionReady: true,
      passageRefCount: 3,
      metadata: {
        hasStudentSafeProjection: true,
        deliveryProjectionReady: true,
        studentSafeProjectionReady: true,
        passageRefCount: 3,
      },
    });
    expect(result.current.error).toBeNull();
  });

  it('loads Public Library from the public summary index', async () => {
    values.set(
      'material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment',
      {
        'material-1': summary({ visibility: 'public' }),
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
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      { malformed: { title: 'Missing contract', updatedAt: '2026-07-07T00:00:00.000Z' } },
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
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      { 'material-1': summary() },
    );
    values.set(
      'material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment',
      { malformed: { title: 'Missing contract', updatedAt: '2026-07-07T00:00:00.000Z' } },
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
      'material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      { 'material-1': summary() },
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

  it('loads bounded pages without repeating tied-timestamp rows', async () => {
    values.set('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      Object.fromEntries(Array.from({ length: 27 }, (_, index) => {
        const materialId = `item-${String(index).padStart(2, '0')}`;
        return [materialId, summary({ materialId })];
      })));
    const { result } = renderHook(() => useTeacherTests({ ownerId: 'teacher-1', realtime: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tests).toHaveLength(25);
    expect(result.current.hasMore).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({
      constraints: expect.arrayContaining([{ kind: 'limitToLast', value: 26 }]),
    }));

    await act(async () => result.current.loadMore());
    expect(result.current.tests.map((row) => row.materialId)).toHaveLength(27);
    expect(new Set(result.current.tests.map((row) => row.materialId)).size).toBe(27);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({
      constraints: expect.arrayContaining([expect.objectContaining({
        kind: 'endBefore', key: 'item-02',
      })]),
    }));
  });

  it('changes to a type index and clears stale rows if that page is malformed', async () => {
    values.set('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment',
      { 'material-1': summary() });
    values.set('material_catalog/material_summary_indexes/v1/by_owner_family_type/teacher-1/assessment/toeic',
      { malformed: { title: 'Missing contract', updatedAt: '2026-07-07T00:00:00.000Z' } });
    const { result, rerender } = renderHook(
      ({ testTypeId }: { testTypeId?: string }) => useTeacherTests({ ownerId: 'teacher-1', testTypeId, realtime: false }),
      { initialProps: { testTypeId: undefined as string | undefined } },
    );
    await waitFor(() => expect(result.current.tests).toHaveLength(1));
    rerender({ testTypeId: 'toeic' });
    await waitFor(() => expect(result.current.error).toMatch(/shared listing contract/i));
    expect(result.current.tests).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadedScope).toBeNull();
    expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({
      path: 'material_catalog/material_summary_indexes/v1/by_owner_family_type/teacher-1/assessment/toeic',
    }));
  });

  it('ignores a prior type response that finishes after the new type', async () => {
    let finishOld!: (value: { exists: () => boolean; val: () => unknown }) => void;
    mockGet.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    values.set('material_catalog/material_summary_indexes/v1/by_owner_family_type/teacher-1/assessment/toeic',
      { 'toeic-1': summary({ materialId: 'toeic-1', testTypeIds: ['toeic'] }) });
    const { result, rerender } = renderHook(
      ({ testTypeId }: { testTypeId: string }) => useTeacherTests({ ownerId: 'teacher-1', testTypeId, realtime: false }),
      { initialProps: { testTypeId: 'ielts' } },
    );
    rerender({ testTypeId: 'toeic' });
    await waitFor(() => expect(result.current.tests.map((row) => row.materialId)).toEqual(['toeic-1']));
    await act(async () => finishOld({
      exists: () => true,
      val: () => ({ 'ielts-1': summary({ materialId: 'ielts-1' }) }),
    }));
    expect(result.current.tests.map((row) => row.materialId)).toEqual(['toeic-1']);
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
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'writing_drafts',
      id: 'draft-1',
    }));
  });

  it('keeps a THCS removal successful when Firestore sidecar cleanup is denied', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const current = {
      id: 'thcs-1',
      ownerId: 'teacher-1',
      title: 'THCS',
      testType: 'THCS-THPT',
      skill: 'thcs',
      sourceDraftId: 'draft-1',
      updatedAt: 1_700_000_000_000,
    };
    values.set('tests/thcs-1', current);
    deleteDoc.mockRejectedValueOnce(new Error('Permission denied'));
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
        'tests/thcs-1': null,
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/thcs-1':
          null,
        'material_catalog/material_summary_indexes/v1/by_id/thcs-1':
          expect.objectContaining({ lifecycleState: 'removed' }),
      }),
    );
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'thcs_library',
      id: 'thcs-1',
    }));
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'thcs_drafts',
      id: 'draft-1',
    }));
    expect(warnSpy).toHaveBeenCalledWith(
      '[TeacherMaterials] Sidecar cleanup failed after material removal.',
      expect.objectContaining({ materialId: 'thcs-1', failures: 1 }),
    );
    warnSpy.mockRestore();
  });

  it('uses the runtime sourceDraftId when a THCS summary card omits it', async () => {
    const current = {
      id: 'thcs-2',
      ownerId: 'teacher-1',
      title: 'THCS',
      testType: 'THCS-THPT',
      skill: 'thcs',
      sourceDraftId: 'runtime-draft-2',
      updatedAt: 1_700_000_000_000,
    };
    values.set('tests/thcs-2', current);
    const { result } = renderHook(() => useTeacherTests({
      ownerId: 'teacher-1',
      enabled: false,
    }));

    await act(async () => {
      await result.current.deleteTest({
        id: 'thcs-2',
        ownerId: 'teacher-1',
        title: 'THCS',
        testType: 'THCS-THPT',
        skill: 'thcs',
      });
    });

    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'thcs_library',
      id: 'thcs-2',
    }));
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'thcs_drafts',
      id: 'runtime-draft-2',
    }));
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
