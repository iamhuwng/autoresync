/**
 * Session Manager (Hybrid Architecture)
 * 
 * INTERNAL: Uses class-based multi-test/quiz architecture
 * EXTERNAL: Maintains backward-compatible session API
 * 
 * Key Features:
 * - Auto-migrates old sessions to new format on read
 * - Provides compatibility fields for legacy code
 * - Supports both single-test (old) and multi-test (new) workflows
 * - Zero breaking changes to existing code
 */

import { ref, set, get, update, remove, onValue, serverTimestamp } from 'firebase/database';
import { database } from './firebase';
import queryOptimizer from './firebaseQueryOptimizer';
import { generateUniqueCode, validateCode, normalizeCode } from './sessionCodeService';
import {
  normalizeSessionData,
  addCompatibilityFields,
  isOldFormat,
  getStudentAssignment as getStudentAssignmentHelper
} from './sessionHelpers';

// Session expiration time (24 hours in milliseconds)
const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Session status enum
 */
export const SessionStatus = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
};

/**
 * Session mode enum
 */
export const SessionMode = {
  QUIZ: 'quiz',
  TEST: 'test',
};

/**
 * Create a new session with a unique session code
 * HYBRID ARCHITECTURE: Creates new class-based structure with compatibility layer
 * 
 * @param {Object} options - Session creation options
 * @param {string} options.quizId - ID of the quiz (for quiz mode)
 * @param {string} options.testId - ID of the test (for test mode)
 * @param {string} options.mode - Session mode ('quiz' or 'test') [DEPRECATED in favor of multi-test]
 * @param {Object} options.settings - Additional session settings
 * @param {string} options.classId - Optional class ID to link this session to
 * @param {string} options.courseId - Optional course ID to tag this session with
 * @param {string} options.moduleId - Optional module ID to tag this session with
 * @returns {Promise<Object>} Created session data with code
 * @throws {Error} If session creation fails
 */
