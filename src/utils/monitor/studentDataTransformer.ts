/**
 * Student Data Transformer
 * 
 * Pure utility functions for transforming raw Firebase player data
 * into structured StudentProgress objects for the teacher monitor interface.
 * 
 * @module utils/monitor/studentDataTransformer
 */

export interface StudentProgress {
  studentId: string;
  name: string;
  progress: number;
  answeredCount: number;
  timeElapsed: number;
  lastActivity: number;
  status: 'working' | 'submitted' | 'disconnected';
  currentQuestion?: number;
  recentAnswers: Array<{
    questionNumber: number;
    answer: string | string[];
    timestamp: number;
  }>;
  bandScore?: number;
  rawAnswers: Record<string, any>;
}

export interface PlayerData {
  answers?: Record<string, any>;
  isSubmitted?: boolean;
  submittedAt?: number;
  lastActivity?: number;
  name?: string;
  playerName?: string;
  timeElapsed?: number;
  bandScore?: number;

  /** PRD-0019: Has student completed the test (via timer or manual submission) */
  hasCompletedTest?: boolean;

  /** PRD-0019: When student completed the test */
  completedAt?: number | null;

  /** PRD-0019: How the test was submitted ('system-timeout' | 'student' | 'teacher-ended') */
  submittedBy?: 'system-timeout' | 'student' | 'teacher-ended';
}

/**
 * Transforms a single raw Firebase player object into a structured StudentProgress object.
 * 
 * This function handles:
 * - Progress calculation based on answered questions
 * - Status determination (working/submitted/disconnected)
 * - Current question extraction
 * - Recent answers extraction (last 3)
 * - Name fallbacks for missing data
 * 
 * @param playerId - The unique Firebase ID of the player
 * @param player - The raw player data from Firebase
 * @param totalQuestions - Total number of questions in the test (default: 40)
 * @param sessionCreatedAt - The session creation timestamp for fallback lastActivity
 * @returns Structured StudentProgress object
 * 
 * @example
 * ```typescript
 * const studentProgress = transformPlayerToStudentProgress(
 *   'player123',
 *   { name: 'John Doe', answers: {...}, lastActivity: Date.now() },
 *   40,
 *   Date.now() - 3600000
 * );
 * ```
 */
export function transformPlayerToStudentProgress(
  playerId: string,
  player: PlayerData,
  totalQuestions: number = 40,
  sessionCreatedAt: number = Date.now()
): StudentProgress {
  // Calculate progress
  const answeredCount = player.answers ? Object.keys(player.answers).length : 0;
  const progress = (answeredCount / totalQuestions) * 100;

  // Determine status
  const status = determineStudentStatus(player);

  // Get current question (most recent answer)
  const currentQuestion = extractCurrentQuestion(player.answers);

  // Get recent answers (last 3)
  const recentAnswers = extractRecentAnswers(player.answers);

  // Get name with fallbacks
  const studentName = player.name || player.playerName || `Student ${playerId.slice(0, 6)}`;

  return {
    studentId: playerId,
    name: studentName,
    progress: Math.round(progress),
    answeredCount,
    timeElapsed: player.timeElapsed || 0,
    lastActivity: player.lastActivity || sessionCreatedAt,
    status,
    currentQuestion,
    recentAnswers,
    bandScore: player.bandScore,
    rawAnswers: player.answers || {},
  };
}

/**
 * Determines the student's current status based on their activity and submission state.
 * 
 * Status logic:
 * - 'submitted': If isSubmitted flag or submittedAt timestamp exists
 * - 'disconnected': If no activity for more than 60 seconds
 * - 'working': If has recent activity or has answered questions
 * 
 * @param player - The raw player data from Firebase
 * @returns The student's status
 */
function determineStudentStatus(
  player: PlayerData
): 'working' | 'submitted' | 'disconnected' {
  // Check if submitted
  if (player.isSubmitted || player.submittedAt) {
    return 'submitted';
  }

  // Check if disconnected based on lastActivity
  if (player.lastActivity) {
    const timeSinceLastActivity = Date.now() - player.lastActivity;
    if (timeSinceLastActivity > 60000) {
      console.log(`🔴 [Monitor] Student marked as disconnected (${Math.round(timeSinceLastActivity / 1000)}s since last activity)`);
      return 'disconnected';
    }
    return 'working';
  }

  // No lastActivity - check if they have answers
  if (player.answers && Object.keys(player.answers).length > 0) {
    return 'working';
  }

  // No activity and no answers = disconnected/inactive
  return 'disconnected';
}

/**
 * Extracts the most recent question number from the player's answers.
 * 
 * Sorts answers by timestamp (descending) and returns the question number
 * of the most recent answer.
 * 
 * @param answers - The player's answer object
 * @returns The question number of the most recent answer, or undefined if no answers
 */
function extractCurrentQuestion(
  answers?: Record<string, any>
): number | undefined {
  if (!answers || Object.keys(answers).length === 0) {
    return undefined;
  }

  const sortedAnswers = Object.entries(answers)
    .sort(([, a], [, b]) => {
      const aTime = (a && typeof a === 'object' && 'timestamp' in a) ? (a.timestamp || 0) : 0;
      const bTime = (b && typeof b === 'object' && 'timestamp' in b) ? (b.timestamp || 0) : 0;
      return bTime - aTime;
    });

  if (sortedAnswers.length > 0 && sortedAnswers[0]) {
    return parseInt(sortedAnswers[0][0]);
  }

  return undefined;
}

/**
 * Extracts the last 3 recent answers from the player's answer data.
 * 
 * Sorts answers by timestamp (descending) and returns up to 3 most recent answers
 * with their question numbers, answer values, and timestamps.
 * 
 * @param answers - The player's answer object
 * @returns Array of up to 3 recent answers with metadata
 */
function extractRecentAnswers(
  answers?: Record<string, any>
): Array<{ questionNumber: number; answer: string | string[]; timestamp: number }> {
  if (!answers) {
    return [];
  }

  const sortedAnswers = Object.entries(answers)
    .sort(([, a], [, b]) => {
      const aTime = (a && typeof a === 'object' && 'timestamp' in a) ? (a.timestamp || 0) : 0;
      const bTime = (b && typeof b === 'object' && 'timestamp' in b) ? (b.timestamp || 0) : 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  const recentAnswers: Array<{ questionNumber: number; answer: string | string[]; timestamp: number }> = [];

  sortedAnswers.forEach(([qNum, answerData]) => {
    if (answerData && typeof answerData === 'object') {
      recentAnswers.push({
        questionNumber: parseInt(qNum),
        answer: answerData.answer || 'No answer',
        timestamp: answerData.timestamp || Date.now(),
      });
    }
  });

  return recentAnswers;
}
