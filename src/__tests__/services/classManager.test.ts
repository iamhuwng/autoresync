/**
 * Class Manager Tests
 * Tests for class creation, enrollment, and access control
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockDbStore: Record<string, unknown> = {};

const deepClone = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizePath = (path: string): string => path.replace(/^\/+|\/+$/g, '');

const splitPath = (path: string): string[] => normalizePath(path).split('/').filter(Boolean);

const clearMockDb = (): void => {
  Object.keys(mockDbStore).forEach((key) => {
    delete (mockDbStore as Record<string, unknown>)[key];
  });
};

const getValueAtPath = (path: string): unknown => {
  const parts = splitPath(path);
  if (parts.length === 0) {
    return deepClone(mockDbStore);
  }

  let cursor: unknown = mockDbStore;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in (cursor as Record<string, unknown>))) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return deepClone(cursor);
};

const setValueAtPath = (path: string, value: unknown): void => {
  const parts = splitPath(path);

  if (parts.length === 0) {
    clearMockDb();
    if (value && typeof value === 'object') {
      Object.assign(mockDbStore, deepClone(value as Record<string, unknown>));
    }
    return;
  }

  let cursor: Record<string, unknown> = mockDbStore;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[parts[parts.length - 1]] = deepClone(value);
};

const removeValueAtPath = (path: string): void => {
  const parts = splitPath(path);
  if (parts.length === 0) {
    clearMockDb();
    return;
  }

  let cursor: Record<string, unknown> = mockDbStore;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      return;
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  delete cursor[parts[parts.length - 1]];
};

const createSnapshot = (value: unknown) => ({
  exists: () => value !== undefined && value !== null,
  val: () => deepClone(value),
});

const applyQueryFilters = (data: unknown, constraints: Array<{ type: string; [key: string]: unknown }>): unknown => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  let entries = Object.entries(data as Record<string, unknown>);
  const orderByConstraint = constraints.find((c) => c.type === 'orderByChild');
  const equalToConstraint = constraints.find((c) => c.type === 'equalTo');

  if (orderByConstraint && equalToConstraint) {
    const child = orderByConstraint.child as string;
    const expected = equalToConstraint.value;
    entries = entries.filter(([, value]) => {
      if (!value || typeof value !== 'object') return false;
      return (value as Record<string, unknown>)[child] === expected;
    });
  }

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
};

vi.mock('../../services/firebase', () => ({
  database: {},
  auth: { currentUser: { uid: 'teacher-test-uid-123' } },
}));

vi.mock('firebase/database', () => {
  const ref = vi.fn((_db: unknown, path = '') => ({ path: normalizePath(path) }));
  let pushCounter = 0;
  const push = vi.fn((_target: { path: string }) => {
    pushCounter += 1;
    return { key: `mock-push-${pushCounter}` };
  });
  const query = vi.fn((target: { path: string }, ...constraints: Array<{ type: string; [key: string]: unknown }>) => ({
    path: target.path,
    constraints,
  }));
  const orderByChild = vi.fn((child: string) => ({ type: 'orderByChild', child }));
  const equalTo = vi.fn((value: unknown) => ({ type: 'equalTo', value }));

  const set = vi.fn(async (target: { path: string }, value: unknown) => {
    setValueAtPath(target.path, value);
  });

  const get = vi.fn(async (target: { path: string; constraints?: Array<{ type: string; [key: string]: unknown }> }) => {
    if (Array.isArray(target.constraints)) {
      const data = getValueAtPath(target.path);
      return createSnapshot(applyQueryFilters(data, target.constraints));
    }
    return createSnapshot(getValueAtPath(target.path));
  });

  const remove = vi.fn(async (target: { path: string }) => {
    removeValueAtPath(target.path);
  });
  const serverTimestamp = vi.fn(() => ({ '.sv': 'timestamp' }));

  const update = vi.fn(async (target: { path: string }, updates: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(updates)) {
      const fullPath = [target.path, normalizePath(key)].filter(Boolean).join('/');
      if (value === null) {
        removeValueAtPath(fullPath);
      } else {
        setValueAtPath(fullPath, value);
      }
    }
  });

  const onValue = vi.fn();
  const off = vi.fn();

  return {
    ref,
    push,
    set,
    get,
    update,
    query,
    orderByChild,
    equalTo,
    remove,
    serverTimestamp,
    onValue,
    off,
  };
});

import {
  createClass,
  getClass,
  getClasses,
  enrollStudent,
  getStudentClasses,
  addStudent,
  assignTestToClass,
  removeStudentFromClass,
  approveClassStudent,
  rejectClassStudent,
  deleteClass,
  updateClassStatus,
} from '../../services/classManager';
import { database } from '../../services/firebase';
import { ref, set, get } from 'firebase/database';

// Test data
const TEST_TEACHER_UID = 'teacher-test-uid-123';
const TEST_TEACHER_UID_2 = 'teacher-test-uid-456';
const TEST_STUDENT_UID = 'student-test-uid-789';
const TEST_STUDENT_UID_2 = 'student-test-uid-012';

// Cleanup helper
const cleanupTestData = async () => {
  clearMockDb();
};

describe('Class Manager - Class Creation', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should create a class with teacher UID as ownerId', async () => {
    const result = await createClass(
      {
        name: 'Test Class - Math 101',
        description: 'Test description',
      },
      TEST_TEACHER_UID
    );

    expect(result.success).toBe(true);
    expect(result.classId).toBeDefined();
    expect(result.classCode).toBeDefined();

    // Verify the class was created with correct ownerId
    const classData = await getClass(result.classId!);
    expect(classData).toBeDefined();
    expect(classData?.createdBy).toBe(TEST_TEACHER_UID);
    expect(classData?.name).toBe('Test Class - Math 101');
    expect(classData?.status).toBe('active');
  });

  it('should generate unique class codes', async () => {
    const result1 = await createClass(
      { name: 'Test Class 1' },
      TEST_TEACHER_UID
    );
    const result2 = await createClass(
      { name: 'Test Class 2' },
      TEST_TEACHER_UID
    );

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.classCode).not.toBe(result2.classCode);
  });

  it('should initialize class with default settings', async () => {
    const result = await createClass(
      { name: 'Test Class - Defaults' },
      TEST_TEACHER_UID
    );

    const classData = await getClass(result.classId!);
    expect(classData?.settings).toBeDefined();
    expect(classData?.settings.allowLateJoin).toBe(true);
    expect(classData?.settings.requireEmail).toBe(false);
    expect(classData?.settings.maxStudents).toBe(100);
    expect(classData?.stats.totalStudents).toBe(0);
    expect(classData?.stats.totalAssignments).toBe(0);
  });

  it('should create class with custom settings', async () => {
    const result = await createClass(
      {
        name: 'Test Class - Custom',
        settings: {
          allowLateJoin: false,
          requireEmail: true,
          allowSelfStudy: true,
          maxStudents: 50,
        },
      },
      TEST_TEACHER_UID
    );

    const classData = await getClass(result.classId!);
    expect(classData?.settings.allowLateJoin).toBe(false);
    expect(classData?.settings.requireEmail).toBe(true);
    expect(classData?.settings.allowSelfStudy).toBe(true);
    expect(classData?.settings.maxStudents).toBe(50);
  });
});

describe('Class Manager - Remove Student', () => {
  let testClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    const result = await createClass(
      { name: 'Test Class - Remove Student' },
      TEST_TEACHER_UID
    );
    testClassId = result.classId!;

    await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    await set(ref(database, 'course_enrollments/enrollment-remove'), {
      id: 'enrollment-remove',
      studentId: TEST_STUDENT_UID,
      courseId: 'course-1',
      sourceClassId: testClassId,
      status: 'active',
    });

    await set(ref(database, 'course_enrollments/enrollment-keep'), {
      id: 'enrollment-keep',
      studentId: TEST_STUDENT_UID,
      courseId: 'course-2',
      sourceClassId: 'other-class',
      status: 'active',
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should remove student from class, legacy session, and matching class-based enrollments', async () => {
    const result = await removeStudentFromClass(testClassId, TEST_STUDENT_UID);
    expect(result.success).toBe(true);

    const classData = await getClass(testClassId);
    expect(classData?.students[TEST_STUDENT_UID]).toBeUndefined();

    const legacyPlayerSnapshot = await get(ref(database, `game_sessions/${testClassId}/players/${TEST_STUDENT_UID}`));
    expect(legacyPlayerSnapshot.exists()).toBe(false);

    const enrollments = (await get(ref(database, 'course_enrollments'))).val() as Record<string, unknown>;
    expect(enrollments?.['enrollment-remove']).toBeUndefined();
    expect(enrollments?.['enrollment-keep']).toBeDefined();
  });

  it('should return an error when student does not exist in class', async () => {
    const result = await removeStudentFromClass(testClassId, 'missing-student-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Student not found');
  });
});

describe('Class Manager - Teacher Access Control', () => {
  let teacherAClassId: string;
  let teacherBClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    // Create classes for two different teachers
    const resultA = await createClass(
      { name: 'Test Class - Teacher A' },
      TEST_TEACHER_UID
    );
    const resultB = await createClass(
      { name: 'Test Class - Teacher B' },
      TEST_TEACHER_UID_2
    );

    teacherAClassId = resultA.classId!;
    teacherBClassId = resultB.classId!;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should only return classes created by specific teacher', async () => {
    const teacherAClasses = await getClasses(TEST_TEACHER_UID);
    const teacherBClasses = await getClasses(TEST_TEACHER_UID_2);

    expect(teacherAClasses.length).toBeGreaterThanOrEqual(1);
    expect(teacherBClasses.length).toBeGreaterThanOrEqual(1);

    // Teacher A should only see their own classes
    const teacherAClassIds = teacherAClasses.map(c => c.id);
    expect(teacherAClassIds).toContain(teacherAClassId);
    expect(teacherAClassIds).not.toContain(teacherBClassId);

    // Teacher B should only see their own classes
    const teacherBClassIds = teacherBClasses.map(c => c.id);
    expect(teacherBClassIds).toContain(teacherBClassId);
    expect(teacherBClassIds).not.toContain(teacherAClassId);
  });

  it('does not emit trace logs when loading teacher classes', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await getClasses(TEST_TEACHER_UID);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should verify teacher can only manage their own classes', async () => {
    const classA = await getClass(teacherAClassId);
    const classB = await getClass(teacherBClassId);

    expect(classA?.createdBy).toBe(TEST_TEACHER_UID);
    expect(classB?.createdBy).toBe(TEST_TEACHER_UID_2);
    expect(classA?.createdBy).not.toBe(classB?.createdBy);
  });
});

describe('Class Manager - Student Enrollment', () => {
  let testClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    const result = await createClass(
      { name: 'Test Class - Enrollment' },
      TEST_TEACHER_UID
    );
    testClassId = result.classId!;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should enroll authenticated student in class', async () => {
    const result = await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    expect(result.success).toBe(true);
    expect(result.classId).toBe(testClassId);

    // Verify student was added to class
    const classData = await getClass(testClassId);
    expect(classData?.students[TEST_STUDENT_UID]).toBeDefined();
    expect(classData?.students[TEST_STUDENT_UID].uid).toBe(TEST_STUDENT_UID);
    expect(classData?.students[TEST_STUDENT_UID].name).toBe('Test Student');
    expect(classData?.students[TEST_STUDENT_UID].email).toBe('student@test.com');
  });

  it('should prevent duplicate enrollment', async () => {
    // Enroll once
    await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    // Try to enroll again
    const result = await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Already enrolled');
  });

  it('should fail enrollment for non-existent class', async () => {
    const result = await enrollStudent(
      'INVALID-CODE',
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail enrollment for archived class', async () => {
    // Archive the class
    await updateClassStatus(testClassId, 'archived');

    const result = await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });

  it('should enforce max students limit', async () => {
    // Create class with max 2 students
    const result = await createClass(
      {
        name: 'Test Class - Limited',
        settings: { maxStudents: 2 },
      },
      TEST_TEACHER_UID
    );
    const limitedClassId = result.classId!;

    // Enroll 2 students successfully
    await enrollStudent(limitedClassId, TEST_STUDENT_UID, 'Student 1', 'student1@test.com');
    await enrollStudent(limitedClassId, TEST_STUDENT_UID_2, 'Student 2', 'student2@test.com');

    // Try to enroll 3rd student
    const thirdResult = await enrollStudent(
      limitedClassId,
      'student-3',
      'Student 3',
      'student3@test.com'
    );

    expect(thirdResult.success).toBe(false);
    expect(thirdResult.error).toContain('full');
  });

  it('should update class stats after enrollment', async () => {
    const beforeData = await getClass(testClassId);
    const beforeCount = beforeData?.stats.totalStudents || 0;

    await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Test Student',
      'student@test.com'
    );

    const afterData = await getClass(testClassId);
    expect(afterData?.stats.totalStudents).toBe(beforeCount + 1);
    expect(afterData?.stats.activeStudents).toBe(beforeCount + 1);
  });
});

describe('Class Manager - Student Access Control', () => {
  let class1Id: string;
  let class2Id: string;

  beforeEach(async () => {
    await cleanupTestData();

    // Create two classes
    const result1 = await createClass(
      { name: 'Test Class 1' },
      TEST_TEACHER_UID
    );
    const result2 = await createClass(
      { name: 'Test Class 2' },
      TEST_TEACHER_UID
    );

    class1Id = result1.classId!;
    class2Id = result2.classId!;

    // Approve enrollment in class 1 only
    await enrollStudent(class1Id, TEST_STUDENT_UID, 'Test Student', 'student@test.com');
    await approveClassStudent(class1Id, TEST_STUDENT_UID, TEST_TEACHER_UID);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should return only classes student is enrolled in', async () => {
    const studentClasses = await getStudentClasses(TEST_STUDENT_UID);

    expect(studentClasses.length).toBeGreaterThanOrEqual(1);
    
    const classIds = studentClasses.map(c => c.id);
    expect(classIds).toContain(class1Id);
    expect(classIds).not.toContain(class2Id);
  });

  it('should return empty array for student with no enrollments', async () => {
    const studentClasses = await getStudentClasses('non-enrolled-student');
    expect(studentClasses).toEqual([]);
  });

  it('should merge student_classes projection with legacy class scans when the projection is incomplete', async () => {
    vi.mocked(get).mockClear();

    await enrollStudent(class2Id, TEST_STUDENT_UID, 'Test Student', 'student@test.com');
    await approveClassStudent(class2Id, TEST_STUDENT_UID, TEST_TEACHER_UID);
    await set(ref(database, `student_classes/${TEST_STUDENT_UID}`), {
      [class1Id]: {
        joinedAt: Date.now(),
        status: 'active',
      },
    });

    const studentClasses = await getStudentClasses(TEST_STUDENT_UID);

    expect(studentClasses.map((cls) => cls.id)).toContain(class1Id);
    expect(studentClasses.map((cls) => cls.id)).toContain(class2Id);
  });

  it('should verify student can only access enrolled classes', async () => {
    const class1Data = await getClass(class1Id);
    const class2Data = await getClass(class2Id);

    // Student should be in class 1
    expect(class1Data?.students[TEST_STUDENT_UID]).toBeDefined();

    // Student should NOT be in class 2
    expect(class2Data?.students[TEST_STUDENT_UID]).toBeUndefined();
  });
});

describe('Class Manager - Guest Students', () => {
  let testClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    const result = await createClass(
      { name: 'Test Class - Guests' },
      TEST_TEACHER_UID
    );
    testClassId = result.classId!;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should add guest student without UID', async () => {
    const result = await addStudent(
      testClassId,
      'Guest Student',
      'guest@test.com'
    );

    expect(result.success).toBe(true);
    expect(result.studentId).toBeDefined();

    // Verify guest was added
    const classData = await getClass(testClassId);
    const guestStudent = classData?.students[result.studentId!];
    expect(guestStudent).toBeDefined();
    expect(guestStudent?.name).toBe('Guest Student');
    expect(guestStudent?.uid).toBeUndefined(); // Guests don't have UID
  });

  it('should distinguish between authenticated and guest students', async () => {
    // Add authenticated student
    await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Auth Student',
      'auth@test.com'
    );

    // Add guest student
    const guestResult = await addStudent(
      testClassId,
      'Guest Student'
    );

    const classData = await getClass(testClassId);
    
    // Authenticated student should have UID
    expect(classData?.students[TEST_STUDENT_UID].uid).toBe(TEST_STUDENT_UID);
    
    // Guest student should NOT have UID
    expect(classData?.students[guestResult.studentId!].uid).toBeUndefined();
  });

  it('should write student class projection for authenticated enrollments', async () => {
    await enrollStudent(
      testClassId,
      TEST_STUDENT_UID,
      'Auth Student',
      'auth@test.com'
    );

    const projectionSnapshot = await get(ref(database, `student_classes/${TEST_STUDENT_UID}/${testClassId}`));
    expect(projectionSnapshot.exists()).toBe(true);
    expect(projectionSnapshot.val()).toMatchObject({
      status: 'pending_approval',
    });
  });
});

describe('Class Manager - Student Membership Projection', () => {
  let testClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    const result = await createClass(
      { name: 'Projected Class' },
      TEST_TEACHER_UID
    );
    testClassId = result.classId!;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should promote projection status when a student is approved', async () => {
    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');

    const result = await approveClassStudent(testClassId, TEST_STUDENT_UID, TEST_TEACHER_UID);

    expect(result.success).toBe(true);
    const projectionSnapshot = await get(ref(database, `student_classes/${TEST_STUDENT_UID}/${testClassId}`));
    expect(projectionSnapshot.val()).toMatchObject({
      status: 'active',
    });
  });

  it('should keep pending self-joins out of student-visible class lists', async () => {
    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');

    const studentClasses = await getStudentClasses(TEST_STUDENT_UID);

    expect(studentClasses).toEqual([]);
  });

  it('should defer class-linked course auto-enrollment until approval', async () => {
    await set(ref(database, 'class_course_links/link-1'), {
      id: 'link-1',
      classId: testClassId,
      courseId: 'course-1',
      linkedAt: Date.now(),
      expiresAt: 0,
      isAutoEnroll: true,
    });

    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');

    expect((await get(ref(database, 'course_enrollments'))).exists()).toBe(false);

    const approved = await approveClassStudent(testClassId, TEST_STUDENT_UID, TEST_TEACHER_UID);
    expect(approved.success).toBe(true);

    const enrollments = (await get(ref(database, 'course_enrollments'))).val() as Record<string, Record<string, unknown>>;
    expect(Object.values(enrollments)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: TEST_STUDENT_UID,
          courseId: 'course-1',
          sourceClassId: testClassId,
          status: 'active',
        }),
      ]),
    );
  });

  it('should clean up stale class-based enrollments when a pending student is rejected', async () => {
    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');
    await set(ref(database, 'course_enrollments/enrollment-pending'), {
      id: 'enrollment-pending',
      studentId: TEST_STUDENT_UID,
      courseId: 'course-1',
      sourceClassId: testClassId,
      status: 'active',
    });

    const rejected = await rejectClassStudent(testClassId, TEST_STUDENT_UID);
    expect(rejected.success).toBe(true);

    expect((await get(ref(database, `student_classes/${TEST_STUDENT_UID}/${testClassId}`))).exists()).toBe(false);
    expect((await get(ref(database, 'course_enrollments/enrollment-pending'))).exists()).toBe(false);
  });

  it('should remove student projection when a student is removed from class', async () => {
    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');

    const result = await removeStudentFromClass(testClassId, TEST_STUDENT_UID);

    expect(result.success).toBe(true);
    const projectionSnapshot = await get(ref(database, `student_classes/${TEST_STUDENT_UID}/${testClassId}`));
    expect(projectionSnapshot.exists()).toBe(false);
  });

  it('should remove student projections when a class is deleted', async () => {
    await enrollStudent(testClassId, TEST_STUDENT_UID, 'Projected Student', 'student@test.com');
    await enrollStudent(testClassId, TEST_STUDENT_UID_2, 'Projected Student 2', 'student2@test.com');

    const deleted = await deleteClass(testClassId);

    expect(deleted).toBe(true);
    expect((await get(ref(database, `student_classes/${TEST_STUDENT_UID}/${testClassId}`))).exists()).toBe(false);
    expect((await get(ref(database, `student_classes/${TEST_STUDENT_UID_2}/${testClassId}`))).exists()).toBe(false);
  });
});

describe('Class Manager - Assignment Integration', () => {
  let testClassId: string;

  beforeEach(async () => {
    await cleanupTestData();

    const result = await createClass(
      { name: 'Test Class - Assignments' },
      TEST_TEACHER_UID
    );
    testClassId = result.classId!;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should assign test to class and update stats', async () => {
    const result = await assignTestToClass({
      classId: testClassId,
      testId: 'test-123',
      testType: 'test',
      testTitle: 'Math Test 1',
      maxAttempts: 2,
      showAnswers: true,
      showScores: true,
    });

    expect(result.success).toBe(true);
    expect(result.assignmentId).toBeDefined();

    // Verify assignment was added
    const classData = await getClass(testClassId);
    expect(classData?.assignments[result.assignmentId!]).toBeDefined();
    expect(classData?.assignments[result.assignmentId!].testTitle).toBe('Math Test 1');
    expect(classData?.stats.totalAssignments).toBe(1);
  });

  it('should track assignment in class summary', async () => {
    // Assign a test
    await assignTestToClass({
      classId: testClassId,
      testId: 'test-123',
      testType: 'test',
      testTitle: 'Math Test 1',
    });

    const classes = await getClasses(TEST_TEACHER_UID);
    const testClass = classes.find(c => c.id === testClassId);

    expect(testClass).toBeDefined();
    expect(testClass?.activeAssignments).toBeGreaterThanOrEqual(1);
  });
});
