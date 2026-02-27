/**
 * Session to Class Migration Utility
 * Converts old session-based architecture to new class-based architecture
 */

import { ref, get, set } from 'firebase/database';
// @ts-ignore
import { database } from './firebase';
import type { ClassSession, TestAssignment } from '../types/session.types';

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  skippedCount: number;
}

/**
 * Check if a session is already in class format
 */
function isClassFormat(sessionData: any): boolean {
  return !!(sessionData.activeTests && typeof sessionData.activeTests === 'object');
}

/**
 * Check if session is old format (has testId directly)
 */
function isOldFormat(sessionData: any): boolean {
  return !!(sessionData.testId && typeof sessionData.testId === 'string');
}

/**
 * Convert single old session to class format
 */
async function migrateSession(sessionCode: string, sessionData: any): Promise<void> {
  console.log(`🔄 Migrating session: ${sessionCode}`);
  
  const now = Date.now();
  const testId = sessionData.testId;
  
  // Create assignment for all existing players
  const players = sessionData.players || {};
  const studentIds = Object.keys(players);
  
  const assignmentId = `${testId}_migrated_${now}`;
  const assignment: TestAssignment = {
    assignmentId,
    testId,
    assignedStudents: studentIds,
    status: sessionData.status === 'in-progress' ? 'in-progress' : 'waiting',
    assignedAt: sessionData.createdAt || now,
    startTime: sessionData.startTime || null,
    duration: 60, // Default duration
    isPaused: sessionData.isPaused || false,
    pausedAt: sessionData.pausedAt,
    pausedDuration: sessionData.pausedDuration || 0,
    resumedAt: sessionData.resumedAt,
  };
  
  // Convert players to class students format
  const students: Record<string, any> = {};
  Object.entries(players).forEach(([playerId, playerData]: [string, any]) => {
    students[playerId] = {
      studentId: playerId,
      studentName: playerData.name || 'Unknown',
      joinedAt: playerData.joinedAt || sessionData.createdAt || now,
      lastActivity: playerData.lastActivity || now,
      isConnected: playerData.isConnected || false,
      disconnectedAt: playerData.disconnectedAt,
      assignedTestId: testId, // Assign all to the test
      answers: playerData.answers || {},
      isSubmitted: playerData.isSubmitted || false,
      submittedAt: playerData.submittedAt,
      progress: playerData.progress,
      score: playerData.score,
      maxScore: playerData.maxScore,
      correctCount: playerData.correctCount,
    };
  });
  
  // Create class data
  const classData: ClassSession = {
    classId: sessionCode,
    className: `Migrated - ${sessionCode}`,
    status: 'active',
    createdAt: sessionData.createdAt || now,
    expiresAt: sessionData.expiresAt || (now + 180 * 24 * 60 * 60 * 1000),
    updatedAt: now,
    teacherId: sessionData.teacherId || `teacher_migrated_${now}`,
    activeTests: {
      [assignmentId]: assignment,
    },
    students,
    bannedStudents: sessionData.bannedPlayers || {},
    settings: {
      allowLateJoin: sessionData.settings?.allowLateJoin ?? true,
      showLeaderboard: sessionData.settings?.showLeaderboard ?? true,
      autoArchiveDays: 90,
    },
  };
  
  // Write to Firebase
  const sessionRef = ref(database, `game_sessions/${sessionCode}`);
  await set(sessionRef, classData);
  
  console.log(`✅ Migrated session ${sessionCode} to class format`);
}

/**
 * Migrate all old sessions to class format
 */
export async function migrateAllSessionsToClasses(): Promise<MigrationResult> {
  console.log('🔄 Starting session to class migration...');
  
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    errors: [],
    skippedCount: 0,
  };
  
  try {
    // Get all sessions
    const sessionsRef = ref(database, 'game_sessions');
    const snapshot = await get(sessionsRef);
    
    if (!snapshot.exists()) {
      console.log('ℹ️ No sessions found to migrate');
      return result;
    }
    
    const allSessions = snapshot.val();
    const sessionCodes = Object.keys(allSessions);
    
    console.log(`📊 Found ${sessionCodes.length} sessions to process`);
    
    for (const sessionCode of sessionCodes) {
      const sessionData = allSessions[sessionCode];
      
      try {
        // Skip if already in class format
        if (isClassFormat(sessionData)) {
          console.log(`⏭️ Skipping ${sessionCode} - already in class format`);
          result.skippedCount++;
          continue;
        }
        
        // Skip if not in old format (corrupted/invalid)
        if (!isOldFormat(sessionData)) {
          console.log(`⚠️ Skipping ${sessionCode} - unknown format`);
          result.skippedCount++;
          continue;
        }
        
        // Migrate this session
        await migrateSession(sessionCode, sessionData);
        result.migratedCount++;
        
      } catch (error: any) {
        console.error(`❌ Error migrating session ${sessionCode}:`, error);
        result.errors.push(`${sessionCode}: ${error.message}`);
      }
    }
    
    console.log('✅ Migration complete');
    console.log(`   Migrated: ${result.migratedCount}`);
    console.log(`   Skipped: ${result.skippedCount}`);
    console.log(`   Errors: ${result.errors.length}`);
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    result.success = false;
    result.errors.push(`Global error: ${error.message}`);
    return result;
  }
}

/**
 * Migrate a single session (for testing or manual migration)
 */
export async function migrateSingleSession(sessionCode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    
    if (!snapshot.exists()) {
      return { success: false, error: 'Session not found' };
    }
    
    const sessionData = snapshot.val();
    
    if (isClassFormat(sessionData)) {
      return { success: false, error: 'Already in class format' };
    }
    
    if (!isOldFormat(sessionData)) {
      return { success: false, error: 'Not in old session format' };
    }
    
    await migrateSession(sessionCode, sessionData);
    return { success: true };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
