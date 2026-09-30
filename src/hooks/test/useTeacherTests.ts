import { useState, useEffect, useCallback, useRef } from 'react';
import {
  get,
  endBefore,
  limitToLast,
  onValue,
  orderByChild,
  query as dbQuery,
  ref,
  update as dbUpdate,
} from 'firebase/database';
import {
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { database, firestore as db } from '../../services/firebase';
import {
  adaptMaterialSummariesToTeacherCards,
} from '../../services/materialCatalog/materialSummaryCardAdapter.service';
import {
  buildMaterialSummaryUpdatePayload,
  getMaterialSummaryPagePath,
  listMaterialSummaryPage,
  type MaterialSummaryPageCursor,
  type MaterialSummaryPageQuery,
} from '../../services/materialCatalog/materialSummaryPort.service';
import {
  createLegacyTestMaterialSummary,
} from '../../services/materialCatalog/legacyTestMaterialSummary.service';
import {
  getTeacherMaterialsDiagnosticTime,
  getTeacherMaterialsElapsedMs,
  logTeacherMaterialsDiagnostic,
} from '../../utils/teacherMaterialsDiagnostics';

type TeacherContentFilter = 'my' | 'public' | 'drafts' | 'reading-passage' | 'book';

interface UseTeacherTestsOptions {
  enabled?: boolean;
  realtime?: boolean;
  skipCache?: boolean;
  ownerId?: string;
  userRole?: string;
  contentFilter?: TeacherContentFilter;
  testTypeId?: string | null;
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const deleteMaterialSidecars = async (
  deletes: Array<Promise<unknown>>,
  materialId: string,
) => {
  if (deletes.length === 0) {
    return;
  }
  const results = await Promise.allSettled(deletes);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn('[TeacherMaterials] Sidecar cleanup failed after material removal.', {
      materialId,
      failures: failures.length,
    });
  }
};

const isListeningLegacyRuntimeRecord = (
  runtime: Record<string, unknown>,
  card: Record<string, unknown>,
): boolean => {
  const skill = String(runtime.skill ?? card.skill ?? '').trim().toLowerCase();
  return skill === 'listening';
};

const summarizeMaterialsForDiagnostics = (materials: any[]) => ({
  count: materials.length,
  producerCounts: Object.fromEntries(
    [...new Set(materials.map((material) => material.producerId))]
      .filter(Boolean)
      .map((producerId) => [
        producerId,
        materials.filter((material) => material.producerId === producerId).length,
      ]),
  ),
  kindCounts: Object.fromEntries(
    [...new Set(materials.map((material) => material.materialKind))]
      .filter(Boolean)
      .map((materialKind) => [
        materialKind,
        materials.filter((material) => material.materialKind === materialKind).length,
      ]),
  ),
});

const teacherTestMaterialKinds = new Set([
  'full-test',
  'listening-part',
  'writing-prompt',
  'thcs-thpt-test',
]);

const isTeacherTestSummary = (summary: { materialKind?: unknown }): boolean =>
  teacherTestMaterialKinds.has(String(summary.materialKind || '').toLowerCase());

const readMaterialSummaries = async (query: MaterialSummaryPageQuery, cursor?: MaterialSummaryPageCursor) => {
  const page = await listMaterialSummaryPage(query, {
    readPage: async (path, limit, pageCursor) => {
      const snapshot = await get(dbQuery(ref(database, path), orderByChild('updatedAt'),
        ...(pageCursor ? [endBefore(pageCursor.updatedAt, pageCursor.materialId)] : []),
        limitToLast(limit)));
      return snapshot.exists() ? snapshot.val() : null;
    },
  }, { cursor });
  return { ...page, rows: adaptMaterialSummariesToTeacherCards(page.rows.filter(isTeacherTestSummary)) };
};

export function useTeacherTests(options: UseTeacherTestsOptions = {}) {
  const {
    enabled = true,
    ownerId,
    contentFilter = 'my',
    realtime = true,
    testTypeId,
  } = options;
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [cursor, setCursor] = useState<MaterialSummaryPageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const listScope = contentFilter === 'public' ? 'public' : 'owned';
  const scopeKey = `${enabled}:${listScope}:${ownerId ?? ''}:${testTypeId ?? ''}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const requestVersion = useRef(0);
  const moreInFlight = useRef(false);
  const buildQuery = useCallback((): MaterialSummaryPageQuery => {
    if (listScope === 'public') {
      return { scope: 'public', surfaceFamily: 'assessment', testTypeId: testTypeId || undefined };
    }
    if (!ownerId) {
      throw new Error('My Content requires an authenticated owner.');
    }
    return { scope: 'owned', ownerId, surfaceFamily: 'assessment', testTypeId: testTypeId || undefined };
  }, [listScope, ownerId, testTypeId]);

  const loadTeacherMaterials = useCallback(async (pageCursor?: MaterialSummaryPageCursor) =>
    readMaterialSummaries(buildQuery(), pageCursor), [buildQuery]);

  useEffect(() => {
    let isSubscribed = true;
    let unsubscribe: (() => void) | undefined;
    let initialSnapshot = true;
    requestVersion.current += 1;
    moreInFlight.current = false;
    setLoadingMore(false);
    setTests([]);
    setCursor(null);
    setHasMore(false);

    if (!enabled) {
      setTests([]);
      setLoading(false);
      setError(null);
      setLoadedScope(null);
      setCursor(null);
      setHasMore(false);
      return () => {
        isSubscribed = false;
      };
    }

    const load = async (source: 'initial' | 'realtime') => {
      const version = ++requestVersion.current;
      moreInFlight.current = false;
      setLoadingMore(false);
      const startedAt = getTeacherMaterialsDiagnosticTime();
      if (source === 'initial') {
        setLoading(true);
        setLoadedScope(null);
      }
      try {
        const page = await loadTeacherMaterials();
        const materials = page.rows;
        if (!isSubscribed || activeScope.current !== scopeKey || version !== requestVersion.current) {
          return;
        }
        logTeacherMaterialsDiagnostic(`${source}_load_succeeded`, {
          scope: listScope,
          contentFilter,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          ...summarizeMaterialsForDiagnostics(materials),
        });
        setTests(materials);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setLoadedScope(listScope);
        setError(null);
        setLoading(false);
      } catch (loadError) {
        if (!isSubscribed || activeScope.current !== scopeKey || version !== requestVersion.current) {
          return;
        }
        const message = errorMessage(
          loadError,
          'Failed to load material summaries.',
        );
        logTeacherMaterialsDiagnostic(`${source}_load_failed`, {
          scope: listScope,
          contentFilter,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          message,
        });
        setTests([]);
        setCursor(null);
        setHasMore(false);
        setLoadedScope(null);
        setError(message);
        setLoading(false);
      }
    };

    void load('initial').then(() => {
      if (!isSubscribed || !realtime) {
        return;
      }
      let query: MaterialSummaryPageQuery;
      try {
        query = buildQuery();
      } catch (queryError) {
        setError(errorMessage(queryError, 'Invalid material summary query.'));
        return;
      }
      unsubscribe = onValue(
        dbQuery(ref(database, getMaterialSummaryPagePath(query)), orderByChild('updatedAt'), limitToLast(26)),
        () => {
          if (initialSnapshot) {
            initialSnapshot = false;
            return;
          }
          void load('realtime');
        },
        (listenerError) => {
          if (!isSubscribed) {
            return;
          }
          setTests([]);
          setCursor(null);
          setHasMore(false);
          setLoadedScope(null);
          setError(errorMessage(
            listenerError,
            'Material summary realtime listener failed.',
          ));
          setLoading(false);
        },
      );
    });

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [
    buildQuery,
    contentFilter,
    enabled,
    listScope,
    loadTeacherMaterials,
    realtime,
    scopeKey,
  ]);

  const refresh = async () => {
    const version = ++requestVersion.current;
    moreInFlight.current = false;
    setLoadingMore(false);
    if (!enabled) {
      setTests([]);
      setLoadedScope(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await loadTeacherMaterials();
      if (activeScope.current !== scopeKey || version !== requestVersion.current) return;
      setTests(page.rows);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setLoadedScope(listScope);
      setError(null);
    } catch (refreshError) {
      if (activeScope.current !== scopeKey || version !== requestVersion.current) return;
      setTests([]);
      setCursor(null);
      setHasMore(false);
      setLoadedScope(null);
      setError(errorMessage(refreshError, 'Failed to refresh materials.'));
    } finally {
      if (activeScope.current === scopeKey && version === requestVersion.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!enabled || !cursor || !hasMore || moreInFlight.current) return;
    const version = requestVersion.current;
    moreInFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await loadTeacherMaterials(cursor);
      if (activeScope.current !== scopeKey || version !== requestVersion.current) return;
      setTests((current) => [...current, ...page.rows.filter((row) =>
        !current.some((existing) => existing.id === row.id))]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (loadError) {
      if (activeScope.current !== scopeKey || version !== requestVersion.current) return;
      setTests([]);
      setCursor(null);
      setHasMore(false);
      setLoadedScope(null);
      setError(errorMessage(loadError, 'Failed to load more materials.'));
    } finally {
      if (activeScope.current === scopeKey && version === requestVersion.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  const deleteTest = async (test: any) => {
    const snapshot = await get(ref(database, `tests/${test.id}`));
    if (!snapshot.exists()) {
      throw new Error(`Material runtime record not found: ${test.id}`);
    }
    const current = snapshot.val() as Record<string, unknown>;
    if (isListeningLegacyRuntimeRecord(current, test)) {
      throw new Error(
        'Listening material deletion is blocked until the audited deletion flow is available.',
      );
    }
    const previousSummary = createLegacyTestMaterialSummary(test.id, current);
    const removedSummary = createLegacyTestMaterialSummary(test.id, {
      ...current,
      updatedAt: Date.now(),
    }, 'removed');
    const runtimeSourceDraftId =
      typeof current.sourceDraftId === 'string' && current.sourceDraftId.trim()
        ? current.sourceDraftId.trim()
        : undefined;
    const sourceDraftId =
      typeof test.sourceDraftId === 'string' && test.sourceDraftId.trim()
        ? test.sourceDraftId.trim()
        : runtimeSourceDraftId;

    await dbUpdate(ref(database), {
      [`tests/${test.id}`]: null,
      ...buildMaterialSummaryUpdatePayload(removedSummary, previousSummary),
    });

    const isWritingTest =
      test?.testType === 'IELTS' &&
      String(test?.skill || '').toLowerCase() === 'writing';
    if (test.testType === 'THCS-THPT') {
      const deletes: Array<Promise<unknown>> = [
        deleteDoc(doc(db, 'thcs_library', test.id)),
      ];
      if (sourceDraftId) {
        deletes.push(deleteDoc(doc(db, 'thcs_drafts', sourceDraftId)));
      }
      await deleteMaterialSidecars(deletes, test.id);
      return;
    }
    if (isWritingTest && sourceDraftId) {
      await deleteMaterialSidecars([
        deleteDoc(doc(db, 'writing_drafts', sourceDraftId)),
      ], test.id);
    }
  };

  const togglePublic = async (
    id: string,
    currentIsPublic: boolean,
    type: string = 'test',
  ) => {
    if (type !== 'test') {
      throw new Error(`Unsupported universal material visibility adapter: ${type}`);
    }
    const snapshot = await get(ref(database, `tests/${id}`));
    if (!snapshot.exists()) {
      throw new Error(`Material runtime record not found: ${id}`);
    }
    const current = snapshot.val() as Record<string, unknown>;
    const next = {
      ...current,
      isPublic: !currentIsPublic,
      updatedAt: Date.now(),
    };
    await dbUpdate(ref(database), {
      [`tests/${id}/isPublic`]: next.isPublic,
      [`tests/${id}/updatedAt`]: next.updatedAt,
      ...buildMaterialSummaryUpdatePayload(
        createLegacyTestMaterialSummary(id, next),
        createLegacyTestMaterialSummary(id, current),
      ),
    });
  };

  return {
    tests,
    loading,
    error,
    loadedScope,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    deleteTest,
    togglePublic,
  };
}
