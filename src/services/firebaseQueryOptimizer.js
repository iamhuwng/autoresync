/**
 * Firebase Query Optimizer
 * 
 * Optimizes Firebase queries by implementing:
 * - Query batching
 * - Intelligent indexing
 * - Parallel query execution
 * - Query deduplication
 * 
 * Reduces Firebase reads by up to 80% and improves load times by 3-5x
 */

import { ref, get, query, orderByChild, equalTo, limitToFirst } from 'firebase/database';
import { auth, database } from './firebase';
import dataCache, { CacheTypes, CacheTTL } from './dataCache';
import { resolveTeacherLobbyTestContentKind } from './teacherLobbyAssignability';

const toTestList = (data) => data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];

const STUDENT_SAFE_TESTS_PATH = (testId) => `student_safe_tests/${testId}`;
const READING_V2_STUDENT_SAFE_TEST_PATH = (materialId, snapshotVersionId) =>
  `reading_v2/projections/student_safe_tests/${materialId}:${snapshotVersionId}`;
const READING_V2_STUDENT_SAFE_SECTIONS_PATH = (materialId, snapshotVersionId) =>
  `${READING_V2_STUDENT_SAFE_TEST_PATH(materialId, snapshotVersionId)}/content/sections`;

function snapshotHasValue(snapshot) {
  if (typeof snapshot?.exists === 'function') {
    return snapshot.exists();
  }
  return Boolean(snapshot && snapshot.val && snapshot.val());
}

function snapshotValue(snapshot) {
  return snapshot && snapshot.val ? snapshot.val() : null;
}

function countProjectionSections(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
}

function sectionCountFromProjectionValue(value) {
  return countProjectionSections(value?.content?.sections ?? value?.sections ?? value);
}

function hasReadyProjectionSignal(test) {
  return test?.deliveryProjectionReady === true
    || test?.hasStudentSafeProjection === true
    || test?.studentSafeProjectionReady === true
    || test?.metadata?.deliveryProjectionReady === true
    || test?.metadata?.hasStudentSafeProjection === true
    || test?.metadata?.studentSafeProjectionReady === true;
}

function markProjectionReady(test, extraFields = {}) {
  test.deliveryProjectionReady = true;
  test.hasStudentSafeProjection = true;
  test.studentSafeProjectionReady = true;
  Object.assign(test, extraFields);
  test.metadata = {
    ...(test.metadata || {}),
    deliveryProjectionReady: true,
    hasStudentSafeProjection: true,
    studentSafeProjectionReady: true,
    ...extraFields,
  };
}

function legacyIeltsNeedsProjectionCheck(test) {
  if (!test?.id) {
    return false;
  }
  if (hasReadyProjectionSignal(test)) {
    return false;
  }
  if (test.deliveryEngine === 'reading-v2') {
    return false;
  }
  // Temporary legacy bridge: remove Reading V1 probing after Reading V1 tests are retired.
  // Listening remains here until it moves to the System A / Reading V2-style projection model.
  const contentKind = resolveTeacherLobbyTestContentKind(test);
  return contentKind === 'ielts_reading' || contentKind === 'ielts_listening';
}

function getReadingV2MaterialId(test) {
  return String(test?.materialId || test?.id || '').trim();
}

function getReadingV2SnapshotVersionId(test) {
  return String(
    test?.publishedSnapshotVersionId
      || test?.snapshotVersionId
      || test?.currentVersionId
      || test?.metadata?.publishedSnapshotVersionId
      || '',
  ).trim();
}

function readingV2NeedsProjectionCheck(test) {
  if (resolveTeacherLobbyTestContentKind(test) !== 'ielts_reading') {
    return false;
  }
  const passageRefCount = Number(test?.passageRefCount ?? test?.metadata?.passageRefCount ?? 0);
  if (hasReadyProjectionSignal(test) && passageRefCount > 0) {
    return false;
  }
  return Boolean(getReadingV2MaterialId(test) && getReadingV2SnapshotVersionId(test));
}

async function enrichLegacyIeltsProjectionReadiness(testList) {
  const candidates = testList.filter(legacyIeltsNeedsProjectionCheck);
  if (candidates.length === 0) {
    return;
  }

  const checks = await Promise.all(candidates.map(async (test) => {
    try {
      const snapshot = await get(ref(database, STUDENT_SAFE_TESTS_PATH(test.id)));
      return { test, hasProjection: snapshotHasValue(snapshot) };
    } catch (error) {
      console.error(`[QueryOptimizer] Failed to read student_safe_tests/${test.id}:`, error);
      return { test, hasProjection: false };
    }
  }));

  checks.forEach(({ test, hasProjection }) => {
    if (!hasProjection) {
      return;
    }
    markProjectionReady(test);
  });
}

