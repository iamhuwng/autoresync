/**
 * Results Service
 * Service for querying and aggregating student test/quiz results
 */

import { ref, get, onValue } from 'firebase/database';
import { database } from './firebase';
import {
  getSessionResults as getPermanentSessionResults,
  getTeacherResults as getCanonicalTeacherResults,
  TestResultRecord,
} from './testResults.service';
import type { ResultContext, ResultContextType } from '../types/solo.types';
import { classifyTeacherResultVisibility } from './resultVisibility.service';

export interface StudentResult {
  id?: string; // Original resultId from test_results
  studentId: string;
  studentName: string;
  studentEmail?: string;
  sessionCode: string;
  sessionMode: 'quiz' | 'test';
  testId?: string;
  quizId?: string;
  testTitle?: string;
  score: number;
  percentage: number;
  totalQuestions: number;
  correctAnswers: number;
  completedAt: number;
  timeSpent?: number;
  classId?: string;
  className?: string;
  isGuest: boolean;
  userId?: string;
  // New fields for enhanced reporting
  bandScore?: number;
  testSkill?: string;
  teacherId?: string;
  timeElapsed?: number; // In milliseconds, specific to test duration
  reMarkHistory?: number; // Count of remarks
  // Phase 6: Course context
  courseId?: string;
  courseName?: string; // Stored as string to preserve even if course deleted
  moduleId?: string;
  // PRD-0016: Result context (class_session, homework, self_study, course_material)
  context?: ResultContext;
  visibility?: TestResultRecord['visibility'];
  sourceMaterialRemoved?: boolean;
}


export interface SessionResults {
  sessionCode: string;
  sessionMode: 'quiz' | 'test';
  testTitle?: string;
  createdAt: number;
  completedAt?: number;
  totalStudents: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  lowestScore: number;
  results: StudentResult[];
}

export interface ClassResults {
  classId: string;
  className: string;
  totalStudents: number;
  totalAssignments: number;
  averageCompletion: number;
  averageScore: number;
  students: {
    [studentId: string]: {
      name: string;
      email?: string;
      completedAssignments: number;
      averageScore: number;
      lastActivity: number;
    };
  };
}

function resolveSessionMode(
  sessionData?: { mode?: unknown },
  result?: Pick<TestResultRecord, 'testType'>
): 'quiz' | 'test' {
  if (sessionData?.mode === 'quiz' || sessionData?.mode === 'test') {
    return sessionData.mode;
  }

  return result?.testType === 'quiz' ? 'quiz' : 'test';
}

function toStudentResult(
  result: TestResultRecord,
  sessionData?: any
): StudentResult {
  return {
    id: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName || sessionData?.players?.[result.studentId]?.name || 'Unknown',
    studentEmail: sessionData?.players?.[result.studentId]?.email,
    sessionCode: result.sessionCode,
    sessionMode: resolveSessionMode(sessionData, result),
    testId: result.testId,
    quizId: sessionData?.quizId || result.testId,
    testTitle: result.testTitle || sessionData?.testTitle || sessionData?.quizTitle,
    score: result.totalScore || 0,
    percentage: result.percentage || 0,
    totalQuestions: result.totalQuestions || 0,
    correctAnswers: result.correct || 0,
    completedAt: result.submittedAt || result.createdAt || Date.now(),
    timeSpent: result.timeElapsed,
    classId: result.classId !== null ? result.classId : sessionData?.classId,
    className: result.className !== null ? result.className : sessionData?.className,
    isGuest: !!result.isGuest,
    userId: result.studentId,
    bandScore: result.bandScore,
    testSkill: result.testSkill || sessionData?.testSkill,
    teacherId: result.visibility?.visibilityOwnerTeacherId ?? undefined,
    reMarkHistory: result.reMarkHistory?.length || 0,
    courseId: result.courseId !== null ? result.courseId : sessionData?.courseId,
    courseName: result.courseName !== null ? result.courseName : sessionData?.courseName,
    moduleId: result.moduleId !== null ? result.moduleId : sessionData?.moduleId,
    context: result.context,
    visibility: result.visibility,
    sourceMaterialRemoved: result.sourceMaterialRemoved,
  };
}

