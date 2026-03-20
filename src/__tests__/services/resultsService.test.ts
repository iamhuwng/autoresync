/**
 * Results Service Tests
 * Tests for results querying, filtering, and access control
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSessionResults,
  getTeacherResults,
  getStudentHistory,
  exportResultsToCSV,
  filterResultsByDateRange,
  filterResultsByClass,
  filterResultsByTest,
} from '../../services/resultsService';
import { createSession, SessionMode } from '../../services/sessionManager';
import { database } from '../../services/firebase';
import { ref, set, get, remove } from 'firebase/database';

const {
  mockDatabaseStore,
  mockRef,
  mockGet,
  mockSet,
  mockRemove,
  mockUpdate,
  mockPush,
  resetMockDatabase,
} = vi.hoisted(() => {
  const store: Record<string, any> = {};

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const pathParts = (path?: string) => (path || '').split('/').filter(Boolean);

  const readAtPath = (path?: string) => {
    const parts = pathParts(path);
    let current: any = store;

    for (const part of parts) {
      if (current == null || typeof current !== 'object' || !(part in current)) {
        return undefined;
      }

      current = current[part];
    }

    return current;
  };

  const writeAtPath = (path: string | undefined, value: any) => {
    const parts = pathParts(path);

    if (parts.length === 0) {
      Object.keys(store).forEach(key => delete store[key]);
      if (value && typeof value === 'object') {
        Object.assign(store, clone(value));
      }
      return;
    }

    let current: any = store;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value === undefined ? null : clone(value);
  };

  const updateAtPath = (path: string | undefined, updates: Record<string, any>) => {
    const basePath = pathParts(path).join('/');

    if (!basePath) {
      for (const [key, value] of Object.entries(updates)) {
        writeAtPath(key, value);
      }
      return;
    }

    const currentValue = readAtPath(basePath);
    const merged =
      currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? { ...currentValue, ...clone(updates) }
        : clone(updates);

    writeAtPath(basePath, merged);
  };

  const snapshot = (value: any) => ({
    exists: () => value !== undefined && value !== null,
    val: () => clone(value),
    forEach: (callback: (child: { key: string; val: () => any }) => void) => {
      if (!value || typeof value !== 'object') return;
      Object.entries(value).forEach(([key, childValue]) => {
        callback({
          key,
          val: () => clone(childValue),
        });
      });
    },
  });

  return {
    mockDatabaseStore: store,
    mockRef: vi.fn((_db, path = '') => ({ __path: path })),
    mockGet: vi.fn(async (refObj) => snapshot(readAtPath(refObj?.__path))),
    mockSet: vi.fn(async (refObj, value) => {
      writeAtPath(refObj?.__path, value);
    }),
    mockRemove: vi.fn(async (refObj) => {
      writeAtPath(refObj?.__path, undefined);
    }),
    mockUpdate: vi.fn(async (refObj, updates) => {
      updateAtPath(refObj?.__path, updates);
    }),
    mockPush: vi.fn(() => ({ key: `mock-${Math.random().toString(36).slice(2, 10)}` })),
    resetMockDatabase: () => {
      Object.keys(store).forEach(key => delete store[key]);
    },
  };
});

vi.mock('../../services/firebase', () => ({
  database: mockDatabaseStore,
}));

vi.mock('firebase/database', () => ({
  ref: mockRef,
  set: mockSet,
  get: mockGet,
  remove: mockRemove,
  update: mockUpdate,
  push: mockPush,
}));

// Test data
const TEST_TEACHER_UID = 'teacher-results-test-123';
const TEST_TEACHER_UID_2 = 'teacher-results-test-456';
const TEST_STUDENT_UID = 'student-results-test-789';
const TEST_STUDENT_UID_2 = 'student-results-test-012';

// Cleanup helper
const cleanupTestData = async () => {
  try {
    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);
    
    if (snapshot.exists()) {
      const sessions = snapshot.val();
      for (const [sessionCode, sessionData] of Object.entries(sessions)) {
        if (
          sessionData.teacherId === TEST_TEACHER_UID ||
          sessionData.teacherId === TEST_TEACHER_UID_2 ||
          sessionData.createdBy === TEST_TEACHER_UID ||
          sessionData.createdBy === TEST_TEACHER_UID_2
        ) {
          await remove(ref(database, `game_sessions/${sessionCode}`));
        }
      }
    }

    await remove(ref(database, 'test_results'));
    await remove(ref(database, 'test_results_by_session'));
    await remove(ref(database, 'test_results_by_student'));
    await remove(ref(database, 'test_results_by_teacher'));
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

describe('Results Service - Teacher Access Control', () => {
  let teacherASessionCode: string;
  let teacherBSessionCode: string;

  beforeEach(async () => {
    resetMockDatabase();
    await cleanupTestData();

    // Create sessions for two different teachers
    const sessionA = await createSession({
      mode: SessionMode.QUIZ,
      settings: { allowAnonymous: true },
    });
    teacherASessionCode = sessionA.sessionCode!;

    // Set teacher ID manually
    const sessionARef = ref(database, `game_sessions/${teacherASessionCode}`);
    const sessionAData = (await get(sessionARef)).val();
    await set(sessionARef, {
      ...sessionAData,
      teacherId: TEST_TEACHER_UID,
      testTitle: 'Teacher A Quiz',
    });

    const sessionB = await createSession({
      mode: SessionMode.TEST,
      settings: { allowAnonymous: true },
    });
    teacherBSessionCode = sessionB.sessionCode!;

    const sessionBRef = ref(database, `game_sessions/${teacherBSessionCode}`);
    const sessionBData = (await get(sessionBRef)).val();
    await set(sessionBRef, {
      ...sessionBData,
      teacherId: TEST_TEACHER_UID_2,
      testTitle: 'Teacher B Test',
    });

    // Add some student results
    await set(ref(database, `game_sessions/${teacherASessionCode}/players/player1`), {
      name: 'Student 1',
      score: 80,
      percentage: 80,
      totalQuestions: 10,
      correctAnswers: 8,
      completedAt: Date.now(),
    });

    await set(ref(database, `game_sessions/${teacherBSessionCode}/players/player2`), {
      name: 'Student 2',
      score: 90,
      percentage: 90,
      totalQuestions: 10,
      correctAnswers: 9,
      completedAt: Date.now(),
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should only return results for sessions created by specific teacher', async () => {
    const teacherAResults = await getTeacherResults(TEST_TEACHER_UID);
    const teacherBResults = await getTeacherResults(TEST_TEACHER_UID_2);

    expect(teacherAResults.length).toBeGreaterThanOrEqual(1);
    expect(teacherBResults.length).toBeGreaterThanOrEqual(1);

    // Teacher A should only see their sessions
    const teacherASessionCodes = teacherAResults.map(r => r.sessionCode);
    expect(teacherASessionCodes).toContain(teacherASessionCode);
    expect(teacherASessionCodes).not.toContain(teacherBSessionCode);

    // Teacher B should only see their sessions
    const teacherBSessionCodes = teacherBResults.map(r => r.sessionCode);
    expect(teacherBSessionCodes).toContain(teacherBSessionCode);
    expect(teacherBSessionCodes).not.toContain(teacherASessionCode);
  });

  it('should return empty array for teacher with no sessions', async () => {
    const results = await getTeacherResults('non-existent-teacher');
    expect(results).toEqual([]);
  });

  it('should include correct session statistics', async () => {
    const results = await getTeacherResults(TEST_TEACHER_UID);
    const session = results.find(r => r.sessionCode === teacherASessionCode);

    expect(session).toBeDefined();
    expect(session?.totalStudents).toBe(1);
    expect(session?.averageScore).toBe(80);
    expect(session?.averagePercentage).toBe(80);
    expect(session?.highestScore).toBe(80);
    expect(session?.lowestScore).toBe(80);
  });
});

describe('Results Service - Student Access Control', () => {
  let sessionCode: string;

  beforeEach(async () => {
    resetMockDatabase();
    await cleanupTestData();

    // Create a session
    const session = await createSession({
      mode: SessionMode.QUIZ,
      settings: { allowAnonymous: true },
    });
    sessionCode = session.sessionCode!;

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();
    await set(sessionRef, {
      ...sessionData,
      teacherId: TEST_TEACHER_UID,
      testTitle: 'Test Quiz',
    });

    // Add results for two students
    await set(ref(database, `game_sessions/${sessionCode}/players/player1`), {
      name: 'Student 1',
      uid: TEST_STUDENT_UID,
      score: 85,
      percentage: 85,
      totalQuestions: 10,
      correctAnswers: 8.5,
      completedAt: Date.now(),
    });

    await set(ref(database, `game_sessions/${sessionCode}/players/player2`), {
      name: 'Student 2',
      uid: TEST_STUDENT_UID_2,
      score: 75,
      percentage: 75,
      totalQuestions: 10,
      correctAnswers: 7.5,
      completedAt: Date.now(),
    });

    const student1SubmittedAt = Date.now();
    const student2SubmittedAt = student1SubmittedAt + 1;

    await set(ref(database, `test_results/result-1`), {
      resultId: 'result-1',
      sessionCode,
      testId: 'test-quiz-1',
      studentId: TEST_STUDENT_UID,
      studentName: 'Student 1',
      totalScore: 85,
      maxScore: 100,
      percentage: 85,
      bandScore: 6.5,
      questionResults: [],
      correct: 8,
      incorrect: 2,
      partialCredit: 0,
      totalQuestions: 10,
      submittedAt: student1SubmittedAt,
      timeElapsed: 0,
      testDuration: 0,
      createdAt: student1SubmittedAt,
      testTitle: 'Test Quiz',
      testType: 'quiz',
      testSkill: 'reading',
      isGuest: false,
    });

    await set(ref(database, `test_results_by_student/${TEST_STUDENT_UID}/result-1`), {
      resultId: 'result-1',
      sessionCode,
      testId: 'test-quiz-1',
      percentage: 85,
      submittedAt: student1SubmittedAt,
    });

    await set(ref(database, `test_results_by_session/${sessionCode}/result-1`), {
      resultId: 'result-1',
      studentId: TEST_STUDENT_UID,
      studentName: 'Student 1',
      percentage: 85,
      submittedAt: student1SubmittedAt,
    });

    await set(ref(database, `test_results/result-2`), {
      resultId: 'result-2',
      sessionCode,
      testId: 'test-quiz-1',
      studentId: TEST_STUDENT_UID_2,
      studentName: 'Student 2',
      totalScore: 75,
      maxScore: 100,
      percentage: 75,
      bandScore: 6,
      questionResults: [],
      correct: 7.5,
      incorrect: 2.5,
      partialCredit: 0,
      totalQuestions: 10,
      submittedAt: student2SubmittedAt,
      timeElapsed: 0,
      testDuration: 0,
      createdAt: student2SubmittedAt,
      testTitle: 'Test Quiz',
      testType: 'quiz',
      testSkill: 'reading',
      isGuest: false,
    });

    await set(ref(database, `test_results_by_student/${TEST_STUDENT_UID_2}/result-2`), {
      resultId: 'result-2',
      sessionCode,
      testId: 'test-quiz-1',
      percentage: 75,
      submittedAt: student2SubmittedAt,
    });

    await set(ref(database, `test_results_by_session/${sessionCode}/result-2`), {
      resultId: 'result-2',
      studentId: TEST_STUDENT_UID_2,
      studentName: 'Student 2',
      percentage: 75,
      submittedAt: student2SubmittedAt,
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should only return history for specific student', async () => {
    const student1History = await getStudentHistory(TEST_STUDENT_UID);
    const student2History = await getStudentHistory(TEST_STUDENT_UID_2);

    expect(student1History.length).toBeGreaterThanOrEqual(1);
    expect(student2History.length).toBeGreaterThanOrEqual(1);

    // Student 1 should only see their own results
    expect(student1History[0].userId).toBe(TEST_STUDENT_UID);
    expect(student1History[0].percentage).toBe(85);

    // Student 2 should only see their own results
    expect(student2History[0].userId).toBe(TEST_STUDENT_UID_2);
    expect(student2History[0].percentage).toBe(75);
  });

  it('should return empty array for student with no history', async () => {
    const history = await getStudentHistory('non-existent-student');
    expect(history).toEqual([]);
  });

  it('should not include guest results in student history', async () => {
    // Add a guest player
    await set(ref(database, `game_sessions/${sessionCode}/players/guest1`), {
      name: 'Guest Player',
      isGuest: true,
      score: 95,
      percentage: 95,
      totalQuestions: 10,
      correctAnswers: 9.5,
      completedAt: Date.now(),
    });

    const student1History = await getStudentHistory(TEST_STUDENT_UID);

    // Should not include guest results
    expect(student1History.every(r => r.userId === TEST_STUDENT_UID)).toBe(true);
  });
});

describe('Results Service - CSV Export', () => {
  beforeEach(async () => {
    resetMockDatabase();
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should export results to CSV with correct format', () => {
    const mockResults = [
      {
        studentId: 'student1',
        studentName: 'John Doe',
        studentEmail: 'john@example.com',
        sessionCode: 'ABC123',
        sessionMode: 'quiz' as const,
        testTitle: 'Math Quiz',
        score: 85,
        percentage: 85,
        totalQuestions: 10,
        correctAnswers: 8.5,
        completedAt: new Date('2024-01-15').getTime(),
        timeSpent: 300000,
        className: 'Math 101',
        isGuest: false,
        userId: 'user123',
      },
    ];

    const csv = exportResultsToCSV(mockResults);

    // Check headers
    expect(csv).toContain('Student Name');
    expect(csv).toContain('Student Email');
    expect(csv).toContain('Session Code');
    expect(csv).toContain('Test Title');
    expect(csv).toContain('Score');
    expect(csv).toContain('Percentage');

    // Check data
    expect(csv).toContain('John Doe');
    expect(csv).toContain('john@example.com');
    expect(csv).toContain('ABC123');
    expect(csv).toContain('Math Quiz');
    expect(csv).toContain('85');
    expect(csv).toContain('85.00%');
  });

  it('should handle empty results array', () => {
    const csv = exportResultsToCSV([]);
    expect(csv).toBe('');
  });

  it('should handle missing optional fields', () => {
    const mockResults = [
      {
        studentId: 'student1',
        studentName: 'Jane Doe',
        sessionCode: 'XYZ789',
        sessionMode: 'test' as const,
        score: 90,
        percentage: 90,
        totalQuestions: 10,
        correctAnswers: 9,
        completedAt: Date.now(),
        isGuest: true,
      },
    ];

    const csv = exportResultsToCSV(mockResults);

    expect(csv).toContain('Jane Doe');
    expect(csv).toContain('XYZ789');
    expect(csv).toContain('Yes'); // isGuest
  });
});

describe('Results Service - Filtering', () => {
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  const lastWeek = now - 7 * 24 * 60 * 60 * 1000;

  const mockResults = [
    {
      studentId: 's1',
      studentName: 'Student 1',
      sessionCode: 'ABC123',
      sessionMode: 'quiz' as const,
      testId: 'test1',
      classId: 'class1',
      score: 80,
      percentage: 80,
      totalQuestions: 10,
      correctAnswers: 8,
      completedAt: now,
      isGuest: false,
    },
    {
      studentId: 's2',
      studentName: 'Student 2',
      sessionCode: 'DEF456',
      sessionMode: 'test' as const,
      testId: 'test2',
      classId: 'class2',
      score: 90,
      percentage: 90,
      totalQuestions: 10,
      correctAnswers: 9,
      completedAt: yesterday,
      isGuest: false,
    },
    {
      studentId: 's3',
      studentName: 'Student 3',
      sessionCode: 'GHI789',
      sessionMode: 'quiz' as const,
      testId: 'test1',
      classId: 'class1',
      score: 70,
      percentage: 70,
      totalQuestions: 10,
      correctAnswers: 7,
      completedAt: lastWeek,
      isGuest: false,
    },
  ];

  it('should filter results by date range', () => {
    const startDate = new Date(yesterday - 1000);
    const endDate = new Date(now + 1000);

    const filtered = filterResultsByDateRange(mockResults, startDate, endDate);

    expect(filtered.length).toBe(2);
    expect(filtered.every(r => r.completedAt >= startDate.getTime())).toBe(true);
    expect(filtered.every(r => r.completedAt <= endDate.getTime())).toBe(true);
  });

  it('should filter results by class', () => {
    const filtered = filterResultsByClass(mockResults, 'class1');

    expect(filtered.length).toBe(2);
    expect(filtered.every(r => r.classId === 'class1')).toBe(true);
  });

  it('should filter results by test', () => {
    const filtered = filterResultsByTest(mockResults, 'test1');

    expect(filtered.length).toBe(2);
    expect(filtered.every(r => r.testId === 'test1')).toBe(true);
  });

  it('should handle empty results when filtering', () => {
    const filtered = filterResultsByClass([], 'class1');
    expect(filtered).toEqual([]);
  });

  it('should return empty array when no results match filter', () => {
    const filtered = filterResultsByClass(mockResults, 'non-existent-class');
    expect(filtered).toEqual([]);
  });
});

describe('Results Service - Session Results', () => {
  let sessionCode: string;

  beforeEach(async () => {
    resetMockDatabase();
    await cleanupTestData();

    const session = await createSession({
      mode: SessionMode.QUIZ,
      settings: { allowAnonymous: true },
    });
    sessionCode = session.sessionCode!;

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();
    await set(sessionRef, {
      ...sessionData,
      teacherId: TEST_TEACHER_UID,
      testTitle: 'Test Quiz',
      createdAt: Date.now(),
    });

    // Add multiple student results
    await set(ref(database, `game_sessions/${sessionCode}/players/player1`), {
      name: 'Student A',
      score: 100,
      percentage: 100,
      totalQuestions: 10,
      correctAnswers: 10,
      completedAt: Date.now(),
    });

    await set(ref(database, `game_sessions/${sessionCode}/players/player2`), {
      name: 'Student B',
      score: 60,
      percentage: 60,
      totalQuestions: 10,
      correctAnswers: 6,
      completedAt: Date.now(),
    });

    await set(ref(database, `game_sessions/${sessionCode}/players/player3`), {
      name: 'Student C',
      score: 80,
      percentage: 80,
      totalQuestions: 10,
      correctAnswers: 8,
      completedAt: Date.now(),
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should calculate correct statistics for session', async () => {
    const results = await getSessionResults(sessionCode);

    expect(results).toBeDefined();
    expect(results?.totalStudents).toBe(3);
    expect(results?.averageScore).toBe(80); // (100 + 60 + 80) / 3
    expect(results?.averagePercentage).toBe(80);
    expect(results?.highestScore).toBe(100);
    expect(results?.lowestScore).toBe(60);
  });

  it('should return null for non-existent session', async () => {
    const results = await getSessionResults('INVALID-CODE');
    expect(results).toBeNull();
  });

  it('should include all student results', async () => {
    const results = await getSessionResults(sessionCode);

    expect(results?.results.length).toBe(3);
    expect(results?.results.map(r => r.studentName)).toContain('Student A');
    expect(results?.results.map(r => r.studentName)).toContain('Student B');
    expect(results?.results.map(r => r.studentName)).toContain('Student C');
  });
});