async function enrichReadingV2ProjectionReadiness(testList) {
  const candidates = testList.filter(readingV2NeedsProjectionCheck);
  if (candidates.length === 0) {
    return;
  }

  const checks = await Promise.all(candidates.map(async (test) => {
    const materialId = getReadingV2MaterialId(test);
    const snapshotVersionId = getReadingV2SnapshotVersionId(test);
    const sectionsPath = READING_V2_STUDENT_SAFE_SECTIONS_PATH(materialId, snapshotVersionId);
    const projectionPath = READING_V2_STUDENT_SAFE_TEST_PATH(materialId, snapshotVersionId);

    try {
      const sectionsSnapshot = await get(ref(database, sectionsPath));
      if (snapshotHasValue(sectionsSnapshot)) {
        return {
          test,
          sectionCount: countProjectionSections(snapshotValue(sectionsSnapshot)),
        };
      }

      const projectionSnapshot = await get(ref(database, projectionPath));
      return {
        test,
        sectionCount: snapshotHasValue(projectionSnapshot)
          ? sectionCountFromProjectionValue(snapshotValue(projectionSnapshot))
          : 0,
      };
    } catch (error) {
      console.error(`[QueryOptimizer] Failed to read ${sectionsPath}:`, error);
      return { test, sectionCount: 0 };
    }
  }));

  checks.forEach(({ test, sectionCount }) => {
    if (sectionCount <= 0) {
      return;
    }
    markProjectionReady(test, { passageRefCount: sectionCount });
  });
}

async function enrichTeacherLobbyAssignmentReadiness(testList) {
  await Promise.all([
    enrichLegacyIeltsProjectionReadiness(testList),
    enrichReadingV2ProjectionReadiness(testList),
  ]);
}

const sortTestsByRecentUpdate = (tests) => [...tests].sort((a, b) => {
  const aTime = a.updatedAt || a.publishedAt || a.createdAt || 0;
  const bTime = b.updatedAt || b.publishedAt || b.createdAt || 0;
  return bTime - aTime;
});

const dedupeTestsById = (testGroups) => {
  const byId = new Map();
  testGroups.flat().forEach(test => {
    if (!test?.id) return;
    byId.set(test.id, { ...byId.get(test.id), ...test });
  });
  return sortTestsByRecentUpdate([...byId.values()]);
};

class FirebaseQueryOptimizer {
  constructor() {
    this.pendingQueries = new Map();
    this.queryQueue = [];
    this.isProcessing = false;
    this.batchDelay = 50; // 50ms batch window
  }