function isTeacherVisibleResult(
  result: Pick<StudentResult, 'visibility'> & Partial<StudentResult>,
  teacherId: string,
  hasAssignmentAccess: boolean
): boolean {
  return classifyTeacherResultVisibility({
    result: result as any,
    teacherId,
    hasAssignmentAccess,
  }).shouldDisplayInTeacherHistory;
}

function buildSessionResultsFromCanonical(
  sessionCode: string,
  results: TestResultRecord[],
  sessionData?: any
): SessionResults {
  const mappedResults = results.map((result) => toStudentResult(result, sessionData));
  const scores = mappedResults.map((result) => result.score);
  const percentages = mappedResults.map((result) => result.percentage);

  return {
    sessionCode,
    sessionMode: resolveSessionMode(sessionData, results[0]),
    testTitle: sessionData?.testTitle || sessionData?.quizTitle || results[0]?.testTitle,
    createdAt: sessionData?.createdAt || results[0]?.createdAt || Date.now(),
    completedAt: sessionData?.completedAt,
    totalStudents: mappedResults.length,
    averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    averagePercentage: percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
    results: mappedResults,
  };
}

/**
 * Get results for a specific session
 */
export async function getSessionResults(sessionCode: string): Promise<SessionResults | null> {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionSnapshot = await get(sessionRef);

    if (!sessionSnapshot.exists()) {
      return null;
    }

    const sessionData = sessionSnapshot.val();
    const results: StudentResult[] = [];

    // Get student results from players/students
    const players = sessionData.players || sessionData.students || {};

    // Fetch permanent results (which include re-marks and detailed stats)
    let permanentResultsMap: Record<string, TestResultRecord> = {};
    try {
      const permResults = await getPermanentSessionResults(sessionCode);
      permResults.forEach(r => {
        if (r.studentId) permanentResultsMap[r.studentId] = r;
      });
    } catch (err) {
      console.warn('Failed to fetch permanent results for session override', err);
    }

    for (const [playerId, playerData] of Object.entries(players)) {
      if (!playerData || typeof playerData !== 'object') continue;

      const player = playerData as any;
      const permResult = permanentResultsMap[playerId];

      // Only include players who have completed the session
      if (player.score !== undefined || permResult) {

        // Prefer permanent result data if available
        const score = permResult ? permResult.totalScore : (player.score || 0);
        const percentage = permResult ? permResult.percentage : (player.percentage || 0);
        const correctAnswers = permResult ? permResult.correct : (player.correctAnswers || 0);

        results.push({
          id: permResult?.resultId,
          studentId: playerId,
          studentName: permResult?.studentName || player.name || 'Unknown',
          studentEmail: player.email,
          sessionCode,
          sessionMode: resolveSessionMode(sessionData, permResult),
          testId: sessionData.testId,
          quizId: sessionData.quizId,
          testTitle: sessionData.testTitle || sessionData.quizTitle,
          score,
          percentage,
          totalQuestions: player.totalQuestions || 0,
          correctAnswers,
          completedAt: permResult?.submittedAt || player.completedAt || player.lastActivity || Date.now(),
          timeSpent: permResult?.timeElapsed || player.timeSpent, // Use timeElapsed from perm result if avail
          classId: sessionData.classId,
          className: sessionData.className,
          isGuest: permResult?.isGuest !== undefined ? permResult.isGuest : (player.isGuest || false),
          userId: player.uid,
          // New fields
          bandScore: permResult?.bandScore,
          testSkill: permResult?.testSkill || sessionData.testSkill,
          teacherId: permResult?.visibility?.visibilityOwnerTeacherId ?? undefined,
          reMarkHistory: permResult?.reMarkHistory?.length || 0,
          // Phase 6: Course context from session
          courseId: sessionData.courseId,
          courseName: sessionData.courseName, // Will be populated from course lookup if needed
          moduleId: sessionData.moduleId,
          visibility: permResult?.visibility,
        });
      }
    }

    // Calculate statistics
    const scores = results.map(r => r.score);
    const percentages = results.map(r => r.percentage);
    const firstPermanentResult = Object.values(permanentResultsMap)[0];

    return {
      sessionCode,
      sessionMode: resolveSessionMode(sessionData, firstPermanentResult),
      testTitle: sessionData.testTitle || sessionData.quizTitle,
      createdAt: sessionData.createdAt || Date.now(),
      completedAt: sessionData.completedAt,
      totalStudents: results.length,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      averagePercentage: percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0,
      highestScore: scores.length > 0 ? Math.max(...scores) : 0,
      lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
      results,
    };
  } catch (error) {
    console.error('Error getting session results:', error);
    return null;
  }
}

