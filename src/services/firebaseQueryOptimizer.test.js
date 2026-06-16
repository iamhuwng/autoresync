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
});