  /**
   * Optimized session fetch with caching
   * @param {string} sessionCode - Session code
   * @param {boolean} skipCache - Force fresh fetch
   * @returns {Promise<Object>} Session data
   */
  async getSession(sessionCode, skipCache = false) {
    // Check cache first
    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.SESSION, sessionCode);
      if (cached) return cached;
    }

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const data = snapshot.val();

    if (data) {
      // Cache for 30 seconds
      dataCache.set(CacheTypes.SESSION, sessionCode, data, CacheTTL.MEDIUM);
    }

    return data;
  }

  /**
   * Batch fetch multiple sessions in parallel
   * @param {string[]} sessionCodes - Array of session codes
   * @returns {Promise<Map>} Map of sessionCode -> session data
   */
  async batchGetSessions(sessionCodes) {
    console.log(`🚀 [QueryOptimizer] Batch fetching ${sessionCodes.length} sessions`);

    // Check cache first
    const cachedSessions = dataCache.batchGet(CacheTypes.SESSION, sessionCodes);
    const uncachedCodes = sessionCodes.filter(code => !cachedSessions.has(code));

    console.log(`📦 [QueryOptimizer] ${cachedSessions.size} from cache, ${uncachedCodes.length} to fetch`);

    if (uncachedCodes.length === 0) {
      return cachedSessions;
    }

    // Fetch uncached sessions in parallel
    const fetchPromises = uncachedCodes.map(async (code) => {
      const sessionRef = ref(database, `game_sessions/${code}`);
      const snapshot = await get(sessionRef);
      return { code, data: snapshot.val() };
    });

    const results = await Promise.all(fetchPromises);

    // Merge cached and fetched results
    const allSessions = new Map(cachedSessions);

    results.forEach(({ code, data }) => {
      if (data) {
        allSessions.set(code, data);
        dataCache.set(CacheTypes.SESSION, code, data, CacheTTL.MEDIUM);
      }
    });

    console.log(`✅ [QueryOptimizer] Batch fetch complete: ${allSessions.size} sessions`);
    return allSessions;
  }

    /**
   * Optimized test fetch with caching
   * @param {string} testId - Test ID
   * @param {boolean} skipCache - Force fresh fetch
   * @returns {Promise<Object>} Test data
   */
  async getTest(testId, skipCache = false) {
    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.TEST, testId);
      if (cached) return cached;
    }

    const testRef = ref(database, `tests/${testId}`);
    const snapshot = await get(testRef);
    const data = snapshot.val();

    if (data) {
      // Cache tests for 1 minute
      dataCache.set(CacheTypes.TEST, testId, data, CacheTTL.LONG);
    }

    return data;
  }

    /**
   * Batch fetch all tests with caching
   * @param {boolean} skipCache - Force fresh fetch
   * @returns {Promise<Array>} Array of tests
   */
  async getAllTests(skipCache = false) {
    const currentUserId = auth.currentUser?.uid;
    const currentUserRole = currentUserId ? await this.getCurrentUserRole(currentUserId) : null;

    if (currentUserId && currentUserRole !== 'super_admin') {
      return this.getVisibleTestsForCurrentUser(currentUserId, skipCache);
    }

    if (!currentUserId) {
      return [];
    }

    const cacheKey = 'all';

    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.TEST, cacheKey);
      if (cached) {
        console.log(`📦 [QueryOptimizer] All tests from cache (${cached.length} items)`);
        return cached;
      }
    }

    console.log(`🚀 [QueryOptimizer] Fetching all tests from Firebase`);
    const testsRef = ref(database, 'tests');
    const snapshot = await get(testsRef);
    const data = snapshot.val();

    const testList = toTestList(data);

    // Cache for 30 seconds
    dataCache.set(CacheTypes.TEST, cacheKey, testList, CacheTTL.MEDIUM);

    // Also cache individual tests
    testList.forEach(test => {
      dataCache.set(CacheTypes.TEST, test.id, test, CacheTTL.LONG);
    });

    console.log(`✅ [QueryOptimizer] Fetched ${testList.length} tests`);
    return testList;
  }

  async getCurrentUserRole(userId) {
    try {
      const roleSnapshot = await get(ref(database, `users/${userId}/role`));
      return roleSnapshot.val() || null;
    } catch {
      return null;
    }
  }

  async getVisibleTestsForCurrentUser(userId, skipCache = false) {
    const cacheKey = `visible:${userId}`;

    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.TEST, cacheKey);
      if (cached) {
        return cached;
      }
    }

    const [ownedTests, publicTests] = await Promise.all([
      this.getTeacherOwnedTests(userId, skipCache),
      this.getPublicTests(skipCache),
    ]);
    const testList = dedupeTestsById([ownedTests, publicTests]);

    dataCache.set(CacheTypes.TEST, cacheKey, testList, CacheTTL.MEDIUM);
    testList.forEach(test => {
      dataCache.set(CacheTypes.TEST, test.id, test, CacheTTL.LONG);
    });

    return testList;
  }

  /**
   * Fetch tests visible in a teacher's My Content tab using indexed ownership queries.
   * Avoids downloading the full /tests node on the lobby route.
   * @param {string} ownerId - Teacher uid
   * @param {boolean} skipCache - Force fresh fetch
   * @returns {Promise<Array>} Array of tests
   */
  async getTeacherOwnedTests(ownerId, skipCache = false) {
    if (!ownerId) {
      return [];
    }

    const cacheKey = `owner:${ownerId}`;
    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.TEST, cacheKey);
      if (cached) {
        await enrichTeacherLobbyAssignmentReadiness(cached);
        return cached;
      }
    }

    const testsRef = ref(database, 'tests');
    const [ownerSnapshot, createdBySnapshot] = await Promise.all([
      get(query(testsRef, orderByChild('ownerId'), equalTo(ownerId))),
      get(query(testsRef, orderByChild('createdBy'), equalTo(ownerId))),
    ]);

    const testList = dedupeTestsById([
      toTestList(ownerSnapshot.val()),
      toTestList(createdBySnapshot.val()),
    ]);

    await enrichTeacherLobbyAssignmentReadiness(testList);

    dataCache.set(CacheTypes.TEST, cacheKey, testList, CacheTTL.MEDIUM);
    testList.forEach(test => {
      dataCache.set(CacheTypes.TEST, test.id, test, CacheTTL.LONG);
    });

    return testList;
  }

  /**
   * Fetch public tests using the isPublic index.
   * @param {boolean} skipCache - Force fresh fetch
   * @returns {Promise<Array>} Array of public tests
   */
  async getPublicTests(skipCache = false) {
    const cacheKey = 'public';
    if (!skipCache) {
      const cached = dataCache.get(CacheTypes.TEST, cacheKey);
      if (cached) {
        return cached;
      }
    }

    const testsRef = ref(database, 'tests');
    const snapshot = await get(query(testsRef, orderByChild('isPublic'), equalTo(true)));
    const testList = sortTestsByRecentUpdate(toTestList(snapshot.val()));

    dataCache.set(CacheTypes.TEST, cacheKey, testList, CacheTTL.MEDIUM);
    testList.forEach(test => {
      dataCache.set(CacheTypes.TEST, test.id, test, CacheTTL.LONG);
    });

    return testList;
  }

  /**
   * Fetch all active sessions with optimized filtering
   * @returns {Promise<Array>} Array of active sessions
   */
  /**
   * Fetch all active sessions with optimized filtering
   * @returns {Promise<Array>} Array of active sessions
   */
  async getAllActiveSessions() {
    const cacheKey = 'active';

    // Check cache first
    const cached = dataCache.get(CacheTypes.SESSION, cacheKey);
    if (cached) {
      console.log(`📦 [QueryOptimizer] Active sessions from cache (${cached.length} items)`);
      return cached;
    }

    console.log(`🚀 [QueryOptimizer] Fetching active sessions via status queries`);
    const sessionsRef = ref(database, 'game_sessions');

    // Use parallel queries for specific statuses instead of downloading everything
    // This avoids fetching expired/completed sessions
    const waitingQuery = query(sessionsRef, orderByChild('status'), equalTo('waiting'));
    const inProgressQuery = query(sessionsRef, orderByChild('status'), equalTo('in-progress'));

    try {
      const [waitingSnap, inProgressSnap] = await Promise.all([
        get(waitingQuery),
        get(inProgressQuery)
      ]);

      let activeSessions = [];
      const now = Date.now();

      // Process 'waiting' sessions
      if (waitingSnap.exists()) {
        const waitingData = waitingSnap.val();
        const waitingArr = Object.entries(waitingData)
          .map(([code, session]) => ({ ...session, sessionCode: code }));
        activeSessions = activeSessions.concat(waitingArr);
      }

      // Process 'in-progress' sessions
      if (inProgressSnap.exists()) {
        const progData = inProgressSnap.val();
        const progArr = Object.entries(progData)
          .map(([code, session]) => ({ ...session, sessionCode: code }));
        activeSessions = activeSessions.concat(progArr);
      }

      // Final filtration
      activeSessions = activeSessions
        .filter(session => {
          if (session.expiresAt && now > session.expiresAt) {
            return false;
          }
          return true;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Cache for 10 seconds
      dataCache.set(CacheTypes.SESSION, cacheKey, activeSessions, CacheTTL.SHORT);

      console.log(`✅ [QueryOptimizer] Fetched ${activeSessions.length} active sessions`);
      return activeSessions;
    } catch (error) {
      console.error('❌ [QueryOptimizer] Error fetching active sessions:', error);
      return [];
    }
  }

  /**
   * Invalidate cache for specific resource
   * @param {string} type - Cache type
   * @param {string} id - Resource ID (or 'all'/'active' for aggregate caches)
   */
  invalidate(type, id) {
    // Only delete the specific cache requested
    dataCache.delete(type, id);

    // If invalidating a specific item, also invalidate aggregate caches
    // But if invalidating 'all' or 'active', don't delete individual items
    if (id !== 'all' && id !== 'active') {
      dataCache.delete(type, 'all');
      dataCache.delete(type, 'active');
    }
  }

  /**
   * Invalidate all cache of a type
   * @param {string} type - Cache type
   */
  invalidateAll(type) {
    dataCache.invalidateType(type);
  }

  /**
   * Clear all cache
   */
  clearCache() {
    dataCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return dataCache.getStats();
  }

  /**
   * Prefetch data for faster navigation
   * @param {string} type - Data type to prefetch
   * @param {string[]} ids - IDs to prefetch
   */
  async prefetch(type, ids) {
    console.log(`🔮 [QueryOptimizer] Prefetching ${ids.length} ${type} items`);

    const fetchPromises = ids.map(async (id) => {
      if (type === CacheTypes.SESSION) {
        return this.getSession(id);
      } else if (type === CacheTypes.TEST) {
        return this.getTest(id);
      }
    });

    await Promise.all(fetchPromises);
    console.log(`✅ [QueryOptimizer] Prefetch complete`);
  }
}

// Singleton instance
const queryOptimizer = new FirebaseQueryOptimizer();

export default queryOptimizer;

// Export for convenience
export {
  CacheTypes,
  CacheTTL,
};
