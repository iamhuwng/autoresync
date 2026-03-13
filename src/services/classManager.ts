/**
 * Class Manager Service
 * 
 * Manages class (formerly session) operations with support for:
 * - Multiple concurrent test assignments
 * - Long-lived class sessions
 * - Student enrollment and progress tracking
 * - Backward compatibility with legacy session system
 * 
 * @module services/classManager
 */

import { database } from './firebase';
import { ref, set, get, update, onValue, off, query, orderByChild, equalTo, remove } from 'firebase/database';
import type {
  ClassSession,
  ClassStudent,
  TestAssignment,
  StudentAssignment,
  CreateClassRequest,
  AssignTestRequest,
  ClassSummary,
  ClassStatistics,
  ClassStatus,
  TestAssignmentStatus,
  StudentTestStatus,
} from '../types/class.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CLASSES_REF = 'classes';
const GAME_SESSIONS_REF = 'game_sessions'; // For backward compatibility

/**
 * Generate a unique class code (6 alphanumeric characters)
 */
function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const CLASS_STATS_WRITE_ROLES = new Set(['teacher', 'super_admin']);

async function getCurrentActorUid(): Promise<string | undefined> {
  try {
    const firebaseModule = await import('./firebase');

    if (!('auth' in firebaseModule)) {
      return undefined;
    }

    return (firebaseModule as { auth?: { currentUser?: { uid?: string } } }).auth?.currentUser?.uid;
  } catch {
    return undefined;
  }
}

async function canCurrentActorWriteClassStats(classOwnerId?: string): Promise<boolean> {
  const actorUid = await getCurrentActorUid();

  // In unauthenticated contexts we cannot satisfy class-level write rules safely.
  if (!actorUid) {
    return false;
  }

  if (classOwnerId && actorUid === classOwnerId) {
    return true;
  }

  try {
    const roleSnapshot = await get(ref(database, `users/${actorUid}/role`));
    const actorRole = roleSnapshot.val();
    return typeof actorRole === 'string' && CLASS_STATS_WRITE_ROLES.has(actorRole);
  } catch (error) {
    console.warn('[ClassManager] Unable to resolve actor role for stats write check:', error);
    return false;
  }
}

async function updateEnrollmentStatsIfAuthorized(
  classId: string,
  classData: ClassSession,
  now: number
): Promise<void> {
  const canWriteStats = await canCurrentActorWriteClassStats(classData.createdBy);

  if (!canWriteStats) {
    return;
  }

  try {
    const classRef = ref(database, `${CLASSES_REF}/${classId}`);
    await update(classRef, {
      'stats/totalStudents': (classData.stats?.totalStudents || 0) + 1,
      'stats/activeStudents': (classData.stats?.activeStudents || 0) + 1,
      updatedAt: now,
    });
  } catch (error) {
    // Stats are derived/auxiliary; enrollment should still succeed if this fails.
    console.warn(`[ClassManager] Failed to update enrollment stats for class ${classId}:`, error);
  }
}

// ============================================================================
// CLASS CRUD OPERATIONS
// ============================================================================

/**
 * Create a new class
 * @param request - Class creation request
 * @param ownerId - UID of the teacher creating the class (from auth)
 */
