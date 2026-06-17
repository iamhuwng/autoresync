import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = {
  currentUser: {
    uid: 'teacher-1',
  },
};

const getMock = vi.fn();
const refMock = vi.fn((_database, path) => ({ path }));
const orderByChildMock = vi.fn((child) => ({ type: 'orderByChild', child }));
const equalToMock = vi.fn((value) => ({ type: 'equalTo', value }));
const queryMock = vi.fn((baseRef, ...constraints) => ({
  path: baseRef.path,
  constraints,
}));

vi.mock('firebase/database', () => ({
  ref: refMock,
  get: getMock,
  query: queryMock,
  orderByChild: orderByChildMock,
  equalTo: equalToMock,
  limitToFirst: vi.fn((value) => ({ type: 'limitToFirst', value })),
}));

vi.mock('./firebase', () => ({
  auth: authMock,
  database: {},
}));

vi.mock('./dataCache', () => ({
  default: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
  CacheTypes: {
    TEST: 'test',
    QUIZ: 'quiz',
    SESSION: 'session',
  },
  CacheTTL: {
    MEDIUM: 30,
    LONG: 300,
  },
}));

vi.mock('../utils/teacherMaterialsDiagnostics', () => ({
  getTeacherMaterialsDiagnosticTime: vi.fn(() => 100),
  getTeacherMaterialsElapsedMs: vi.fn(() => 1),
  logTeacherMaterialsDiagnostic: vi.fn(),
}));

const snapshot = (value) => ({
  val: () => value,
});

const queryConstraint = (queryRef, type) =>
  queryRef.constraints.find((constraint) => constraint.type === type);

const getQueryChild = (queryRef) => queryConstraint(queryRef, 'orderByChild')?.child;
const getQueryValue = (queryRef) => queryConstraint(queryRef, 'equalTo')?.value;

const testRows = {
  'own-private': {
    id: 'own-private',
    title: 'Own Private',
    ownerId: 'teacher-1',
    isPublic: false,
    updatedAt: 1,
  },
  'own-created': {
    id: 'own-created',
    title: 'Own Created',
    createdBy: 'teacher-1',
    isPublic: false,
    updatedAt: 2,
  },
  'other-public': {
    id: 'other-public',
    title: 'Other Public',
    ownerId: 'teacher-2',
    isPublic: true,
    updatedAt: 3,
  },
  'other-private': {
    id: 'other-private',
    title: 'Other Private',
    ownerId: 'teacher-2',
    isPublic: false,
    updatedAt: 4,
  },
};

