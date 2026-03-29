import { useState, useEffect } from 'react';
import { database } from '../../services/firebase';
import { firestore as db } from '../../services/firebase';
import { ref, onValue, remove, update as dbUpdate } from 'firebase/database';
import { doc, deleteDoc } from 'firebase/firestore';
import queryOptimizer from '../../services/firebaseQueryOptimizer';

interface UseTeacherTestsOptions {
  realtime?: boolean;
  skipCache?: boolean;
}

export function useTeacherTests(options: UseTeacherTestsOptions = {}) {
  const { realtime = true } = options;
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isSubscribed = true;
    let skipFirstCall = true; // Prevent immediate cache invalidation

    const loadData = async () => {
      setLoading(true);
      try {
        // Initial fetch with cache
        const testList = await queryOptimizer.getAllTests();
        if (isSubscribed) {
          setTests(testList);
          setLoading(false);
        }

        if (realtime) {
          // Real-time subscription
          const testsRef = ref(database, 'tests');
          unsubscribe = onValue(testsRef, (snapshot) => {
            if (!isSubscribed) return;

            // Skip first call (onValue fires immediately with current data)
            if (skipFirstCall) {
              skipFirstCall = false;
              console.log('📝 [REALTIME] Skipping first test listener call (already have data)');
              return;
            }

            const data = snapshot.val();
            const list = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            console.log('📝 [REALTIME] Tests updated:', list.length);
            setTests(list);
            setLoading(false);

            // Only invalidate cache on actual updates
            queryOptimizer.invalidate('test', 'all');
          }, (error: any) => {
            // Check if error is due to logout (permission denied is expected after logout)
            if (error.code === 'PERMISSION_DENIED') {
              console.log('🔒 [REALTIME] Test listener stopped (user logged out)');
              return; // Silent fail - user is logging out
            }
            console.error('Error loading tests:', error);
            if (isSubscribed) setLoading(false);
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
      if (unsubscribe) unsubscribe();
    };
  }, [realtime]);

  const refresh = async () => {
    queryOptimizer.invalidate('test', 'all');
    const testList = await queryOptimizer.getAllTests();
    setTests(testList);
  };

  const deleteTest = async (test: any) => {
    const testRef = ref(database, `tests/${test.id}`);
    await remove(testRef);
    const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';

    // PRD-0027: Clean up Firestore thcs_library and draft if THCS test
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
      console.log(`✅ ${type} ${id} isPublic toggled to ${!currentIsPublic}`);
    } catch (error) {
      console.error(`❌ Error toggling isPublic for ${type}:`, error);
      alert(`Failed to update ${type}. Please try again.`);
    }
  };

  return { tests, loading, error, refresh, deleteTest, togglePublic };
}
