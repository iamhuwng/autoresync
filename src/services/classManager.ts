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
import { ref, set, get, update, onValue, off, query, orderByChild, equalTo } from 'firebase/database';
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
} from '../types/class.types';
import { createTrustedNotification } from './notificationProducerClient';

// ============================================================================
// CONSTANTS
// ============================================================================

const CLASSES_REF = 'classes';
const GAME_SESSIONS_REF = 'game_sessions'; // For backward compatibility
const STUDENT_CLASSES_REF = 'student_classes';

interface StudentClassMembershipRow {
  joinedAt: number;
  status?: ClassStudent['status'];
}

interface EnrollStudentOptions {
  approvalMode?: 'pending' | 'active';
}

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
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['available', 'in_progress']);
const COMPLETED_ASSIGNMENT_STATUSES = new Set(['completed', 'graded']);

function normalizeClassStatus(status: unknown): ClassStatus {
  switch (status) {
    case 'active':
    case 'paused':
    case 'archived':
    case 'deleted':
      return status;
    case 'waiting':
    case 'in-progress':
    case 'inactive':
      return 'active';
    case 'completed':
    case 'results':
      return 'archived';
    default:
      return 'active';
  }
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeClassStudentStatus(
  status: unknown,
): ClassStudent['status'] | undefined {
  return status === 'pending_approval' || status === 'active' || status === 'removed'
    ? status
    : undefined;
}

function normalizeClassStudent(
  studentId: string,
  student: Partial<ClassStudent>,
  fallbackTimestamp: number,
): ClassStudent {
  const joinedAt = normalizeTimestamp(student.joinedAt, fallbackTimestamp);
  const status = normalizeClassStudentStatus(student.status);

  return {
    ...student,
    id: student.id || studentId,
    name: student.name || student.email || student.uid || studentId,
    ...(status ? { status } : {}),
    joinedAt,
    lastActiveAt: normalizeTimestamp(student.lastActiveAt, joinedAt),
    isOnline: typeof student.isOnline === 'boolean' ? student.isOnline : false,
    assignments: student.assignments || {},
  };
}

function normalizeClassStudents(
  students: ClassSession['students'] | undefined,
  fallbackTimestamp: number,
): ClassSession['students'] {
  return Object.fromEntries(
    Object.entries(students || {}).map(([studentId, student]) => [
      studentId,
      normalizeClassStudent(studentId, student, fallbackTimestamp),
    ]),
  );
}

function normalizeClassSession(classId: string, cls: ClassSession): ClassSession {
  const classCode = cls.classCode || classId;
  const createdAt = normalizeTimestamp(cls.createdAt, 0);
  const updatedAt = normalizeTimestamp(cls.updatedAt, createdAt);
  const students = normalizeClassStudents(cls.students, createdAt || updatedAt);
  const assignments = cls.assignments || {};

  return {
    ...cls,
    id: cls.id || classId,
    classCode,
    name: cls.name || classCode,
    status: normalizeClassStatus(cls.status),
    createdAt,
    updatedAt,
    students,
    assignments,
    settings: cls.settings || {
      allowLateJoin: true,
      requireEmail: false,
    },
    stats: cls.stats || {
      totalStudents: Object.keys(students).length,
      activeStudents: Object.values(students).filter((student) =>
        !student.status || student.status === 'active').length,
      totalAssignments: Object.keys(assignments).length,
      completedAssignments: Object.values(assignments).filter(
        (assignment) => COMPLETED_ASSIGNMENT_STATUSES.has(assignment.status),
      ).length,
    },
  };
}

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

function buildClassSummary(classId: string, cls: ClassSession): ClassSummary {
  const normalized = normalizeClassSession(classId, cls);
  return {
    id: normalized.id,
    classCode: normalized.classCode,
    name: normalized.name,
    status: normalized.status,
    createdAt: normalized.createdAt,
    studentCount: Object.keys(normalized.students).length,
    activeAssignments: Object.values(normalized.assignments).filter(
      (assignment) => ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
    ).length,
    completedAssignments: Object.values(normalized.assignments).filter(
      (assignment) => COMPLETED_ASSIGNMENT_STATUSES.has(assignment.status)
    ).length,
  };
}

function buildStudentClassMembershipRow(student: Pick<ClassStudent, 'joinedAt' | 'status'>): StudentClassMembershipRow {
  return {
    joinedAt: student.joinedAt || Date.now(),
    ...(student.status ? { status: student.status } : {}),
  };
}

function isStudentMembershipVisibleToStudent(
  membership?: StudentClassMembershipRow | true | null,
): boolean {
  if (membership === true) {
    return true;
  }

  if (!membership || typeof membership !== 'object') {
    return false;
  }

  return !membership.status || membership.status === 'active';
}

async function cleanupClassBasedCourseEnrollments(
  classId: string,
  studentId: string,
): Promise<void> {
  const enrollmentQuery = query(
    ref(database, 'course_enrollments'),
    orderByChild('studentId'),
    equalTo(studentId)
  );
  const enrollmentSnapshot = await get(enrollmentQuery);

  if (!enrollmentSnapshot.exists()) {
    return;
  }

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

async function getStudentClassesFromMembershipIndex(studentUid: string): Promise<ClassSummary[] | null> {
  const membershipRef = ref(database, `${STUDENT_CLASSES_REF}/${studentUid}`);
  const membershipSnapshot = await get(membershipRef);

  if (!membershipSnapshot.exists()) {
    return null;
  }

  const membershipMap = membershipSnapshot.val() as Record<string, StudentClassMembershipRow | true> | null;
  const classIds = Object.entries(membershipMap || {})
    .filter(([, membership]) => isStudentMembershipVisibleToStudent(membership))
    .map(([classId]) => classId);

  if (!classIds.length) {
    return [];
  }

  const classSnapshots = await Promise.all(
    classIds.map(async (classId) => {
      const classData = await getClass(classId);
      if (!classData || classData.status === 'deleted') {
        return null;
      }

      return buildClassSummary(classId, classData);
    })
  );

  return classSnapshots
    .filter((summary): summary is ClassSummary => summary !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

async function getStudentClassesByLegacyScan(studentUid: string): Promise<ClassSummary[]> {
  const classesRef = ref(database, CLASSES_REF);
  const snapshot = await get(classesRef);

  if (!snapshot.exists()) {
    return [];
  }

  const enrolledClasses: ClassSummary[] = [];
  const data = snapshot.val();

  for (const [id, classData] of Object.entries(data)) {
    const cls = classData as ClassSession;
    const studentEntries = Object.entries(cls.students || {});

    const matchedStudentEntry = studentEntries.find(
      ([key, student]) => student.uid === studentUid || key === studentUid
    );

    if (!matchedStudentEntry) {
      continue;
    }

    const [, matchedStudent] = matchedStudentEntry;
    if (matchedStudent.status === 'pending_approval' || matchedStudent.status === 'removed') {
      continue;
    }

    if (cls.status === 'deleted') {
      continue;
    }

    enrolledClasses.push(buildClassSummary(id, cls));
  }

  return enrolledClasses.sort((left, right) => right.createdAt - left.createdAt);
}

function mergeClassSummaries(...classLists: ClassSummary[][]): ClassSummary[] {
  const merged = new Map<string, ClassSummary>();

  classLists.flat().forEach((summary) => {
    const existing = merged.get(summary.id);
    if (!existing || summary.createdAt > existing.createdAt) {
      merged.set(summary.id, summary);
    }
  });

  return Array.from(merged.values()).sort((left, right) => right.createdAt - left.createdAt);
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
      ...(ownerId ? {
        createdByUserId: ownerId,
        createdBy: ownerId,
        teacherId: ownerId,
      } : {}),
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

    const membershipUpdates: Record<string, unknown> = {
      [`${CLASSES_REF}/${classId}/students/${studentId}`]: null,
      [`${GAME_SESSIONS_REF}/${classId}/players/${studentId}`]: null,
    };

    if (student.uid) {
      membershipUpdates[`${STUDENT_CLASSES_REF}/${student.uid}/${classId}`] = null;
    }

    await update(ref(database), membershipUpdates);

    // Clean up class-based course enrollments for this student
    try {
      await cleanupClassBasedCourseEnrollments(classId, student.uid || studentId);
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
      return normalizeClassSession(classId, snapshot.val() as ClassSession);
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

  try {
    let snapshot;

    if (teacherId) {
      const classesQuery = query(
        ref(database, CLASSES_REF),
        orderByChild('createdBy'),
        equalTo(teacherId)
      );
      snapshot = await get(classesQuery);
    } else {
      const classesRef = ref(database, CLASSES_REF);
      snapshot = await get(classesRef);
    }

    if (!snapshot.exists()) {
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

      classes.push(buildClassSummary(id, cls));
    }

    // Sort by creation date (newest first)
    classes.sort((a, b) => b.createdAt - a.createdAt);

    return classes;
  } catch (error) {
    console.error('Error getting classes:', error);
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
    const classData = await getClass(classId);

    if (!classData) {
      return false;
    }

    const now = Date.now();
    await update(ref(database, `${CLASSES_REF}/${classId}`), {
      status: 'deleted',
      updatedAt: now,
    });

    const projectionUpdates: Record<string, unknown> = {};
    for (const [studentId, student] of Object.entries(classData.students || {})) {
      const membershipStudentId = student.uid || studentId;
      if (!student.uid || membershipStudentId !== studentId) {
        continue;
      }

      projectionUpdates[`${STUDENT_CLASSES_REF}/${membershipStudentId}/${classId}`] = null;
    }

    if (Object.keys(projectionUpdates).length > 0) {
      try {
        await update(ref(database), projectionUpdates);
      } catch (projectionError) {
        console.warn(`[ClassManager] Failed to clean up student class projections for deleted class ${classId}:`, projectionError);
      }
    }

    // Do not update class-backed game_sessions here; old shadow rows may be ownerless and trigger RTDB permission warnings.
    return true;
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
    if ((request as { testType?: string }).testType !== 'test') {
      throw new Error('Retired Quiz assignments are not supported');
    }

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
      testId: request.testId,
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
 * @param options - Enrollment mode. Student self-join uses pending approval; teacher/admin adds can bypass it.
 */
export async function enrollStudent(
  classCode: string,
  studentUid: string,
  studentName: string,
  studentEmail?: string,
  options: EnrollStudentOptions = {}
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
    const approvalMode = options.approvalMode ?? 'pending';
    const status: ClassStudent['status'] = approvalMode === 'active' ? 'active' : 'pending_approval';

    const student: ClassStudent = {
      id: studentUid, // Use UID as student ID for authenticated users
      uid: studentUid, // Store UID for reference
      name: studentName,
      email: studentEmail,
      status,
      joinedAt: now,
      lastActiveAt: now,
      isOnline: true,
      assignments: {},
    };

    await update(ref(database), {
      [`${CLASSES_REF}/${classCode}/students/${studentUid}`]: student,
      [`${GAME_SESSIONS_REF}/${classCode}/players/${studentUid}`]: {
        name: studentName,
        score: 0,
        joinedAt: now,
        uid: studentUid,
      },
      [`${STUDENT_CLASSES_REF}/${studentUid}/${classCode}`]: buildStudentClassMembershipRow(student),
    });

    // Update class stats
    await updateEnrollmentStatsIfAuthorized(classCode, classData, now);

    if (approvalMode === 'active') {
      // Teacher/admin additions are effective immediately.
      try {
        const { autoEnrollStudentInClassCourses } = await import('./enrollmentManager');
        await autoEnrollStudentInClassCourses(classCode, studentUid);
      } catch (e) {
        console.warn('Failed to auto-enroll student in class courses:', e);
      }
    }

    // NOTE: Student-teacher assignment is NOT auto-created here for self-join.
    // Pending self-joins only become student-visible after teacher approval.

    if (approvalMode === 'pending') {
      // PRD-0002: Dashboard feed notification for student
      try {
        await createTrustedNotification({
          producerFamily: 'class',
          authorityRecordId: classCode,
          recipientId: studentUid,
          operationKey: `class-join-pending:student:${classCode}:${studentUid}`,
          type: 'info',
          title: '🏫 Joined Class — Pending Approval',
          message: `You've requested to join ${classData.name || classCode}. Waiting for teacher approval.`,
          link: '/student/dashboard',
        });
      } catch (notifError) {
        console.warn('⚠️ [ClassManager] Failed to send join-class notification (non-blocking):', notifError);
      }

      // Notify the class owner (teacher) about the pending student
      try {
        const teacherId = classData.createdBy;
        if (teacherId && teacherId !== 'unknown') {
          await createTrustedNotification({
            producerFamily: 'class',
            authorityRecordId: classCode,
            recipientId: teacherId,
            operationKey: `class-join-pending:teacher:${classCode}:${studentUid}`,
            type: 'info',
            title: '👋 New Student Request',
            message: `${studentName} wants to join your class "${classData.name || classCode}". Review in class management.`,
            link: `/teacher/classes/${classCode}`,
          });
        }
      } catch (notifError) {
        console.warn('⚠️ [ClassManager] Failed to send teacher notification (non-blocking):', notifError);
      }
    } else {
      try {
        await createTrustedNotification({
          producerFamily: 'class',
          authorityRecordId: classCode,
          recipientId: studentUid,
          operationKey: `class-join-active:${classCode}:${studentUid}`,
          type: 'success',
          title: '✅ Added to Class',
          message: `You've been added to ${classData.name || classCode}.`,
          link: '/student/dashboard',
        });
      } catch (notifError) {
        console.warn('⚠️ [ClassManager] Failed to send active enrollment notification (non-blocking):', notifError);
      }
    }

    return { success: true, classId: classCode };
  } catch (error) {
    console.error('Error enrolling student:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Approve a pending student in a class.
 * Updates their status to 'active' and creates the student-teacher assignment.
 * Must be called by the class owner (teacher) who has write permission.
 */
export async function approveClassStudent(
  classCode: string,
  studentId: string,
  teacherId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify class exists
    const classData = await getClass(classCode);
    if (!classData) {
      return { success: false, error: 'Class not found' };
    }

    // Verify student exists in class
    const student = classData.students?.[studentId];
    if (!student) {
      return { success: false, error: 'Student not found in this class' };
    }

    await update(ref(database), {
      [`${CLASSES_REF}/${classCode}/students/${studentId}/status`]: 'active',
      [`${STUDENT_CLASSES_REF}/${studentId}/${classCode}`]: buildStudentClassMembershipRow({
        joinedAt: student.joinedAt,
        status: 'active',
      }),
    });

    try {
      const { autoEnrollStudentInClassCourses } = await import('./enrollmentManager');
      await autoEnrollStudentInClassCourses(classCode, student.uid || studentId);
    } catch (autoEnrollError) {
      console.warn('⚠️ [ClassManager] Failed to auto-enroll approved student in class courses:', autoEnrollError);
    }

    // Create student-teacher assignment (teacher is the authenticated user, so they have write permission)
    try {
      const { createAssignment } = await import('./assignmentManager');
      const assignResult = await createAssignment(studentId, teacherId, teacherId);
      if (!assignResult.success && !assignResult.error?.includes('already exists')) {
        console.warn(`⚠️ [ClassManager] Assignment creation issue: ${assignResult.error}`);
      }
    } catch (assignError) {
      console.warn('⚠️ [ClassManager] Failed to create assignment during approval (non-blocking):', assignError);
    }

    // Notify the student
    try {
      await createTrustedNotification({
        producerFamily: 'class',
        authorityRecordId: classCode,
        recipientId: studentId,
        operationKey: `class-join-approved:${classCode}:${studentId}`,
        type: 'success',
        title: '✅ Approved!',
        message: `You've been approved to join ${classData.name || classCode}.`,
        link: '/student/dashboard',
      });
    } catch (notifError) {
      console.warn('⚠️ [ClassManager] Failed to send approval notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error approving student:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Reject a pending student from a class.
 * Removes the student from the class roster.
 */
export async function rejectClassStudent(
  classCode: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify class exists
    const classData = await getClass(classCode);
    if (!classData) {
      return { success: false, error: 'Class not found' };
    }

    const student = classData.students?.[studentId];
    if (!student) {
      return { success: false, error: 'Student not found in this class' };
    }

    try {
      await cleanupClassBasedCourseEnrollments(classCode, student.uid || studentId);
    } catch (cleanupError) {
      console.warn(`[ClassManager] Failed to clean up stale class-based enrollments for rejected student ${studentId}:`, cleanupError);
    }

    await update(ref(database), {
      [`${CLASSES_REF}/${classCode}/students/${studentId}`]: null,
      [`${GAME_SESSIONS_REF}/${classCode}/players/${studentId}`]: null,
      [`${STUDENT_CLASSES_REF}/${studentId}/${classCode}`]: null,
    });

    // Notify the student
    try {
      await createTrustedNotification({
        producerFamily: 'class',
        authorityRecordId: classCode,
        recipientId: studentId,
        operationKey: `class-join-rejected:${classCode}:${studentId}`,
        type: 'info',
        title: '❌ Request Declined',
        message: `Your request to join ${classData.name || classCode} was not approved.`,
        link: '/student/dashboard',
      });
    } catch (notifError) {
      console.warn('⚠️ [ClassManager] Failed to send rejection notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error rejecting student:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get all classes a student is enrolled in
 * @param studentUid - The authenticated student's UID
 */
export async function getStudentClasses(studentUid: string): Promise<ClassSummary[]> {
  try {
    const indexedClasses = await getStudentClassesFromMembershipIndex(studentUid);
    if (indexedClasses === null) {
      return getStudentClassesByLegacyScan(studentUid);
    }

    const scannedClasses = await getStudentClassesByLegacyScan(studentUid);
    const mergedClasses = mergeClassSummaries(indexedClasses, scannedClasses);

    if (mergedClasses.length !== indexedClasses.length) {
      console.warn(
        `[Courses DEBUG] getStudentClasses: membership index was incomplete for uid="${studentUid}" ` +
        `(${indexedClasses.length} indexed vs ${mergedClasses.length} merged)`
      );
    }

    return mergedClasses;
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
      callback(normalizeClassSession(classId, snapshot.val() as ClassSession));
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
 * Subscribe to the student-owned class membership projection.
 * Used by the student shell to refresh downstream class-dependent data.
 */
export function subscribeToStudentClasses(
  studentUid: string,
  callback: (memberships: Record<string, StudentClassMembershipRow | true>) => void
): () => void {
  const membershipRef = ref(database, `${STUDENT_CLASSES_REF}/${studentUid}`);

  const listener = onValue(membershipRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });

  return () => off(membershipRef, 'value', listener);
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
  subscribeToStudentClasses,
  subscribeToActiveSessions,
};

export default classManager;