export async function createSession({ quizId, testId, mode = SessionMode.QUIZ, settings = {}, classId = null, courseId = null, moduleId = null, createdBy = null }) {
  try {
    // Allow creating sessions without content (content selected later by teacher)
    const contentId = mode === SessionMode.TEST ? testId : quizId;
    const hasContent = contentId && contentId !== 'pending';

    if (!Object.values(SessionMode).includes(mode)) {
      throw new Error(`Invalid session mode: ${mode}`);
    }

    // Generate unique session code
    const sessionCode = await generateUniqueCode();

    // Generate unique teacher ID for tracking (kept for legacy compatibility)
    const teacherId = `teacher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const now = Date.now();

    // ═══════════════════════════════════════════════════════════
    // NEW HYBRID STRUCTURE (Internal: Class, External: Session)
    // ═══════════════════════════════════════════════════════════

    const sessionData = {
      // External fields (backward compatible)
      sessionCode,
      status: SessionStatus.WAITING,
      createdAt: now,
      expiresAt: now + SESSION_EXPIRATION_MS,
      updatedAt: now,

      // NEW: Class semantics (internal)
      className: `Class ${sessionCode}`, // UI will display as "Class ABC123"
      teacherId, // Legacy tracking ID

      // NEW: Actual user UID for ownership filtering (Phase 6+)
      createdByUserId: createdBy || null, // The actual Firebase Auth UID of the creator

      linkedClassId: classId, // Store the real class ID if provided

      // NEW: Course context (Phase 6)
      courseId: courseId || null,
      moduleId: moduleId || null,

      // NEW: Multi-test/quiz structure (empty initially)
      activeTests: {},
      activeQuizzes: {},

      // NEW: Students (replaces "players" concept)
      students: {},

      // NEW: Banned students
      bannedStudents: {},

      // Settings
      settings: {
        autoAdvance: settings.autoAdvance !== false,
        allowLateJoin: settings.allowLateJoin !== false,
        showLeaderboard: settings.showLeaderboard !== false,
        autoArchiveDays: 90,
        // Phase 6: Restrict session to class members (default ON for course-linked sessions)
        restrictToClassMembers: settings.restrictToClassMembers !== undefined
          ? settings.restrictToClassMembers
          : (classId !== null), // Auto-enable if linked to a class
        ...settings,
      },

      // ═══════════════════════════════════════════════════════════
      // COMPATIBILITY FIELDS (for old code)
      // ═══════════════════════════════════════════════════════════
      mode, // Deprecated but kept for compatibility
      currentQuestionIndex: 0, // For quiz mode
      isPaused: false,
      players: {}, // Alias for students (kept for backward compatibility)
      bannedPlayers: {}, // Alias for bannedStudents
    };

    // If content provided, add it to compatibility fields
    if (hasContent) {
      if (mode === SessionMode.TEST) {
        sessionData.testId = contentId;
      } else {
        sessionData.quizId = contentId;
      }
    }

    // Save to Firebase under game_sessions/{sessionCode}
    const updates = {};
    updates[`game_sessions/${sessionCode}`] = sessionData;

    // If linked to a class, add to classes/{classId}/activeSessions
    if (classId) {
      updates[`classes/${classId}/activeSessions/${sessionCode}`] = {
        mode,
        status: SessionStatus.WAITING,
        createdAt: now,
        expiresAt: now + SESSION_EXPIRATION_MS
      };
    }

    await update(ref(database), updates);

    // Store teacher ID locally for tracking only (not for blocking)
    sessionStorage.setItem(`teacherId_${sessionCode}`, teacherId);

    // Also store in Firebase for cross-device access
    await set(ref(database, `teacher_sessions/${teacherId}`), {
      sessionCode,
      createdAt: now,
      device: navigator.userAgent
    });

    console.log(`✅ [Session] Created: ${sessionCode} (hybrid structure)`);
    console.log(`   Mode: ${mode}, Content: ${hasContent ? contentId : 'none yet'}`);
    console.log(`   Internal: Class-based, External: Session-compatible`);
    if (classId) console.log(`   Linked to Class: ${classId}`);
    if (courseId) console.log(`   Course Context: ${courseId}${moduleId ? ` / Module: ${moduleId}` : ''}`);

    // Fire-and-forget: notify enrolled class students that a new session is available
    if (classId) {
      const sessionMode = mode === SessionMode.TEST ? 'test' : 'quiz';
      import('./notificationService').then(({ sendSessionOpenedNotifications }) => {
        // Optionally fetch className for a better message
        get(ref(database, `classes/${classId}/name`)).then(snap => {
          const className = snap.exists() ? snap.val() : undefined;
          sendSessionOpenedNotifications(classId, sessionCode, sessionMode, className)
            .catch(err => console.warn('[Session] Feed notification failed (non-blocking):', err));
        }).catch(() => {
          sendSessionOpenedNotifications(classId, sessionCode, sessionMode)
            .catch(err => console.warn('[Session] Feed notification failed (non-blocking):', err));
        });
      }).catch(err => console.warn('[Session] Could not load notificationService:', err));
    }

    return {
      success: true,
      sessionCode,
      teacherId,
      session: sessionData,
    };
  } catch (error) {
    console.error('❌ Session creation failed:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }
}

/**
 * Get session data by session code
 * AUTO-MIGRATES old format to new hybrid structure
 * 
 * @param {string} sessionCode - The session code
 * @returns {Promise<Object|null>} Session data or null if not found
 */
export async function getSession(sessionCode) {
  try {
    // Normalize and validate code
    const normalizedCode = normalizeCode(sessionCode);
    if (!validateCode(normalizedCode)) {
      return null;
    }

    const sessionRef = ref(database, `game_sessions/${normalizedCode}`);
    const snapshot = await get(sessionRef);

    if (!snapshot.exists()) {
      return null;
    }

    let session = snapshot.val();

    // AUTO-MIGRATION: Normalize session data (converts old format if needed)
    session = normalizeSessionData(session);

    // Check if session is expired
    if (session.expiresAt && Date.now() > session.expiresAt) {
      console.warn(`⚠️ Session ${normalizedCode} has expired`);
      // Mark as expired (but don't delete yet - allows viewing results)
      if (session.status !== SessionStatus.EXPIRED) {
        await updateSessionStatus(normalizedCode, SessionStatus.EXPIRED);
        session.status = SessionStatus.EXPIRED;
      }
    }

    return session;
  } catch (error) {
    console.error('Error fetching session:', error);
    return null;
  }
}

/**
 * Check if a session exists and is valid for joining
 * 
 * @param {string} sessionCode - The session code to validate
 * @returns {Promise<Object>} Validation result with success flag and message
 */
export async function validateSessionForJoin(sessionCode) {
  const normalizedCode = normalizeCode(sessionCode);

  // Check format
  if (!validateCode(normalizedCode)) {
    return {
      valid: false,
      message: 'Invalid session code format. Please check and try again.',
    };
  }

  // Check if exists
  const session = await getSession(normalizedCode);
  if (!session) {
    return {
      valid: false,
      message: 'Session not found. Please check the code with your teacher.',
    };
  }

  // Check if expired
  if (session.status === SessionStatus.EXPIRED) {
    return {
      valid: false,
      message: 'This session has expired. Please contact your teacher.',
    };
  }

  // Check if completed
  if (session.status === SessionStatus.COMPLETED) {
    return {
      valid: false,
      message: 'This session has already ended.',
    };
  }

  // Check if late join is allowed
  if (session.status === SessionStatus.IN_PROGRESS && !session.settings?.allowLateJoin) {
    return {
      valid: false,
      message: 'This session has already started and is not accepting new players.',
    };
  }

  // Note: No ownership check - teachers can access from multiple devices
  // This function is for students joining, not teachers

  return {
    valid: true,
    session,
  };
}

/**
 * Validate if a guest (anonymous) user can join a session
 * Checks both general session validity and allowAnonymous setting
 * 
 * @param {string} sessionCode - The session code to validate
 * @returns {Promise<Object>} Validation result with success flag and message
 */
export async function validateGuestJoin(sessionCode) {
  // First check general session validity
  const baseValidation = await validateSessionForJoin(sessionCode);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  const session = baseValidation.session;

  // Check if anonymous/guest access is allowed
  if (session.settings?.allowAnonymous === false) {
    return {
      valid: false,
      message: 'This session requires authentication. Please log in to join.',
    };
  }

  return {
    valid: true,
    session,
  };
}

/**
 * Validate if a student can join a restricted session (Phase 6)
 * Checks if session is restricted to class members and validates student enrollment
 * 
 * @param {string} sessionCode - The session code to validate
 * @param {string} studentId - The student's user ID
 * @returns {Promise<Object>} Validation result with success flag and message
 */
export async function validateStudentClassMembership(sessionCode, studentId) {
  try {
    // First check general session validity
    const baseValidation = await validateSessionForJoin(sessionCode);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const session = baseValidation.session;

    // If session is not restricted, allow join
    if (!session.settings?.restrictToClassMembers) {
      return {
        valid: true,
        session,
      };
    }

    // If restricted but no class linked, deny (misconfiguration)
    if (!session.linkedClassId) {
      return {
        valid: false,
        message: 'This session has access restrictions but is not properly configured.',
      };
    }

    // Check if student is enrolled in the linked class
    const { getEnrollmentsByStudent } = await import('./enrollmentManager');
    const enrollments = await getEnrollmentsByStudent(studentId);

    const isEnrolled = enrollments.some(
      enrollment => enrollment.classId === session.linkedClassId && enrollment.status === 'active'
    );

    if (!isEnrolled) {
      // Get class name for better error message
      const classRef = ref(database, `classes/${session.linkedClassId}`);
      const classSnapshot = await get(classRef);
      const className = classSnapshot.exists() ? classSnapshot.val().name : 'this class';

      return {
        valid: false,
        message: `This session is for ${className} students only. Please contact your teacher if you believe this is an error.`,
      };
    }

    return {
      valid: true,
      session,
    };
  } catch (error) {
    console.error('Error validating student class membership:', error);
    return {
      valid: false,
      message: 'Unable to validate session access. Please try again.',
    };
  }
}

/**
 * Update session status
 * 
 * @param {string} sessionCode - The session code
 * @param {string} newStatus - New status (waiting, in-progress, completed, expired)
 * @returns {Promise<void>}
 */
export async function updateSessionStatus(sessionCode, newStatus) {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await update(sessionRef, {
      status: newStatus,
      updatedAt: Date.now(),
    });

    console.log(`✅ Session ${sessionCode} status updated to: ${newStatus}`);
  } catch (error) {
    console.error(`Error updating session status:`, error);
    throw error;
  }
}

/**
 * End a session (mark as completed)
 * 
 * @param {string} sessionCode - The session code
 * @param {Object} finalData - Optional final data to save (scores, results, etc.)
 * @returns {Promise<void>}
 */
export async function endSession(sessionCode, finalData = {}) {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);

    if (!snapshot.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = snapshot.val();
    const updates = {};

    // Update session status
    updates[`game_sessions/${sessionCode}/status`] = SessionStatus.COMPLETED;
    updates[`game_sessions/${sessionCode}/completedAt`] = Date.now();

    // Merge final data
    Object.keys(finalData).forEach(key => {
      updates[`game_sessions/${sessionCode}/${key}`] = finalData[key];
    });

    // If linked to a class, remove from classes/{classId}/activeSessions
    if (sessionData.linkedClassId) {
      updates[`classes/${sessionData.linkedClassId}/activeSessions/${sessionCode}`] = null;
    }

    await update(ref(database), updates);

    console.log(`✅ Session ${sessionCode} ended`);
  } catch (error) {
    console.error(`Error ending session:`, error);
    throw error;
  }
}

/**
 * Delete a session completely (cleanup)
 * 
 * @param {string} sessionCode - The session code
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionCode) {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);

    if (snapshot.exists()) {
      const sessionData = snapshot.val();

      // If linked to a class, remove from classes/{classId}/activeSessions
      if (sessionData.linkedClassId) {
        const classRef = ref(database, `classes/${sessionData.linkedClassId}/activeSessions/${sessionCode}`);
        await remove(classRef);
      }
    }

    await remove(sessionRef);

    console.log(`🗑️ Session ${sessionCode} deleted`);
  } catch (error) {
    console.error(`Error deleting session:`, error);
    throw error;
  }
}

/**
 * Get all active sessions (waiting or in-progress)
 * Useful for teacher dashboard
 * 
 * @returns {Promise<Array>} Array of active session objects
 */
export async function getActiveSessions() {
  try {
    return await queryOptimizer.getAllActiveSessions();
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    return [];
  }
}

/**
 * Cleanup expired sessions (run periodically)
 * Marks sessions as expired if past expiration time
 * 
 * @param {boolean} deleteExpired - Whether to delete expired sessions or just mark them
 * @returns {Promise<Object>} Cleanup results
 */
export async function cleanupExpiredSessions(deleteExpired = false) {
  try {
    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);

    if (!snapshot.exists()) {
      return { marked: 0, deleted: 0 };
    }

    const sessionsData = snapshot.val();
    const now = Date.now();
    let markedCount = 0;
    let deletedCount = 0;

    // Process each session
    for (const [sessionCode, sessionData] of Object.entries(sessionsData)) {
      if (sessionData.expiresAt && now > sessionData.expiresAt) {
        if (deleteExpired) {
          // Delete the session completely
          await deleteSession(sessionCode);
          deletedCount++;
        } else {
          // Just mark as expired
          if (sessionData.status !== SessionStatus.EXPIRED) {
            await updateSessionStatus(sessionCode, SessionStatus.EXPIRED);
            markedCount++;
          }
        }
      }
    }

    console.log(`🧹 Cleanup complete: ${markedCount} marked, ${deletedCount} deleted`);

    return { marked: markedCount, deleted: deletedCount };
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    throw error;
  }
}

/**
 * Subscribe to session updates in real-time
 * Returns an unsubscribe function
 * 
 * @param {string} sessionCode - The session code
 * @param {Function} callback - Callback function (receives session data)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSession(sessionCode, callback) {
  const sessionRef = ref(database, `game_sessions/${sessionCode}`);

  const unsubscribe = onValue(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });

  return unsubscribe;
}

/**
 * Extend session expiration time
 * Useful if teacher wants to continue a session
 * 
 * @param {string} sessionCode - The session code
 * @param {number} additionalHours - Hours to add (default: 24)
 * @returns {Promise<void>}
 */
export async function extendSession(sessionCode, additionalHours = 24) {
  try {
    const session = await getSession(sessionCode);
    if (!session) {
      throw new Error('Session not found');
    }

    const additionalMs = additionalHours * 60 * 60 * 1000;
    const newExpiresAt = session.expiresAt + additionalMs;

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await update(sessionRef, {
      expiresAt: newExpiresAt,
      extendedAt: Date.now(),
    });

    console.log(`⏰ Session ${sessionCode} extended by ${additionalHours} hours`);
  } catch (error) {
    console.error('Error extending session:', error);
    throw error;
  }
}

/**
 * Check if current user is the owner of a session
 * @param {string} sessionCode - The session code to check
 * @returns {boolean} True if current user is owner or if ownership not tracked
 */
export function isSessionOwner(sessionCode) {
  // Check if we have a teacher ID stored for this session
  const storedTeacherId = sessionStorage.getItem(`teacherId_${sessionCode}`);

  // If we have a teacher ID, we're the owner
  // If we don't have one, allow access (for multi-device support)
  // This allows the same teacher to access from different devices
  // while still preventing students from accidentally accessing teacher pages
  return storedTeacherId !== null || window.location.pathname.includes('/teacher');
}

/**
 * Get the teacher ID for a session if current user is owner
 * @param {string} sessionCode - The session code
 * @returns {string|null} Teacher ID if owner, null otherwise
 */
export function getSessionTeacherId(sessionCode) {
  // Still store locally for tracking, but don't block access
  return sessionStorage.getItem(`teacherId_${sessionCode}`);
}

/**
 * Calculate session statistics from existing session data (OPTIMIZED - no re-fetch)
 * Use this when you already have session data to avoid redundant Firebase queries
 * 
 * @param {Object} session - The session data object
 * @param {string} sessionCode - The session code
 * @returns {Object} Session statistics
 */
export function calculateSessionStatsFromData(session, sessionCode) {
  if (!session) {
    return null;
  }

  const players = session.players || {};
  const playerCount = Object.keys(players).length;
  const bannedCount = Object.keys(session.bannedPlayers || {}).length;

  return {
    sessionCode,
    mode: session.mode,
    status: session.status,
    playerCount,
    bannedCount,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    isExpired: Date.now() > session.expiresAt,
    currentQuestion: session.currentQuestionIndex,
  };
}

/**
 * Get session statistics (player count, status, etc.)
 * ⚠️ WARNING: This re-fetches session data. Use calculateSessionStatsFromData() if you already have the session.
 * 
 * @param {string} sessionCode - The session code
 * @returns {Promise<Object>} Session statistics
 */
export async function getSessionStats(sessionCode) {
  try {
    const session = await getSession(sessionCode);
    return calculateSessionStatsFromData(session, sessionCode);
  } catch (error) {
    console.error('Error fetching session stats:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NEW MULTI-TEST/QUIZ ASSIGNMENT FUNCTIONS (Hybrid Architecture)
// ═══════════════════════════════════════════════════════════════════

/**
 * Assign a test to specific students in a session
 * NEW FUNCTIONALITY for multi-test support
 * 
 * @param {string} sessionCode - The session code
 * @param {string} testId - ID of the test to assign
 * @param {string[]} studentIds - Array of student IDs to assign
 * @param {Object} options - Assignment options
 * @returns {Promise<string>} Assignment ID
 */
export async function assignTestToStudents(sessionCode, testId, studentIds, options = {}) {
  try {
    const session = await getSession(sessionCode);
    if (!session) {
      throw new Error('Session not found');
    }

    const now = Date.now();
    const assignmentId = `${testId}_${now}`;

    // Create test assignment
    const assignment = {
      assignmentId,
      testId,
      assignedStudents: studentIds,
      status: 'waiting',
      assignedAt: now,
      startTime: null,
      duration: options.duration || 60,
      isPaused: false,
      pausedAt: null,
      pausedDuration: 0,
    };

    // Task 9.6: Version pinning for THCS-THPT tests
    // Load test data and check if it's THCS — if so, cache the version
    try {
      const testDataRef = ref(database, `tests/${testId}`);
      const testSnapshot = await get(testDataRef);
      if (testSnapshot.exists()) {
        const testData = testSnapshot.val();
        if (testData.testType === 'THCS-THPT') {
          // Determine versionKey from latest changelog entry
          const changelog = testData._changelog || {};
          const changelogKeys = Object.keys(changelog).sort();
          const latestKey = changelogKeys.length > 0 ? changelogKeys[changelogKeys.length - 1] : 'v_initial';

          // Cache full test data (without _changelog to save space)
          const cachedVersion = { ...testData };
          delete cachedVersion._changelog;

          assignment.versionKey = latestKey;
          assignment._cachedVersion = cachedVersion;

          console.log(`📌 [Session] THCS version pinned: ${latestKey} for testId ${testId}`);
        }
      }
    } catch (pinErr) {
      // Non-blocking: if pinning fails, assignment still works (students read live data)
      console.warn('⚠️ [Session] Version pinning failed (non-blocking):', pinErr);
    }

    // Prepare updates
    const updates = {};

    // Add assignment to activeTests
    updates[`activeTests/${assignmentId}`] = assignment;

    // Update student assignments
    studentIds.forEach(studentId => {
      if (session.students && session.students[studentId]) {
        updates[`students/${studentId}/assignedTestId`] = testId;
      }
    });

    // Update session
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await update(sessionRef, updates);

    console.log(`✅ [Session] Test assigned: ${testId} to ${studentIds.length} students`);

    return assignmentId;
  } catch (error) {
    console.error('❌ Error assigning test:', error);
    throw error;
  }
}

/**
 * Assign a quiz to specific students in a session
 * NEW FUNCTIONALITY for multi-quiz support
 * 
 * @param {string} sessionCode - The session code
 * @param {string} quizId - ID of the quiz to assign
 * @param {string[]} studentIds - Array of student IDs to assign
 * @param {Object} options - Assignment options
 * @returns {Promise<string>} Assignment ID
 */
export async function assignQuizToStudents(sessionCode, quizId, studentIds, options = {}) {
  try {
    const session = await getSession(sessionCode);
    if (!session) {
      throw new Error('Session not found');
    }

    const now = Date.now();
    const assignmentId = `${quizId}_${now}`;

    // Create quiz assignment
    const assignment = {
      assignmentId,
      quizId,
      assignedStudents: studentIds,
      status: 'waiting',
      assignedAt: now,
      startTime: null,
      currentQuestionIndex: 0,
      isPaused: false,
    };

    // Prepare updates
    const updates = {};

    // Add assignment to activeQuizzes
    updates[`activeQuizzes/${assignmentId}`] = assignment;

    // Update student assignments
    studentIds.forEach(studentId => {
      if (session.students && session.students[studentId]) {
        updates[`students/${studentId}/assignedQuizId`] = quizId;
      }
    });

    // Update session
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await update(sessionRef, updates);

    console.log(`✅ [Session] Quiz assigned: ${quizId} to ${studentIds.length} students`);

    return assignmentId;
  } catch (error) {
    console.error('❌ Error assigning quiz:', error);
    throw error;
  }
}

/**
 * Start a test assignment (set status to in-progress)
 * NEW FUNCTIONALITY for multi-test support
 * 
 * @param {string} sessionCode - The session code
 * @param {string} assignmentId - The assignment ID
 * @returns {Promise<void>}
 */
export async function startTestAssignment(sessionCode, assignmentId) {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await update(sessionRef, {
      [`activeTests/${assignmentId}/status`]: 'in-progress',
      [`activeTests/${assignmentId}/startTime`]: Date.now(),
      [`activeTests/${assignmentId}/isPaused`]: false,
    });

    console.log(`✅ [Session] Test assignment started: ${assignmentId}`);
  } catch (error) {
    console.error('❌ Error starting test assignment:', error);
    throw error;
  }
}

/**
 * Get student's assigned content (test or quiz)
 * NEW FUNCTIONALITY for multi-test routing
 * 
 * @param {string} sessionCode - The session code
 * @param {string} studentId - The student ID
 * @returns {Promise<Object|null>} {type: 'test'|'quiz', id: string} or null
 */
export async function getStudentAssignment(sessionCode, studentId) {
  try {
    const session = await getSession(sessionCode);
    if (!session) return null;

    // Use static imported helper function
    return getStudentAssignmentHelper(session, studentId);
  } catch (error) {
    console.error('❌ Error getting student assignment:', error);
    return null;
  }
}
