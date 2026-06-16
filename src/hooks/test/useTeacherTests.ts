import { useState, useEffect, useCallback } from 'react';
import { database } from '../../services/firebase';
import { firestore as db } from '../../services/firebase';
import { ref, onValue, remove, update as dbUpdate, query, orderByChild, equalTo } from 'firebase/database';
import { doc, deleteDoc } from 'firebase/firestore';
import queryOptimizer from '../../services/firebaseQueryOptimizer';
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
}

function summarizeTestsForDiagnostics(testList: any[]) {
  return {
    count: testList.length,
    readingV2Count: testList.filter((test) => test?.deliveryEngine === 'reading-v2').length,
    publicCount: testList.filter((test) => test?.isPublic === true).length,
    thcsCount: testList.filter((test) => test?.testType === 'THCS-THPT').length,
    writingCount: testList.filter((test) => String(test?.skill || '').toLowerCase() === 'writing').length,
  };
}

export function useTeacherTests(options: UseTeacherTestsOptions = {}) {
  const {
    enabled = true,
    ownerId,
    userRole = '',
    contentFilter = 'my',
    realtime = true,
    skipCache = false,
  } = options;
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);

  const isSuperAdminMyContent = userRole === 'super_admin' && contentFilter === 'my';
  const listScope = contentFilter === 'public'
    ? 'public'
    : isSuperAdminMyContent
      ? 'all'
      : 'owned';

  const loadTeacherTests = useCallback(async (nextSkipCache = skipCache) => {
    if (listScope === 'public') {
      return queryOptimizer.getPublicTests(nextSkipCache);
    }

    if (listScope === 'all') {
      return queryOptimizer.getAllTests(nextSkipCache);
    }

    if (!ownerId) {
      return [];
    }

    return queryOptimizer.getTeacherOwnedTests(ownerId, nextSkipCache);
  }, [listScope, ownerId, skipCache]);

  const invalidateScopedCache = useCallback(() => {
    if (listScope === 'public') {
      queryOptimizer.invalidate('test', 'public');
      return;
    }

    if (listScope === 'all') {
      queryOptimizer.invalidate('test', 'all');
      return;
    }

    if (ownerId) {
      queryOptimizer.invalidate('test', `owner:${ownerId}`);
    }
  }, [listScope, ownerId]);

  const getRealtimeQueries = useCallback(() => {
    const testsRef = ref(database, 'tests');

    if (listScope === 'public') {
      return [query(testsRef, orderByChild('isPublic'), equalTo(true))];
    }

    if (listScope === 'all') {
      return [testsRef];
    }

    if (!ownerId) {
      return [];
    }

    return [
      query(testsRef, orderByChild('ownerId'), equalTo(ownerId)),
      query(testsRef, orderByChild('createdBy'), equalTo(ownerId)),
    ];
  }, [listScope, ownerId]);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    let isSubscribed = true;
    let realtimeReloadScheduled = false;

    if (!enabled) {
      setTests([]);
      setLoading(false);
      setError(null);
      setLoadedScope(null);
      return () => {
        isSubscribed = false;
      };
    }

    const scheduleRealtimeReload = () => {
      if (realtimeReloadScheduled || !isSubscribed) {
        return;
      }

      realtimeReloadScheduled = true;

      void Promise.resolve().then(() => {
        realtimeReloadScheduled = false;

        if (!isSubscribed) {
          return;
        }

        invalidateScopedCache();
        const reloadStartedAt = getTeacherMaterialsDiagnosticTime();
        void loadTeacherTests(true).then((list) => {
          if (!isSubscribed) return;
          logTeacherMaterialsDiagnostic('realtime_reload_succeeded', {
            scope: listScope,
            contentFilter,
            durationMs: getTeacherMaterialsElapsedMs(reloadStartedAt),
            ...summarizeTestsForDiagnostics(list),
          });
          setTests(list);
          setLoadedScope(listScope);
          setLoading(false);
        }).catch((error: any) => {
          if (!isSubscribed) return;
          logTeacherMaterialsDiagnostic('realtime_reload_failed', {
            scope: listScope,
            message: error instanceof Error ? error.message : String(error),
          });
          console.error('Error loading indexed tests:', error);
          setLoading(false);
        });
      });
    };

    const loadData = async () => {
      const startedAt = getTeacherMaterialsDiagnosticTime();
      logTeacherMaterialsDiagnostic('hook_load_requested', {
        scope: listScope,
        contentFilter,
        realtime,
        skipCache,
        ownerPresent: Boolean(ownerId),
        ownerTail: ownerId?.slice(-6) ?? null,
      });
      setLoading(true);
      setLoadedScope(null);
      try {
        const testList = await loadTeacherTests(skipCache);
        logTeacherMaterialsDiagnostic('hook_load_succeeded', {
          scope: listScope,
          contentFilter,
          realtime,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          ...summarizeTestsForDiagnostics(testList),
        });
        if (isSubscribed) {
          setTests(testList);
          setLoadedScope(listScope);
          setLoading(false);
          setError(null);
        }

        if (realtime) {
          const realtimeQueries = getRealtimeQueries();
          let initialListenerCallsRemaining = realtimeQueries.length;
          logTeacherMaterialsDiagnostic('realtime_listener_registered', {
            scope: listScope,
            contentFilter,
            listenerCount: realtimeQueries.length,
          });

          realtimeQueries.forEach((testsQuery) => {
            unsubscribers.push(onValue(testsQuery, () => {
              if (!isSubscribed) return;

              if (initialListenerCallsRemaining > 0) {
                initialListenerCallsRemaining -= 1;
                logTeacherMaterialsDiagnostic('realtime_initial_snapshot_skipped', {
                  scope: listScope,
                  remainingInitialSnapshots: initialListenerCallsRemaining,
                });
                return;
              }

              scheduleRealtimeReload();
            }, (error: any) => {
              if (error.code === 'PERMISSION_DENIED') {
                console.log('[REALTIME] Test listener stopped (user logged out)');
                return;
              }
              console.error('Error loading tests:', error);
              if (isSubscribed) setLoading(false);
            }));
          });
        }
      } catch (error) {
        logTeacherMaterialsDiagnostic('hook_load_failed', {
          scope: listScope,
          contentFilter,
          durationMs: getTeacherMaterialsElapsedMs(startedAt),
          message: error instanceof Error ? error.message : String(error),
        });
        console.error('Error in data loading:', error);
        if (isSubscribed) {
          setError(error instanceof Error ? error.message : 'Failed to load tests');
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isSubscribed = false;
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
    };
  }, [contentFilter, enabled, loadTeacherTests, getRealtimeQueries, invalidateScopedCache, listScope, ownerId, realtime, skipCache]);

  const refresh = async () => {
    if (!enabled) {
      setTests([]);
      setLoadedScope(null);
      setError(null);
      setLoading(false);
      return;
    }

    const startedAt = getTeacherMaterialsDiagnosticTime();
    logTeacherMaterialsDiagnostic('refresh_requested', {
      scope: listScope,
      contentFilter,
      ownerPresent: Boolean(ownerId),
    });
    invalidateScopedCache();
    const testList = await loadTeacherTests(true);
    logTeacherMaterialsDiagnostic('refresh_succeeded', {
      scope: listScope,
      contentFilter,
      durationMs: getTeacherMaterialsElapsedMs(startedAt),
      ...summarizeTestsForDiagnostics(testList),
    });
    setTests(testList);
    setLoadedScope(listScope);
  };

  const deleteTest = async (test: any) => {
    const testRef = ref(database, `tests/${test.id}`);
    await remove(testRef);
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';

    const isThcs = test.testType === 'THCS-THPT';
    if (isThcs) {
      try {
        await deleteDoc(doc(db, 'thcs_library', test.id));
      } catch { }
      if (test.sourceDraftId) {
        try {
          await deleteDoc(doc(db, 'thcs_drafts', test.sourceDraftId));
        } catch { }
      }
      return;
    }

    if (isWritingTest && test.sourceDraftId) {
      try {
        await deleteDoc(doc(db, 'writing_drafts', test.sourceDraftId));
      } catch { }
    }
  };

  const togglePublic = async (id: string, currentIsPublic: boolean, type: string = 'test') => {
    try {
      const itemRef = ref(database, `${type}s/${id}`);
      await dbUpdate(itemRef, {
        isPublic: !currentIsPublic,
        updatedAt: Date.now()
      });
      console.log(`${type} ${id} isPublic toggled to ${!currentIsPublic}`);
    } catch (error) {
      console.error(`Error toggling isPublic for ${type}:`, error);
      alert(`Failed to update ${type}. Please try again.`);
    }
  };

  return { tests, loading, error, loadedScope, refresh, deleteTest, togglePublic };
}
