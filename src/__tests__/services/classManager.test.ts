/**
 * Class Manager Tests
 * Tests for class creation, enrollment, and access control
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createClass,
  getClass,
  getClasses,
  enrollStudent,
  getStudentClasses,
  addStudent,
  assignTestToClass,
  updateClassStatus,
} from '../../services/classManager';
import { database } from '../../services/firebase';
import { ref, set, get, remove } from 'firebase/database';

// Test data
const TEST_TEACHER_UID = 'teacher-test-uid-123';
const TEST_TEACHER_UID_2 = 'teacher-test-uid-456';
const TEST_STUDENT_UID = 'student-test-uid-789';
const TEST_STUDENT_UID_2 = 'student-test-uid-012';

// Cleanup helper
const cleanupTestData = async () => {
  try {
    // Clean up test classes
    const classesRef = ref(database, 'classes');
    const snapshot = await get(classesRef);
    
    if (snapshot.exists()) {
      const classes = snapshot.val();
      for (const [classCode, classData] of Object.entries(classes)) {
        if (
          classData.createdBy === TEST_TEACHER_UID ||
          classData.createdBy === TEST_TEACHER_UID_2 ||
          classData.name?.includes('Test Class')
        ) {
          await remove(ref(database, `classes/${classCode}`));
          await remove(ref(database, `game_sessions/${classCode}`));
        }
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
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

    // Enroll student in class 1 only
    await enrollStudent(class1Id, TEST_STUDENT_UID, 'Test Student', 'student@test.com');
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
