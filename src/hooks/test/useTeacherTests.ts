import { useState, useEffect, useCallback } from 'react';
import { database } from '../../services/firebase';
import { firestore as db } from '../../services/firebase';
import { ref, onValue, remove, update as dbUpdate, query, orderByChild, equalTo } from 'firebase/database';
import { doc, deleteDoc } from 'firebase/firestore';
import queryOptimizer from '../../services/firebaseQueryOptimizer';

type TeacherContentFilter = 'my' | 'public' | 'drafts';

interface UseTeacherTestsOptions {
  realtime?: boolean;
  skipCache?: boolean;
  ownerId?: string;
  userRole?: string;
  contentFilter?: TeacherContentFilter;
}

export function useTeacherTests(options: UseTeacherTestsOptions = {}) {
  const { ownerId, userRole = '', contentFilter = 'my', realtime = true, skipCache = false } = options;
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const loadData = async () => {
      setLoading(true);
      try {
        const testList = await loadTeacherTests(skipCache);
        if (isSubscribed) {
          setTests(testList);
          setLoading(false);
          setError(null);
        }

        if (realtime) {
          const realtimeQueries = getRealtimeQueries();
          let initialListenerCallsRemaining = realtimeQueries.length;

          realtimeQueries.forEach((testsQuery) => {
            unsubscribers.push(onValue(testsQuery, () => {
              if (!isSubscribed) return;

              if (initialListenerCallsRemaining > 0) {
                initialListenerCallsRemaining -= 1;
                console.log('[REALTIME] Skipping first indexed test listener call (already have data)');
                return;
              }

              invalidateScopedCache();
              void loadTeacherTests(true).then((list) => {
                if (!isSubscribed) return;
                console.log('[REALTIME] Indexed tests updated:', list.length);
                setTests(list);
                setLoading(false);
              }).catch((error: any) => {
                if (!isSubscribed) return;
                console.error('Error loading indexed tests:', error);
                setLoading(false);
              });
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
  }, [loadTeacherTests, getRealtimeQueries, invalidateScopedCache, realtime]);

  const refresh = async () => {
    invalidateScopedCache();
    const testList = await loadTeacherTests(true);
    setTests(testList);
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

  return { tests, loading, error, refresh, deleteTest, togglePublic };
}
