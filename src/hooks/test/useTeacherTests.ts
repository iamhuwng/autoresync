import { useState, useEffect } from 'react';
import { database } from '../../services/firebase';
import { firestore as db } from '../../services/firebase';
import { ref, onValue, remove, update as dbUpdate } from 'firebase/database';
import { doc, deleteDoc } from 'firebase/firestore';
import queryOptimizer from '../../services/firebaseQueryOptimizer';
import {
  getReadingV2TeacherLobbyIndexQuery,
  getReadingV2TeacherLobbyTests,
  mergeReadingV2TeacherLobbyTests,
} from '../../services/reading-v2/readingV2TeacherLobbyMaterials.service';

interface UseTeacherTestsOptions {
  realtime?: boolean;
  skipCache?: boolean;
  ownerId?: string;
}

export function useTeacherTests(options: UseTeacherTestsOptions = {}) {
  const { ownerId, realtime = true, skipCache = false } = options;
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    let isSubscribed = true;
    let skipFirstTestsCall = true;
    let skipFirstReadingV2Call = true;

    const loadTeacherTests = async (nextSkipCache = skipCache) => {
      const [testList, readingV2Tests] = await Promise.all([
        queryOptimizer.getAllTests(nextSkipCache),
        getReadingV2TeacherLobbyTests(ownerId),
      ]);

      return mergeReadingV2TeacherLobbyTests(testList, readingV2Tests);
    };

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
          const testsRef = ref(database, 'tests');
          unsubscribers.push(onValue(testsRef, () => {
            if (!isSubscribed) return;

            if (skipFirstTestsCall) {
              skipFirstTestsCall = false;
              console.log('[REALTIME] Skipping first test listener call (already have data)');
              return;
            }

            queryOptimizer.invalidate('test', 'all');
            void loadTeacherTests(true).then((list) => {
              if (!isSubscribed) return;
              console.log('[REALTIME] Tests updated:', list.length);
              setTests(list);
              setLoading(false);
            }).catch((error: any) => {
              if (!isSubscribed) return;
              console.error('Error loading tests:', error);
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

          if (ownerId) {
            unsubscribers.push(onValue(getReadingV2TeacherLobbyIndexQuery(ownerId), () => {
              if (!isSubscribed) return;

              if (skipFirstReadingV2Call) {
                skipFirstReadingV2Call = false;
                console.log('[REALTIME] Skipping first Reading V2 lobby listener call (already have data)');
                return;
              }

              queryOptimizer.invalidate('test', 'all');
              void loadTeacherTests(true).then((list) => {
                if (!isSubscribed) return;
                console.log('[REALTIME] Reading V2 lobby materials updated:', list.length);
                setTests(list);
                setLoading(false);
              }).catch((error: any) => {
                if (!isSubscribed) return;
                console.error('Error loading Reading V2 lobby materials:', error);
                setLoading(false);
              });
            }, (error: any) => {
              if (error.code === 'PERMISSION_DENIED') {
                console.log('[REALTIME] Reading V2 lobby listener stopped (user logged out)');
                return;
              }
              console.error('Error loading Reading V2 lobby materials:', error);
              if (isSubscribed) setLoading(false);
            }));
          }
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
  }, [ownerId, realtime, skipCache]);

  const refresh = async () => {
    queryOptimizer.invalidate('test', 'all');
    const [testList, readingV2Tests] = await Promise.all([
      queryOptimizer.getAllTests(true),
      getReadingV2TeacherLobbyTests(ownerId),
    ]);
    setTests(mergeReadingV2TeacherLobbyTests(testList, readingV2Tests));
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