/**
 * Get all results for sessions created by a teacher
 * If teacherId is undefined, returns ALL results (for super_admin access)
 */
export async function getTeacherResults(teacherId?: string): Promise<SessionResults[]> {
  try {
    if (teacherId) {
      const canonicalResults = await getCanonicalTeacherResults(teacherId);
      if (canonicalResults.length === 0) {
        return [];
      }

      const sessionsSnapshot = await get(ref(database, 'game_sessions'));
      const sessions = sessionsSnapshot.exists() ? sessionsSnapshot.val() : {};
      const groupedResults = new Map<string, TestResultRecord[]>();

      canonicalResults.forEach((result) => {
        const sessionResults = groupedResults.get(result.sessionCode) ?? [];
        sessionResults.push(result);
        groupedResults.set(result.sessionCode, sessionResults);
      });

      const teacherResults = Array.from(groupedResults.entries()).map(([sessionCode, sessionResults]) =>
        buildSessionResultsFromCanonical(sessionCode, sessionResults, sessions?.[sessionCode])
      );

      teacherResults.sort((a, b) => b.createdAt - a.createdAt);
      return teacherResults;
    }

    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);

    if (!snapshot.exists()) {
      return [];
    }

    const sessions = snapshot.val();
    const results: SessionResults[] = [];

    for (const [sessionCode, sessionData] of Object.entries(sessions)) {
      if (!sessionData || typeof sessionData !== 'object') continue;

      const sessionResults = await getSessionResults(sessionCode);
      if (sessionResults) {
        results.push(sessionResults);
      }
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    return results;
  } catch (error) {
    console.error('Error getting teacher results:', error);
    return [];
  }
}

/**
 * Get results for a specific class
 */
export async function getClassResults(classId: string): Promise<ClassResults | null> {
  try {
    const classRef = ref(database, `classes/${classId}`);
    const classSnapshot = await get(classRef);

    if (!classSnapshot.exists()) {
      return null;
    }

    const classData = classSnapshot.val();
    const students = classData.students || {};
    const assignments = classData.assignments || {};

    const studentStats: ClassResults['students'] = {};

    // Calculate stats for each student
    for (const [studentId, studentData] of Object.entries(students)) {
      if (!studentData || typeof studentData !== 'object') continue;

      const student = studentData as any;
      const studentAssignments = student.assignments || {};

      const completedAssignments = Object.values(studentAssignments).filter(
        (a: any) => a?.status === 'submitted' || a?.status === 'graded'
      ).length;

      const scores = Object.values(studentAssignments)
        .filter((a: any) => a?.percentage !== undefined)
        .map((a: any) => a.percentage);

      const averageScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

      studentStats[studentId] = {
        name: student.name || 'Unknown',
        email: student.email,
        completedAssignments,
        averageScore,
        lastActivity: student.lastActivity || student.joinedAt || 0,
      };
    }

    // Calculate class-wide statistics
    const totalStudents = Object.keys(students).length;
    const totalAssignments = Object.keys(assignments).length;

    const completionRates = Object.values(studentStats).map(
      s => totalAssignments > 0 ? (s.completedAssignments / totalAssignments) * 100 : 0
    );

    const averageCompletion = completionRates.length > 0
      ? completionRates.reduce((a, b) => a + b, 0) / completionRates.length
      : 0;

    const allScores = Object.values(studentStats)
      .map(s => s.averageScore)
      .filter(s => s > 0);

    const averageScore = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

    return {
      classId,
      className: classData.name || 'Unknown Class',
      totalStudents,
      totalAssignments,
      averageCompletion,
      averageScore,
      students: studentStats,
    };
  } catch (error) {
    console.error('Error getting class results:', error);
    return null;
  }
}

/**
 * Get student history (all results for a specific student)
 */