describe('firebaseQueryOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.currentUser = { uid: 'teacher-1' };
    getMock.mockImplementation(async (target) => {
      if (target.path === 'users/teacher-1/role') {
        return snapshot('teacher');
      }

      if (target.path === 'tests' && Array.isArray(target.constraints)) {
        const child = getQueryChild(target);
        const value = getQueryValue(target);

        if (child === 'ownerId' && value === 'teacher-1') {
          return snapshot({ 'own-private': testRows['own-private'] });
        }

        if (child === 'createdBy' && value === 'teacher-1') {
          return snapshot({ 'own-created': testRows['own-created'] });
        }

        if (child === 'isPublic' && value === true) {
          return snapshot({ 'other-public': testRows['other-public'] });
        }
      }

      if (target.path === 'tests') {
        return snapshot(testRows);
      }

      return snapshot(null);
    });
  });

  it('fetches scoped owned and public tests for non-admin teachers instead of reading all tests', async () => {
    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getAllTests(true);

    expect(rows.map((row) => row.id).sort()).toEqual(['other-public', 'own-created', 'own-private']);
    expect(rows.map((row) => row.id)).not.toContain('other-private');
    expect(getMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'tests', constraints: undefined }));
  });

  it('marks owned legacy IELTS Reading and Listening tests ready when student-safe payloads exist', async () => {
    const ownedIeltsRows = {
      'ielts-reading-safe': {
        id: 'ielts-reading-safe',
        title: 'Owned Reading',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        isComplete: true,
        updatedAt: 4,
      },
      'ielts-listening-safe': {
        id: 'ielts-listening-safe',
        title: 'Owned Listening',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Listening',
        isComplete: true,
        updatedAt: 3,
      },
      'ielts-reading-missing': {
        id: 'ielts-reading-missing',
        title: 'Owned Reading Missing',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        isComplete: true,
        updatedAt: 2,
      },
      'ielts-writing': {
        id: 'ielts-writing',
        title: 'Owned Writing',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Writing',
        isComplete: true,
        updatedAt: 1,
      },
    };

    getMock.mockImplementation(async (target) => {
      if (target.path === 'tests' && Array.isArray(target.constraints)) {
        const child = getQueryChild(target);
        const value = getQueryValue(target);

        if (child === 'ownerId' && value === 'teacher-1') {
          return snapshot(ownedIeltsRows);
        }

        if (child === 'createdBy' && value === 'teacher-1') {
          return snapshot(null);
        }
      }

      if (
        target.path === 'student_safe_tests/ielts-reading-safe' ||
        target.path === 'student_safe_tests/ielts-listening-safe'
      ) {
        return snapshot({ id: target.path.split('/').at(-1), questions: [] });
      }

      return snapshot(null);
    });

    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getTeacherOwnedTests('teacher-1', true);

    expect(rows.find((row) => row.id === 'ielts-reading-safe')).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
      metadata: {
        deliveryProjectionReady: true,
        hasStudentSafeProjection: true,
        studentSafeProjectionReady: true,
      },
    });
    expect(rows.find((row) => row.id === 'ielts-listening-safe')).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
    });
    expect(rows.find((row) => row.id === 'ielts-reading-missing')).not.toHaveProperty('deliveryProjectionReady', true);
    expect(rows.find((row) => row.id === 'ielts-writing')).not.toHaveProperty('deliveryProjectionReady');
    expect(getMock).toHaveBeenCalledWith({ path: 'student_safe_tests/ielts-reading-safe' });
    expect(getMock).toHaveBeenCalledWith({ path: 'student_safe_tests/ielts-listening-safe' });
    expect(getMock).toHaveBeenCalledWith({ path: 'student_safe_tests/ielts-reading-missing' });
    expect(getMock).not.toHaveBeenCalledWith({ path: 'student_safe_tests/ielts-writing' });
  });

  it('marks thin owned legacy Reading and Listening rows ready when student-safe payloads exist', async () => {
    const ownedRows = {
      'reading-thin-safe': {
        id: 'reading-thin-safe',
        title: 'Thin Reading',
        ownerId: 'teacher-1',
        skill: 'Reading',
        isComplete: true,
        updatedAt: 2,
      },
      'listening-thin-safe': {
        id: 'listening-thin-safe',
        title: 'Thin Listening',
        ownerId: 'teacher-1',
        skill: 'Listening',
        isComplete: true,
        updatedAt: 1,
      },
    };

    getMock.mockImplementation(async (target) => {
      if (target.path === 'tests' && Array.isArray(target.constraints)) {
        const child = getQueryChild(target);
        const value = getQueryValue(target);

        if (child === 'ownerId' && value === 'teacher-1') {
          return snapshot(ownedRows);
        }

        if (child === 'createdBy' && value === 'teacher-1') {
          return snapshot(null);
        }
      }

      if (target.path === 'student_safe_tests/reading-thin-safe') {
        return snapshot({ id: 'reading-thin-safe', questions: [] });
      }

      if (target.path === 'student_safe_tests/listening-thin-safe') {
        return snapshot({ id: 'listening-thin-safe', audioSections: [] });
      }

      return snapshot(null);
    });

    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getTeacherOwnedTests('teacher-1', true);

    expect(rows.find((row) => row.id === 'reading-thin-safe')).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
    });
    expect(rows.find((row) => row.id === 'listening-thin-safe')).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
    });
    expect(getMock).toHaveBeenCalledWith({ path: 'student_safe_tests/reading-thin-safe' });
    expect(getMock).toHaveBeenCalledWith({ path: 'student_safe_tests/listening-thin-safe' });
  });

  it('marks owned Reading V2 full-test rows ready when their namespaced projection sections exist', async () => {
    const ownedRows = {
      'reading-v2-safe': {
        id: 'reading-v2-safe',
        materialId: 'reading-v2-safe',
        title: 'Owned Reading V2',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        publishedSnapshotVersionId: 'snapshot-safe',
        testType: 'IELTS',
        skill: 'Reading',
        updatedAt: 3,
      },
      'reading-v2-missing-projection': {
        id: 'reading-v2-missing-projection',
        materialId: 'reading-v2-missing-projection',
        title: 'Missing Projection',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        publishedSnapshotVersionId: 'snapshot-missing',
        testType: 'IELTS',
        skill: 'Reading',
        updatedAt: 2,
      },
      'reading-v2-passage': {
        id: 'reading-v2-passage',
        materialId: 'reading-v2-passage',
        title: 'Passage',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'reading-passage',
        publishedSnapshotVersionId: 'snapshot-passage',
        testType: 'IELTS',
        skill: 'Reading',
        updatedAt: 1,
      },
    };

    getMock.mockImplementation(async (target) => {
      if (target.path === 'tests' && Array.isArray(target.constraints)) {
        const child = getQueryChild(target);
        const value = getQueryValue(target);

        if (child === 'ownerId' && value === 'teacher-1') {
          return snapshot(ownedRows);
        }

        if (child === 'createdBy' && value === 'teacher-1') {
          return snapshot(null);
        }
      }

      if (target.path === 'reading_v2/projections/student_safe_tests/reading-v2-safe:snapshot-safe/content/sections') {
        return snapshot([
          { sectionId: 'passage-1' },
          { sectionId: 'passage-2' },
          { sectionId: 'passage-3' },
        ]);
      }

      return snapshot(null);
    });

    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getTeacherOwnedTests('teacher-1', true);

    expect(rows.find((row) => row.id === 'reading-v2-safe')).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
      passageRefCount: 3,
      metadata: {
        deliveryProjectionReady: true,
        hasStudentSafeProjection: true,
        studentSafeProjectionReady: true,
        passageRefCount: 3,
      },
    });
    expect(rows.find((row) => row.id === 'reading-v2-missing-projection')).not.toHaveProperty('deliveryProjectionReady', true);
    expect(rows.find((row) => row.id === 'reading-v2-passage')).not.toHaveProperty('deliveryProjectionReady', true);
    expect(getMock).toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/reading-v2-safe:snapshot-safe/content/sections',
    });
    expect(getMock).toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/reading-v2-missing-projection:snapshot-missing/content/sections',
    });
    expect(getMock).not.toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/reading-v2-passage:snapshot-passage/content/sections',
    });
  });

  it('marks owned Reading V2 full-test rows ready when projection root contains sections', async () => {
    const ownedRows = {
      'reading-v2-root-safe': {
        id: 'reading-v2-root-safe',
        materialId: 'reading-v2-root-safe',
        title: 'Root Projection Reading V2',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        publishedSnapshotVersionId: 'snapshot-root',
        skill: 'Reading',
        updatedAt: 1,
      },
    };

    getMock.mockImplementation(async (target) => {
      if (target.path === 'tests' && Array.isArray(target.constraints)) {
        const child = getQueryChild(target);
        const value = getQueryValue(target);

        if (child === 'ownerId' && value === 'teacher-1') {
          return snapshot(ownedRows);
        }

        if (child === 'createdBy' && value === 'teacher-1') {
          return snapshot(null);
        }
      }

      if (target.path === 'reading_v2/projections/student_safe_tests/reading-v2-root-safe:snapshot-root/content/sections') {
        return snapshot(null);
      }

      if (target.path === 'reading_v2/projections/student_safe_tests/reading-v2-root-safe:snapshot-root') {
        return snapshot({
          content: {
            sections: [{ sectionId: 'a' }, { sectionId: 'b' }, { sectionId: 'c' }],
          },
        });
      }

      return snapshot(null);
    });

    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getTeacherOwnedTests('teacher-1', true);

    expect(rows[0]).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
      passageRefCount: 3,
    });
    expect(getMock).toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/reading-v2-root-safe:snapshot-root/content/sections',
    });
    expect(getMock).toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/reading-v2-root-safe:snapshot-root',
    });
  });

  it('rechecks cached owned rows that do not yet expose projection readiness', async () => {
    const cachedRows = [{
      id: 'cached-reading-v2-safe',
      materialId: 'cached-reading-v2-safe',
      title: 'Cached Reading V2',
      ownerId: 'teacher-1',
      deliveryEngine: 'reading-v2',
      materialKind: 'full-test',
      publishedSnapshotVersionId: 'snapshot-cached',
      testType: 'IELTS',
      skill: 'Reading',
    }];
    const { default: dataCache } = await import('./dataCache');
    dataCache.get.mockReturnValueOnce(cachedRows);
    getMock.mockImplementation(async (target) => {
      if (target.path === 'reading_v2/projections/student_safe_tests/cached-reading-v2-safe:snapshot-cached/content/sections') {
        return snapshot({ sectionA: true, sectionB: true, sectionC: true });
      }

      return snapshot(null);
    });

    const { default: queryOptimizer } = await import('./firebaseQueryOptimizer.js');

    const rows = await queryOptimizer.getTeacherOwnedTests('teacher-1', false);

    expect(rows).toBe(cachedRows);
    expect(rows[0]).toMatchObject({
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
      passageRefCount: 3,
    });
    expect(getMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'tests' }));
    expect(getMock).toHaveBeenCalledWith({
      path: 'reading_v2/projections/student_safe_tests/cached-reading-v2-safe:snapshot-cached/content/sections',
    });
  });
});