export async function createClass(request: CreateClassRequest, ownerId?: string): Promise<{ success: boolean; classId?: string; classCode?: string; error?: string }> {
  try {
    // Generate unique class code
    let classCode = generateClassCode();
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const existingRef = ref(database, `${CLASSES_REF}/${classCode}`);
      const snapshot = await get(existingRef);

      if (!snapshot.exists()) {
        break;
      }

      classCode = generateClassCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return { success: false, error: 'Failed to generate unique class code' };
    }

    const now = Date.now();

    const newClass: ClassSession = {
      id: classCode,
      classCode,
      name: request.name,
      description: request.description,
      status: 'active',
      mode: 'class',
      createdBy: ownerId || 'unknown', // Use authenticated user's UID
      createdAt: now,
      updatedAt: now,
      students: {},
      assignments: {},
      settings: {
        allowLateJoin: true,
        requireEmail: false,
        autoArchiveDays: 30,
        maxStudents: 100,
        ...request.settings,
      },
      stats: {
        totalStudents: 0,
        activeStudents: 0,
        totalAssignments: 0,
        completedAssignments: 0,
      },
    };

    // Save to Firebase
    const classRef = ref(database, `${CLASSES_REF}/${classCode}`);
    await set(classRef, newClass);

    // Also save to game_sessions for backward compatibility
    const legacyRef = ref(database, `${GAME_SESSIONS_REF}/${classCode}`);
    await set(legacyRef, {
      sessionCode: classCode,
      status: 'waiting',
      mode: 'class',
      createdAt: now,
      players: {},
      // Link to class
      classId: classCode,
    });

    // Assign initial test if provided
    if (request.initialTestId && request.initialTestType) {
      await assignTestToClass({
        classId: classCode,
        testId: request.initialTestId,
        testType: request.initialTestType,
        testTitle: 'Initial Assignment',
      });
    }

    return { success: true, classId: classCode, classCode };
  } catch (error) {
    console.error('Error creating class:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Remove a student from a class
 */
export async function removeStudentFromClass(
  classId: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const classRef = ref(database, `${CLASSES_REF}/${classId}`);
    const classSnapshot = await get(classRef);

    if (!classSnapshot.exists()) {
      return { success: false, error: 'Class not found' };
    }

    const classData = classSnapshot.val() as ClassSession;
    const student = classData.students?.[studentId];

    if (!student) {
      return { success: false, error: 'Student not found in class' };
    }

    const now = Date.now();

    // Remove from class roster
    await remove(ref(database, `${CLASSES_REF}/${classId}/students/${studentId}`));

    // Remove from legacy game session players for backward compatibility
    await remove(ref(database, `${GAME_SESSIONS_REF}/${classId}/players/${studentId}`));

    // Clean up class-based course enrollments for this student
    try {
      const enrollmentQuery = query(
        ref(database, 'course_enrollments'),
        orderByChild('studentId'),
        equalTo(studentId)
      );
      const enrollmentSnapshot = await get(enrollmentQuery);

      if (enrollmentSnapshot.exists()) {
        const enrollments = enrollmentSnapshot.val() as Record<string, { sourceClassId?: string }>;
        const updates: Record<string, null> = {};

        for (const [enrollmentId, enrollment] of Object.entries(enrollments)) {
          if (enrollment.sourceClassId === classId) {
            updates[`course_enrollments/${enrollmentId}`] = null;
          }
        }

        if (Object.keys(updates).length > 0) {
          await update(ref(database), updates);
        }
      }
    } catch (cleanupError) {
      // Enrollment cleanup is best-effort; roster removal should still succeed.
      console.warn(`[ClassManager] Failed to clean up class-based enrollments for ${studentId}:`, cleanupError);
    }

    // Update class stats if current actor has write permission
    const canWriteStats = await canCurrentActorWriteClassStats(classData.createdBy);
    if (canWriteStats) {
      const totalStudents = classData.stats?.totalStudents ?? Object.keys(classData.students || {}).length;
      const activeStudents = classData.stats?.activeStudents ?? Object.values(classData.students || {}).filter((s) => s.isOnline).length;

      await update(classRef, {
        'stats/totalStudents': Math.max(totalStudents - 1, 0),
        'stats/activeStudents': Math.max(activeStudents - (student.isOnline ? 1 : 0), 0),
        updatedAt: now,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing student from class:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get a class by ID/code
 */
export async function getClass(classId: string): Promise<ClassSession | null> {
  try {
    const classRef = ref(database, `${CLASSES_REF}/${classId}`);
    const snapshot = await get(classRef);

    if (snapshot.exists()) {
      return snapshot.val() as ClassSession;
    }

    return null;
  } catch (error) {
    console.error('Error getting class:', error);
    return null;
  }
}

/**
 * Get all classes for a teacher
 */
export async function getClasses(teacherId?: string): Promise<ClassSummary[]> {
  console.log('🏫 [ClassManager] getClasses called');
  console.log('🏫 [ClassManager] teacherId filter:', teacherId);

  try {
    let snapshot;

    if (teacherId) {
      console.log('🏫 [ClassManager] Querying by teacherId...');
      const classesQuery = query(
        ref(database, CLASSES_REF),
        orderByChild('createdBy'),
        equalTo(teacherId)
      );
      snapshot = await get(classesQuery);
    } else {
      console.log('🏫 [ClassManager] Fetching all classes...');
      const classesRef = ref(database, CLASSES_REF);
      snapshot = await get(classesRef);
    }

    if (!snapshot.exists()) {
      console.log('🏫 [ClassManager] No classes found');
      return [];
    }

    const classes: ClassSummary[] = [];
    const data = snapshot.val();

    for (const [id, classData] of Object.entries(data)) {
      const cls = classData as ClassSession;

      // Secondary check not strictly needed if queried, but safe
      if (teacherId && cls.createdBy !== teacherId) {
        continue;
      }

      // Skip deleted classes
      if (cls.status === 'deleted') {
        continue;
      }

      classes.push({
        id: cls.id,
        classCode: cls.classCode,
        name: cls.name,
        status: cls.status,
        createdAt: cls.createdAt,
        studentCount: Object.keys(cls.students || {}).length,
        activeAssignments: Object.values(cls.assignments || {}).filter(
          (a) => a.status === 'available' || a.status === 'in_progress'
        ).length,
        completedAssignments: Object.values(cls.assignments || {}).filter(
          (a) => a.status === 'completed' || a.status === 'graded'
        ).length,
      });
    }

    // Sort by creation date (newest first)
    classes.sort((a, b) => b.createdAt - a.createdAt);

    return classes;
  } catch (error) {
    console.error('🏫 [ClassManager] ERROR getting classes:', error);
    return [];
  }
}

/**
 * Update class status
 */
export async function updateClassStatus(classId: string, status: ClassStatus): Promise<boolean> {
  try {
    const classRef = ref(database, `${CLASSES_REF}/${classId}`);
    await update(classRef, {
      status,
      updatedAt: Date.now(),
    });

    // Update legacy session too
    const legacyRef = ref(database, `${GAME_SESSIONS_REF}/${classId}`);
    const legacyStatus = status === 'active' ? 'waiting' : status === 'archived' ? 'completed' : 'waiting';
    await update(legacyRef, { status: legacyStatus });

    return true;
  } catch (error) {
    console.error('Error updating class status:', error);
    return false;
  }
}

/**
 * Delete a class (soft delete)
 */
export async function deleteClass(classId: string): Promise<boolean> {
  try {
    return await updateClassStatus(classId, 'deleted');
  } catch (error) {
    console.error('Error deleting class:', error);
    return false;
  }
}

// ============================================================================
// TEST ASSIGNMENT OPERATIONS
// ============================================================================

/**
 * Assign a test to a class
 */
export async function assignTestToClass(request: AssignTestRequest): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
  try {
    const assignmentId = generateId();
    const now = Date.now();

    const assignment: TestAssignment = {
      id: assignmentId,
      testId: request.testId,
      testTitle: request.testTitle,
      testType: request.testType,
      status: 'available',
      availableFrom: request.availableFrom,
      deadline: request.deadline,
      timeLimit: request.timeLimit,
      maxAttempts: request.maxAttempts ?? 1,
      showAnswers: request.showAnswers ?? true,
      showScores: request.showScores ?? true,
      assignedAt: now,
      assignedBy: 'admin-teacher', // TODO: Get from auth
      stats: {
        totalStudents: 0,
        started: 0,
        submitted: 0,
        graded: 0,
      },
    };

    // Add assignment to class
    const assignmentRef = ref(database, `${CLASSES_REF}/${request.classId}/assignments/${assignmentId}`);
    await set(assignmentRef, assignment);

    // Update class stats
    const classRef = ref(database, `${CLASSES_REF}/${request.classId}`);
    const classSnapshot = await get(classRef);

    if (classSnapshot.exists()) {
      const classData = classSnapshot.val() as ClassSession;
      await update(classRef, {
        'stats/totalAssignments': (classData.stats?.totalAssignments || 0) + 1,
        updatedAt: now,
      });
    }

    // Update legacy session with testId for backward compatibility
    const legacyRef = ref(database, `${GAME_SESSIONS_REF}/${request.classId}`);
    await update(legacyRef, {
      [request.testType === 'quiz' ? 'quizId' : 'testId']: request.testId,
    });

    return { success: true, assignmentId };
  } catch (error) {
    console.error('Error assigning test to class:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Update assignment status
 */
export async function updateAssignmentStatus(
  classId: string,
  assignmentId: string,
  status: TestAssignmentStatus
): Promise<boolean> {
  try {
    const assignmentRef = ref(database, `${CLASSES_REF}/${classId}/assignments/${assignmentId}`);
    await update(assignmentRef, {
      status,
      ...(status === 'in_progress' ? { startedAt: Date.now() } : {}),
      ...(status === 'completed' || status === 'graded' ? { completedAt: Date.now() } : {}),
    });

    return true;
  } catch (error) {
    console.error('Error updating assignment status:', error);
    return false;
  }
}

/**
 * Set active assignment for real-time monitoring
 */
export async function setActiveAssignment(classId: string, assignmentId: string | null): Promise<boolean> {
  try {
    const classRef = ref(database, `${CLASSES_REF}/${classId}`);
    await update(classRef, {
      activeAssignmentId: assignmentId,
      updatedAt: Date.now(),
    });

    return true;
  } catch (error) {
    console.error('Error setting active assignment:', error);
    return false;
  }
}

/**
 * Update module progress for a class
 */
export async function updateModuleProgress(
  classId: string,
  moduleId: string,
  status: 'locked' | 'available' | 'completed'
): Promise<boolean> {
  try {
    const progressRef = ref(database, `classes/${classId}/moduleProgress/${moduleId}`);
    await update(progressRef, {
      status,
      ...(status === 'available' ? { unlockedAt: Date.now() } : {}),
      ...(status === 'completed' ? { completedAt: Date.now() } : {}),
    });

    return true;
  } catch (error) {
    console.error('Error updating module progress:', error);
    return false;
  }
}

// ============================================================================
// STUDENT OPERATIONS
// ============================================================================

/**
 * Add a student to a class (for guest/anonymous students)
 */
export async function addStudent(
  classId: string,
  studentName: string,
  studentEmail?: string
): Promise<{ success: boolean; studentId?: string; error?: string }> {
  try {
    const studentId = generateId();
    const now = Date.now();

    const student: ClassStudent = {
      id: studentId,
      name: studentName,
      email: studentEmail,
      joinedAt: now,
      lastActiveAt: now,
      isOnline: true,
      assignments: {},
    };

    // Add student to class
    const studentRef = ref(database, `${CLASSES_REF}/${classId}/students/${studentId}`);
    await set(studentRef, student);

    // Update class stats (best effort; do not fail enrollment)
    try {
      const classRef = ref(database, `${CLASSES_REF}/${classId}`);
      const classSnapshot = await get(classRef);

      if (classSnapshot.exists()) {
        const classData = classSnapshot.val() as ClassSession;
        await updateEnrollmentStatsIfAuthorized(classId, classData, now);
      }
    } catch (error) {
      console.warn(`[ClassManager] Failed to read class for stats update (${classId}):`, error);
    }

    // Also add to legacy session for backward compatibility
    const legacyRef = ref(database, `${GAME_SESSIONS_REF}/${classId}/players/${studentId}`);
    await set(legacyRef, {
      name: studentName,
      score: 0,
      joinedAt: now,
    });

    // Auto-enroll in class courses
    try {
      const { autoEnrollStudentInClassCourses } = await import('./enrollmentManager');
      await autoEnrollStudentInClassCourses(classId, studentId);
    } catch (e) {
      console.warn('Failed to auto-enroll student in class courses:', e);
    }

    return { success: true, studentId };
  } catch (error) {
    console.error('Error adding student:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Enroll an authenticated student in a class using class code
 * @param classCode - The class code to join
 * @param studentUid - The authenticated student's UID from Firebase Auth
 * @param studentName - Student's display name from auth profile
 * @param studentEmail - Student's email from auth profile
 */
export async function enrollStudent(
  classCode: string,
  studentUid: string,
  studentName: string,
  studentEmail?: string
): Promise<{ success: boolean; classId?: string; error?: string }> {
  try {
    // Verify class exists and is active
    const classData = await getClass(classCode);

    if (!classData) {
      return { success: false, error: 'Class not found' };
    }

    if (classData.status !== 'active') {
      return { success: false, error: 'Class is not active' };
    }

    // Check if student is already enrolled
    const existingStudent = Object.values(classData.students || {}).find(
      (s) => s.uid === studentUid
    );

    if (existingStudent) {
      return { success: false, error: 'Already enrolled in this class' };
    }

    // Check max students limit
    const currentStudentCount = Object.keys(classData.students || {}).length;
    if (classData.settings?.maxStudents && currentStudentCount >= classData.settings.maxStudents) {
      return { success: false, error: 'Class is full' };
    }

    const now = Date.now();

    const student: ClassStudent = {
      id: studentUid, // Use UID as student ID for authenticated users
      uid: studentUid, // Store UID for reference
      name: studentName,
      email: studentEmail,
      joinedAt: now,
      lastActiveAt: now,
      isOnline: true,
      assignments: {},
    };

    // Add student to class
    const studentRef = ref(database, `${CLASSES_REF}/${classCode}/students/${studentUid}`);
    await set(studentRef, student);

    // Update class stats
    await updateEnrollmentStatsIfAuthorized(classCode, classData, now);

    // Also add to legacy session for backward compatibility
    const legacyRef = ref(database, `${GAME_SESSIONS_REF}/${classCode}/players/${studentUid}`);
    await set(legacyRef, {
      name: studentName,
      score: 0,
      joinedAt: now,
      uid: studentUid,
    });

    // Auto-enroll in class courses
    try {
      const { autoEnrollStudentInClassCourses } = await import('./enrollmentManager');
      await autoEnrollStudentInClassCourses(classCode, studentUid);
    } catch (e) {
      console.warn('Failed to auto-enroll student in class courses:', e);
    }

    // Auto-create student-teacher assignment so the student appears in teacher's student list
    try {
      const { createAssignment } = await import('./assignmentManager');
      const teacherId = classData.createdBy;
      if (teacherId && teacherId !== 'unknown') {
        const assignResult = await createAssignment(studentUid, teacherId, teacherId);
        if (assignResult.success) {
          console.log(`📋 [ClassManager] Auto-created student-teacher assignment for ${studentUid} → ${teacherId}`);
        } else if (assignResult.error?.includes('already exists')) {
          console.log(`📋 [ClassManager] Student-teacher assignment already exists for ${studentUid} → ${teacherId}`);
        } else {
          console.warn(`⚠️ [ClassManager] Failed to auto-create assignment: ${assignResult.error}`);
        }
      }
    } catch (assignError) {
      console.warn('⚠️ [ClassManager] Failed to auto-create student-teacher assignment (non-blocking):', assignError);
    }

    // PRD-0002: Dashboard feed notification
    try {
      const { createNotification } = await import('./notificationService');
      await createNotification({
        userId: studentUid,
        type: 'success',
        title: '🏫 Joined Class',
        message: `You joined ${classData.name || classCode}!`,
        link: '/student/dashboard',
        metadata: { className: classData.name || classCode, classCode }
      });
      console.log(`📢 [ClassManager] Feed notification sent for student ${studentUid} joining class ${classCode}`);
    } catch (notifError) {
      console.warn('⚠️ [ClassManager] Failed to send join-class notification (non-blocking):', notifError);
    }

    return { success: true, classId: classCode };
  } catch (error) {
    console.error('Error enrolling student:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get all classes a student is enrolled in
 * @param studentUid - The authenticated student's UID
 */
export async function getStudentClasses(studentUid: string): Promise<ClassSummary[]> {
  try {
    const classesRef = ref(database, CLASSES_REF);
    const snapshot = await get(classesRef);

    if (!snapshot.exists()) {
      console.log(`[Courses DEBUG] getStudentClasses: no classes found in DB at all`);
      return [];
    }

    const enrolledClasses: ClassSummary[] = [];
    const data = snapshot.val();
    const classKeys = Object.keys(data);
    console.log(`[Courses DEBUG] getStudentClasses: scanning ${classKeys.length} total classes for uid="${studentUid}"`);

    for (const [id, classData] of Object.entries(data)) {
      const cls = classData as ClassSession;
      const studentEntries = Object.entries(cls.students || {});

      // Check if student is enrolled in this class
      const isEnrolled = studentEntries.some(
        ([key, s]) => s.uid === studentUid || key === studentUid
      );

      if (!isEnrolled) {
        const uidsInClass = studentEntries.map(([key, s]) => ({ key, uid: s.uid }));
        if (studentEntries.length > 0) {
          console.log(`[Courses DEBUG]   class "${cls.name}" (${id}) - not enrolled. Students:`, uidsInClass);
        }
        continue;
      }

      // Skip deleted or archived classes
      if (cls.status === 'deleted') {
        console.log(`[Courses DEBUG]   class "${cls.name}" skipped (deleted)`);
        continue;
      }

      console.log(`[Courses DEBUG]   ✅ ENROLLED in class "${cls.name}" (${id})`);

      enrolledClasses.push({
        id: cls.id,
        classCode: cls.classCode,
        name: cls.name,
        status: cls.status,
        createdAt: cls.createdAt,
        studentCount: Object.keys(cls.students || {}).length,
        activeAssignments: Object.values(cls.assignments || {}).filter(
          (a) => a.status === 'available' || a.status === 'in_progress'
        ).length,
        completedAssignments: Object.values(cls.assignments || {}).filter(
          (a) => a.status === 'completed' || a.status === 'graded'
        ).length,
      });
    }

    // Sort by creation date (newest first)
    enrolledClasses.sort((a, b) => b.createdAt - a.createdAt);

    console.log(`[Courses DEBUG] getStudentClasses: found ${enrolledClasses.length} enrolled classes`);
    return enrolledClasses;
  } catch (error) {
    console.error('Error getting student classes:', error);
    return [];
  }
}

/**
 * Update student's online status
 */
export async function updateStudentOnlineStatus(
  classId: string,
  studentId: string,
  isOnline: boolean
): Promise<boolean> {
  try {
    const studentRef = ref(database, `${CLASSES_REF}/${classId}/students/${studentId}`);
    await update(studentRef, {
      isOnline,
      lastActiveAt: Date.now(),
    });

    return true;
  } catch (error) {
    console.error('Error updating student status:', error);
    return false;
  }
}

/**
 * Start a test for a student
 */
export async function startStudentTest(
  classId: string,
  studentId: string,
  assignmentId: string
): Promise<boolean> {
  try {
    const now = Date.now();

    // Get existing assignment progress or create new
    const progressRef = ref(database, `${CLASSES_REF}/${classId}/students/${studentId}/assignments/${assignmentId}`);
    const progressSnapshot = await get(progressRef);

    let attemptNumber = 1;
    if (progressSnapshot.exists()) {
      const existing = progressSnapshot.val() as StudentAssignment;
      attemptNumber = (existing.attemptNumber || 0) + 1;
    }

    const progress: StudentAssignment = {
      testAssignmentId: assignmentId,
      status: 'in_progress',
      attemptNumber,
      startedAt: now,
    };

    await set(progressRef, progress);

    // Update assignment stats
    const assignmentRef = ref(database, `${CLASSES_REF}/${classId}/assignments/${assignmentId}`);
    const assignmentSnapshot = await get(assignmentRef);

    if (assignmentSnapshot.exists()) {
      const assignment = assignmentSnapshot.val() as TestAssignment;
      await update(assignmentRef, {
        'stats/started': (assignment.stats?.started || 0) + 1,
        status: 'in_progress',
        startedAt: assignment.startedAt || now,
      });
    }

    return true;
  } catch (error) {
    console.error('Error starting student test:', error);
    return false;
  }
}

/**
 * Submit student answers
 */
export async function submitStudentAnswers(
  classId: string,
  studentId: string,
  assignmentId: string,
  answers: Record<string, any>,
  score?: number,
  maxScore?: number
): Promise<boolean> {
  try {
    const now = Date.now();

    const progressRef = ref(database, `${CLASSES_REF}/${classId}/students/${studentId}/assignments/${assignmentId}`);
    const progressSnapshot = await get(progressRef);

    if (!progressSnapshot.exists()) {
      return false;
    }

    const existing = progressSnapshot.val() as StudentAssignment;
    const timeSpent = existing.startedAt ? Math.floor((now - existing.startedAt) / 1000) : 0;

    await update(progressRef, {
      status: 'submitted',
      submittedAt: now,
      timeSpent,
      answers,
      ...(score !== undefined ? { score } : {}),
      ...(maxScore !== undefined ? { maxScore } : {}),
      ...(score !== undefined && maxScore !== undefined ? {
        percentage: Math.round((score / maxScore) * 100),
      } : {}),
    });

    // Update assignment stats
    const assignmentRef = ref(database, `${CLASSES_REF}/${classId}/assignments/${assignmentId}`);
    const assignmentSnapshot = await get(assignmentRef);

    if (assignmentSnapshot.exists()) {
      const assignment = assignmentSnapshot.val() as TestAssignment;
      await update(assignmentRef, {
        'stats/submitted': (assignment.stats?.submitted || 0) + 1,
      });
    }

    return true;
  } catch (error) {
    console.error('Error submitting student answers:', error);
    return false;
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get class statistics
 */
export async function getClassStatistics(classId: string): Promise<ClassStatistics | null> {
  try {
    const classData = await getClass(classId);

    if (!classData) {
      return null;
    }

    const students = Object.values(classData.students || {});
    const assignments = Object.values(classData.assignments || {});

    // Calculate student metrics
    const activeStudents = students.filter((s) => s.isOnline).length;

    // Calculate assignment stats
    const completedAssignments = assignments.filter(
      (a) => a.status === 'completed' || a.status === 'graded'
    ).length;

    // Calculate performance metrics
    let allScores: number[] = [];
    const assignmentStats = assignments.map((assignment) => {
      const studentProgress = students
        .map((s) => s.assignments?.[assignment.id])
        .filter((p) => p && p.status === 'submitted');

      const scores = studentProgress
        .map((p) => p?.percentage)
        .filter((s): s is number => s !== undefined);

      allScores = [...allScores, ...scores];

      return {
        assignmentId: assignment.id,
        testTitle: assignment.testTitle,
        completionRate: students.length > 0
          ? Math.round((studentProgress.length / students.length) * 100)
          : 0,
        averageScore: scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0,
        submissionCount: studentProgress.length,
      };
    });

    return {
      classId,
      className: classData.name,
      totalStudents: students.length,
      activeStudents,
      averageParticipation: assignments.length > 0
        ? Math.round(
          assignmentStats.reduce((sum, a) => sum + a.completionRate, 0) / assignments.length
        )
        : 0,
      totalAssignments: assignments.length,
      completedAssignments,
      averageCompletionRate: assignments.length > 0
        ? Math.round(
          (completedAssignments / assignments.length) * 100
        )
        : 0,
      overallAverageScore: allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0,
      highestScore: allScores.length > 0 ? Math.max(...allScores) : 0,
      lowestScore: allScores.length > 0 ? Math.min(...allScores) : 0,
      assignmentStats,
    };
  } catch (error) {
    console.error('Error getting class statistics:', error);
    return null;
  }
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to class updates
 */
export function subscribeToClass(
  classId: string,
  callback: (classData: ClassSession | null) => void
): () => void {
  const classRef = ref(database, `${CLASSES_REF}/${classId}`);

  const listener = onValue(classRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as ClassSession);
    } else {
      callback(null);
    }
  });

  // Return unsubscribe function
  return () => off(classRef, 'value', listener);
}

/**
 * Subscribe to student updates in a class
 */
export function subscribeToStudents(
  classId: string,
  callback: (students: Record<string, ClassStudent>) => void
): () => void {
  const studentsRef = ref(database, `${CLASSES_REF}/${classId}/students`);

  const listener = onValue(studentsRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });

  return () => off(studentsRef, 'value', listener);
}

/**
 * Subscribe to active sessions for a class
 * NEW: Allows students to see live game sessions linked to this class.
 * Triggers callback with map of sessionCode -> sessionInfo
 */
export function subscribeToActiveSessions(
  classId: string,
  callback: (sessions: Record<string, { mode: string, status: string, createdAt: number }>) => void
): () => void {
  const sessionsRef = ref(database, `${CLASSES_REF}/${classId}/activeSessions`);

  const listener = onValue(sessionsRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });

  return () => off(sessionsRef, 'value', listener);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const classManager = {
  // Class operations
  createClass,
  getClass,
  getClasses,
  updateClassStatus,
  deleteClass,

  // Assignment operations
  assignTestToClass,
  updateAssignmentStatus,
  setActiveAssignment,
  updateModuleProgress,

  // Student operations
  addStudent,
  enrollStudent,
  removeStudentFromClass,
  getStudentClasses,
  updateStudentOnlineStatus,
  startStudentTest,
  submitStudentAnswers,

  // Statistics
  getClassStatistics,

  // Subscriptions
  subscribeToClass,
  subscribeToStudents,
  subscribeToActiveSessions,
};

export default classManager;