export async function getStudentHistory(studentUid: string): Promise<StudentResult[]> {
  try {
    const { getStudentResults } = await import('./testResults.service');
    const permResults = await getStudentResults(studentUid);
    const results: StudentResult[] = permResults.map((result) => ({
      ...toStudentResult(result),
      userId: studentUid,
    }));

    // Sort by completion date (newest first)
    results.sort((a, b) => b.completedAt - a.completedAt);

    return results;
  } catch (error) {
    console.error('Error getting student history:', error);
    return [];
  }
}

/**
 * Get average percentage for a specific test within a course
 */
export async function getCourseAverage(courseId: string, testId: string): Promise<number> {
  try {
    const sessionsRef = ref(database, 'game_sessions');
    // We could optimize this with a better index, but for now we'll query all sessions
    // and filter by courseId and testId. 
    // Usually there aren't thousands of sessions.
    const snapshot = await get(sessionsRef);
    if (!snapshot.exists()) return 0;

    const sessions = snapshot.val();
    let totalPercentage = 0;
    let studentCount = 0;

    for (const session of Object.values(sessions)) {
      const s = session as any;
      if (s.courseId === courseId && (s.testId === testId || s.quizId === testId)) {
        const players = s.players || s.students || {};
        for (const player of Object.values(players)) {
          const p = player as any;
          if (p.percentage !== undefined && p.score !== undefined) {
            totalPercentage += p.percentage;
            studentCount++;
          }
        }
      }
    }

    return studentCount > 0 ? totalPercentage / studentCount : 0;
  } catch (error) {
    console.error('Error getting course average:', error);
    return 0;
  }
}

/**
 * Export results to CSV format
 */
