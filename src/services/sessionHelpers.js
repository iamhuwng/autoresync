/**
 * Session Helper Utilities
 * Internal helpers for hybrid session/class architecture
 * 
 * These functions handle:
 * - Auto-migration from old to new format
 * - Compatibility layer generation
 * - Format detection
 */

/**
 * Detect if session data is in new class format
 * @param {Object} sessionData - Session data to check
 * @returns {boolean} True if new format
 */
export function isNewFormat(sessionData) {
  return !!(
    sessionData &&
    sessionData.activeTests &&
    typeof sessionData.students === 'object'
  );
}

/**
 * Detect if session data is in old format
 * @param {Object} sessionData - Session data to check
 * @returns {boolean} True if old format
 */
export function isOldFormat(sessionData) {
  return !!(
    sessionData &&
    (sessionData.testId || sessionData.quizId) &&
    sessionData.players &&
    !sessionData.activeTests
  );
}

/**
 * Convert old session format to new class format
 * Maintains backward compatibility while enabling new features
 * 
 * @param {Object} oldSession - Old format session data
 * @returns {Object} New format session data with compatibility fields
 */
export function migrateToNewFormat(oldSession) {
  console.log('🔄 [Migration] Converting old session format to new class format');
  
  const now = Date.now();
  const sessionCode = oldSession.sessionCode;
  
  // Initialize new structure
  const newSession = {
    // Keep external fields
    sessionCode,
    status: oldSession.status,
    createdAt: oldSession.createdAt,
    expiresAt: oldSession.expiresAt,
    updatedAt: oldSession.updatedAt || now,
    settings: oldSession.settings || {},
    
    // NEW: Class semantics
    className: oldSession.className || `Class ${sessionCode}`,
    teacherId: oldSession.teacherId || `teacher_migrated_${now}`,
    
    // NEW: Empty multi-test structure
    activeTests: {},
    
    // NEW: Convert players to students
    students: {},
    
    // Keep banned players
    bannedStudents: oldSession.bannedPlayers || {},
    
    // Compatibility fields (deprecated but present)
    mode: oldSession.mode,
    testId: oldSession.testId || null,
    quizId: oldSession.quizId || null,
    players: {}, // Will be alias
    bannedPlayers: oldSession.bannedPlayers || {},
    
    // Keep quiz-specific fields
    currentQuestionIndex: oldSession.currentQuestionIndex,
    isPaused: oldSession.isPaused,
  };
  
  // Convert players to students
  if (oldSession.players) {
    Object.entries(oldSession.players).forEach(([playerId, playerData]) => {
      newSession.students[playerId] = {
        studentId: playerId,
        studentName: playerData.name || 'Unknown',
        joinedAt: playerData.joinedAt || oldSession.createdAt,
        lastActivity: playerData.lastActivity || now,
        isConnected: playerData.isConnected !== false,
        answers: playerData.answers || {},
        isSubmitted: playerData.isSubmitted || false,
        submittedAt: playerData.submittedAt,
        score: playerData.score,
        
        // Assignment tracking (initially null)
        assignedTestId: null,
      };
      
      // Keep players as alias
      newSession.players[playerId] = playerData;
    });
  }
  
  // If there's a testId, create an assignment for all students
  if (oldSession.testId) {
    const assignmentId = `${oldSession.testId}_migrated_${now}`;
    const studentIds = Object.keys(newSession.students);
    
    newSession.activeTests[assignmentId] = {
      assignmentId,
      testId: oldSession.testId,
      assignedStudents: studentIds,
      status: oldSession.status === 'in-progress' ? 'in-progress' : 'waiting',
      assignedAt: oldSession.createdAt,
      startTime: oldSession.startTime || null,
      duration: 60, // Default
      isPaused: oldSession.isPaused || false,
      pausedAt: oldSession.pausedAt,
      pausedDuration: oldSession.pausedDuration || 0,
    };
    
    // Assign all students to this test
    studentIds.forEach(studentId => {
      newSession.students[studentId].assignedTestId = oldSession.testId;
    });
  }
  
  console.log('✅ [Migration] Conversion complete');
  return newSession;
}

/**
 * Add compatibility fields to new format session
 * Ensures old code can still access expected fields
 * 
 * @param {Object} session - New format session
 * @returns {Object} Session with compatibility fields added
 */
export function addCompatibilityFields(session) {
  if (!session) return session;
  
  // If already has compatibility, return as-is
  if (session.mode && session.testId) {
    return session;
  }
  
  // Derive mode from active tests
  const hasActiveTests = session.activeTests && Object.keys(session.activeTests).length > 0;
  
  if (hasActiveTests) {
    session.mode = 'test';
    // Set testId to first active test
    const firstTest = Object.values(session.activeTests)[0];
    session.testId = firstTest?.testId || null;
  } else {
    // No active content
    session.mode = session.mode || 'test';
    session.testId = null;
  }
  
  // Add players as alias for students
  if (session.students && !session.players) {
    session.players = {};
    Object.entries(session.students).forEach(([studentId, student]) => {
      session.players[studentId] = {
        name: student.studentName,
        joinedAt: student.joinedAt,
        answers: student.answers || {},
        score: student.score,
        isSubmitted: student.isSubmitted,
        submittedAt: student.submittedAt,
        isConnected: student.isConnected,
        lastActivity: student.lastActivity,
        ip: student.ip || 'unknown',
      };
    });
  }
  
  // Add bannedPlayers as alias for bannedStudents
  if (session.bannedStudents && !session.bannedPlayers) {
    session.bannedPlayers = session.bannedStudents;
  }
  
  return session;
}

/**
 * Get student's assigned test from session
 * Handles both old and new formats
 * 
 * @param {Object} session - Session data
 * @param {string} studentId - Student ID
 * @returns {Object|null} {type: 'test', id: string} or null
 */
export function getStudentAssignment(session, studentId) {
  if (!session || !studentId) return null;
  
  // New format
  if (session.students && session.students[studentId]) {
    const student = session.students[studentId];
    if (student.assignedTestId) {
      return { type: 'test', id: student.assignedTestId };
    }
    return null;
  }
  
  // Old format fallback
  if (session.testId) {
    return { type: 'test', id: session.testId };
  }
  return null;
}

/**
 * Normalize session data on read
 * Auto-migrates old format and ensures compatibility fields
 * 
 * @param {Object} sessionData - Raw session data from Firebase
 * @returns {Object} Normalized session data
 */
export function normalizeSessionData(sessionData) {
  if (!sessionData) return null;
  
  // If old format, migrate
  if (isOldFormat(sessionData)) {
    console.log('📋 [Session] Old format detected, auto-migrating...');
    sessionData = migrateToNewFormat(sessionData);
  }
  
  // Ensure compatibility fields exist
  sessionData = addCompatibilityFields(sessionData);
  
  return sessionData;
}