export function exportResultsToCSV(results: StudentResult[]): string {
  if (results.length === 0) {
    return '';
  }

  // CSV headers
  const headers = [
    'Student Name',
    'Student Email',
    'Session Code',
    'Test Title',
    'Score',
    'Percentage',
    'Correct Answers',
    'Total Questions',
    'Completed At',
    'Time Spent (min)',
    'Class Name',
    'Is Guest',
    'Band Score',
    'Skill',
    'Teacher ID',
    'Re-marks',
    'Course Name', // Phase 6
    'Course ID',
    'Module ID'
  ];

  // CSV rows
  const rows = results.map(r => [
    r.studentName,
    r.studentEmail || '',
    r.sessionCode,
    r.testTitle || '',
    r.score.toString(),
    r.percentage.toFixed(2) + '%',
    r.correctAnswers.toString(),
    r.totalQuestions.toString(),
    new Date(r.completedAt).toLocaleString(),
    r.timeSpent ? (r.timeSpent / 60000).toFixed(2) : '',
    r.className || '',
    r.isGuest ? 'Yes' : 'No',
    r.bandScore ? r.bandScore.toFixed(1) : '',
    r.testSkill || '',
    r.teacherId || '',
    r.reMarkHistory ? r.reMarkHistory.toString() : '0',
    r.courseName || '', // Phase 6
    r.courseId || '',
    r.moduleId || ''
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Filter results by date range
 */
export function filterResultsByDateRange(
  results: StudentResult[],
  startDate: Date,
  endDate: Date
): StudentResult[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return results.filter(r => r.completedAt >= startTime && r.completedAt <= endTime);
}

/**
 * Filter results by class
 */
export function filterResultsByClass(
  results: StudentResult[],
  classId: string
): StudentResult[] {
  return results.filter(r => r.classId === classId);
}

/**
 * Filter results by Test/Quiz ID
 */
export function filterResultsByTest(
  results: StudentResult[],
  testId: string
): StudentResult[] {
  return results.filter(r => r.testId === testId || r.quizId === testId);
}

/**
 * Filter results by Course ID (Phase 6)
 */
export function filterResultsByCourse(
  results: StudentResult[],
  courseId: string
): StudentResult[] {
  return results.filter(r => r.courseId === courseId);
}

/**
 * Interface for available public sessions
 */
export interface PublicSession {
  sessionCode: string;
  sessionMode: 'test';
  testId?: string;
  testTitle?: string;
  status: string;
  createdAt: number;
  playerCount: number;
  isActive: boolean;
}

function normalizePublicSessions(
  sessions: Record<string, unknown> | null | undefined,
): PublicSession[] {
  if (!sessions || typeof sessions !== 'object') {
    return [];
  }

  const publicSessions: PublicSession[] = [];

  for (const [sessionCode, sessionData] of Object.entries(sessions)) {
    if (!sessionData || typeof sessionData !== 'object') continue;

    const session = sessionData as Record<string, any>;
    const isPublic = !session.linkedClassId && !session.classId;
    const isActive = session.status === 'waiting' || session.status === 'in-progress';
    const notExpired = !session.expiresAt || Date.now() < session.expiresAt;

    if (!isPublic || !isActive || !notExpired) {
      continue;
    }

    const players = session.players || session.students || {};
    const playerCount = Object.keys(players).length;

    publicSessions.push({
      sessionCode,
      sessionMode: 'test',
      testId: session.testId,
      testTitle: session.testTitle || 'Untitled Session',
      status: session.status,
      createdAt: session.createdAt || Date.now(),
      playerCount,
      isActive: session.status === 'in-progress',
    });
  }

  publicSessions.sort((a, b) => b.createdAt - a.createdAt);
  return publicSessions;
}

/**
 * Get all available public sessions (not linked to any class)
 * Students can browse and join these sessions
 */
export async function getAvailablePublicSessions(): Promise<PublicSession[]> {
  try {
    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);

    if (!snapshot.exists()) {
      return [];
    }

    return normalizePublicSessions(snapshot.val());
  } catch (error) {
    console.error('Error getting available public sessions:', error);
    return [];
  }
}

export function subscribeToAvailablePublicSessions(
  callback: (sessions: PublicSession[]) => void,
): () => void {
  const sessionsRef = ref(database, 'game_sessions');

  const unsubscribe = onValue(sessionsRef, (snapshot) => {
    callback(snapshot.exists() ? normalizePublicSessions(snapshot.val()) : []);
  });

  return () => unsubscribe();
}

// =============================================================================
// PRD-0016: Context-Aware Result Functions
// =============================================================================

/**
 * Get results for a student filtered by context type
 * PRD-0016: Solo Study & Homework System
 * 
 * @param studentId - Student UID to get results for
 * @param contextType - Filter by context type (class_session, homework, self_study, course_material)
 * @returns Array of StudentResult matching the context filter
 */
export async function getResultsByContext(
  studentId: string,
  contextType?: ResultContextType
): Promise<StudentResult[]> {
  try {
    // Get all results for the student
    const allResults = await getStudentHistory(studentId);

    // If no context filter, return all
    if (!contextType) {
      return allResults;
    }

    // Filter by context type
    return allResults.filter(result => {
      // If result has context, match the type
      if (result.context) {
        return result.context.type === contextType;
      }

      // Legacy results without context are treated as class_session
      return contextType === 'class_session';
    });
  } catch (error) {
    console.error('Error getting results by context:', error);
    return [];
  }
}

/**
 * Get results for students assigned to a specific teacher
 * PRD-0016: Teacher visibility - only see results for assigned students
 * 
 * @param teacherId - Teacher UID
 * @param assignedStudentIds - Array of student UIDs assigned to this teacher
 * @param contextType - Optional context type filter
 * @returns Array of StudentResult for assigned students
 */
export async function getResultsForTeacher(
  teacherId: string,
  assignedStudentIds: string[],
  contextType?: ResultContextType
): Promise<StudentResult[]> {
  try {
    if (!assignedStudentIds || assignedStudentIds.length === 0) {
      return [];
    }

    // Get results for all assigned students
    const results: StudentResult[] = [];

    for (const studentId of assignedStudentIds) {
      const studentResults = await getResultsByContext(studentId, contextType);
      const filteredResults = studentResults.filter((result) =>
        isTeacherVisibleResult(result, teacherId, true)
      );
      results.push(...filteredResults);
    }

    // Sort by completion date (newest first)
    results.sort((a, b) => b.completedAt - a.completedAt);

    return results;
  } catch (error) {
    console.error('Error getting results for teacher:', error);
    return [];
  }
}

/**
 * Filter results by context type (client-side filtering)
 * PRD-0016: For filtering already-loaded results
 * 
 * Overloaded to support both StudentResult[] and TestResultRecord[]
 */
export function filterResultsByContext(
  results: StudentResult[],
  contextType: ResultContextType
): StudentResult[];
export function filterResultsByContext(
  results: TestResultRecord[],
  contextType: ResultContextType
): TestResultRecord[];
export function filterResultsByContext(
  results: StudentResult[] | TestResultRecord[],
  contextType: ResultContextType
): StudentResult[] | TestResultRecord[] {
  return results.filter(result => {
    // If result has context, match the type
    if (result.context) {
      return result.context.type === contextType;
    }

    // Legacy results without context are treated as class_session
    return contextType === 'class_session';
  }) as StudentResult[] | TestResultRecord[];
}

/**
 * Get results for a specific homework assignment
 * PRD-0016: For homework detail page
 * 
 * @param homeworkId - Homework assignment ID
 * @returns Array of StudentResult for this homework
 */
export async function getHomeworkResults(homeworkId: string): Promise<StudentResult[]> {
  try {
    // This queries all sessions and filters - could be optimized with indexing
    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);

    if (!snapshot.exists()) {
      return [];
    }

    const sessions = snapshot.val();
    const results: StudentResult[] = [];

    for (const [sessionCode, sessionData] of Object.entries(sessions)) {
      if (!sessionData || typeof sessionData !== 'object') continue;

      const session = sessionData as any;

      // Check if this session is linked to the homework
      if (session.homeworkId === homeworkId) {
        const sessionResults = await getSessionResults(sessionCode);
        if (sessionResults) {
          // Add context to each result
          sessionResults.results.forEach(result => {
            results.push({
              ...result,
              context: {
                type: 'homework',
                source: {
                  type: 'homework',
                  id: homeworkId,
                  name: session.homeworkTitle
                },
                configApplied: {
                  timerMinutes: session.timerMinutes,
                  feedbackTiming: session.feedbackTiming || 'after_completion',
                  source: 'teacher_override'
                }
              }
            });
          });
        }
      }
    }

    // Sort by completion date (newest first)
    results.sort((a, b) => b.completedAt - a.completedAt);

    return results;
  } catch (error) {
    console.error('Error getting homework results:', error);
    return [];
  }
}

// =============================================================================
// PRD-0016 Phase 5: Teacher Visibility & Access Control
// =============================================================================

/**
 * Get all results for students assigned to a specific teacher
 * PRD-0016 Phase 5: Teacher visibility across all contexts
 * 
 * @param teacherId - Teacher UID
 * @returns Array of EnhancedTestResultRecord for assigned students
 */
export async function getResultsForAssignedStudents(
  teacherId: string
): Promise<StudentResult[]> {
  try {
    // Import assignment manager to get assigned students
    const { getAssignmentsByTeacher } = await import('./assignmentManager');

    // Get all students assigned to this teacher
    const assignments = await getAssignmentsByTeacher(teacherId);

    if (!assignments || assignments.length === 0) {
      return [];
    }

    const studentIds = assignments.map((a: any) => a.studentId);

    // Get results for all assigned students
    const allResults: StudentResult[] = [];

    for (const studentId of studentIds) {
      const studentResults = await getStudentHistory(studentId);
      allResults.push(
        ...studentResults.filter((result) =>
          isTeacherVisibleResult(result, teacherId, true)
        )
      );
    }

    // Sort by completion date (newest first)
    allResults.sort((a, b) => b.completedAt - a.completedAt);

    return allResults;
  } catch (error) {
    console.error('Error getting results for assigned students:', error);
    return [];
  }
}

/**
 * Get all results for a specific student
 * PRD-0016 Phase 5: Student results with optional teacher access verification
 * 
 * @param studentId - Student UID
 * @param teacherId - Optional teacher UID for access verification
 * @returns Array of StudentResult
 */
export async function getStudentAllResults(
  studentId: string,
  teacherId?: string
): Promise<StudentResult[]> {
  try {
    // If teacherId is provided, verify access
    if (teacherId) {
      const { isStudentAssignedToTeacher } = await import('./assignmentManager');
      const hasAccess = await isStudentAssignedToTeacher(studentId, teacherId);

      if (!hasAccess) {
        console.warn(`Teacher ${teacherId} does not have access to student ${studentId} results`);
        return [];
      }

      const studentResults = await getStudentHistory(studentId);
      return studentResults.filter((result) =>
        isTeacherVisibleResult(result, teacherId, true)
      );
    }

    // Get all results for the student
    return await getStudentHistory(studentId);
  } catch (error) {
    console.error('Error getting student all results:', error);
    return [];
  }
}
