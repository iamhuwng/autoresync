/**
 * UI Terminology Abstraction Layer
 * 
 * Maps internal code terms to user-facing UI terms
 * Prevents confusion between technical and pedagogical terminology
 * 
 * RULE: Always use these constants in UI components
 * NEVER hardcode user-facing text with code terms
 */

/**
 * User-facing terminology
 * Use these in all UI components
 */
export const UI_TERMS = {
  // Session → Class
  SESSION: 'Class',
  SESSION_PLURAL: 'Classes',
  SESSION_CODE: 'Class Code',
  SESSION_NAME: 'Class Name',
  CLASS: 'Class',
  
  // Actions
  CREATE_SESSION: 'Create Class',
  JOIN_SESSION: 'Join Class',
  END_SESSION: 'End Class',
  START_SESSION: 'Start Class',
  MANAGE_SESSIONS: 'Manage Classes',
  
  // People
  PLAYERS: 'Students',
  PLAYER: 'Student',
  STUDENTS: 'Students',
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  
  // Test/Quiz assignment
  ACTIVE_TESTS: 'Assigned Tests',
  ACTIVE_QUIZZES: 'Assigned Quizzes',
  ASSIGN_TEST: 'Assign Test',
  MULTI_TEST_ASSIGNMENT: 'Multi-Test Assignment',
  ASSIGN_DIFFERENT_TESTS_DESC: 'Assign different tests to different students in the same {className}',
  SELECT_TEST: 'Select a Test',
  SELECT_STUDENTS: 'Select Students ({count})',
  SELECT_ALL_UNASSIGNED: 'Select All Unassigned',
  ASSIGN_TEST_TO_COUNT: 'Assign Test to {count} Student(s)',
  TEST_ASSIGNED_SUCCESS: 'Test "{testName}" assigned to {count} student(s)',
  ASSIGNING: 'Assigning...',
  
  // Status messages
  WAITING_FOR_SESSION: 'Waiting for class to start',
  SESSION_STARTED: 'Class has started',
  SESSION_ENDED: 'Class has ended',
  ASSIGNED: 'Assigned',
  UNASSIGNED: 'Unassigned',
  ALREADY_ASSIGNED: 'Already Assigned',
  
  // Input labels
  ENTER_SESSION_CODE: 'Enter your class code',
  SESSION_CODE_LABEL: 'Class Code',
  SESSION_NAME_LABEL: 'Class Name',
  
  // Headers
  SESSION_MANAGEMENT: 'Class Management',
  ACTIVE_SESSIONS: 'Active Classes',
  SESSION_DETAILS: 'Class Details',
  TOTAL_STUDENTS: 'Total Students',
  
  // Messages
  NO_STUDENTS_JOINED: 'No students have joined the {className} yet',
  ERROR_SELECT_ITEMS: 'Please select {items}',
  ERROR_GENERIC: 'An error occurred. Please try again.',
  
  // IELTS Listening Terms
  LISTENING_TEST: 'Listening Test',
  LISTENING_SECTION: 'Section',
  DISPLAY_MODE: 'Display Mode',
  TEXT_MODE: 'Text Mode',
  IMAGE_MODE: 'Image Mode',
  QUESTION_IMAGES: 'Question Images',
  
  // IELTS Question Types (user-facing)
  NOTE_COMPLETION: 'Note Completion',
  FORM_COMPLETION: 'Form Completion',
  TABLE_COMPLETION: 'Table Completion',
  SENTENCE_COMPLETION: 'Sentence Completion',
  SUMMARY_COMPLETION: 'Summary Completion',
  MAP_LABELLING: 'Map Labelling',
  PLAN_LABELLING: 'Plan Labelling',
  DIAGRAM_LABELLING: 'Diagram Labelling',
  MATCHING: 'Matching',
  MULTIPLE_CHOICE: 'Multiple Choice',
  MULTIPLE_SELECT: 'Multiple Select',
  SHORT_ANSWER: 'Short Answer',
  
  // IELTS Instructions
  WORD_LIMIT_WARNING: 'Write NO MORE THAN {count} WORDS for each answer',
  CHOOSE_CORRECT_LETTER: 'Choose the correct letter',
  COMPLETE_NOTES: 'Complete the notes below',
  COMPLETE_FORM: 'Complete the form below',
  LABEL_MAP: 'Label the map below',
} as const;

/**
 * Internal code terms
 * Use these in comments to clarify mapping
 */
export const CODE_TERMS = {
  SESSION: 'session',
  SESSION_CODE: 'sessionCode',
  PLAYERS: 'players',
  ACTIVE_TESTS: 'activeTests',
  ACTIVE_QUIZZES: 'activeQuizzes',
} as const;

/**
 * Helper function to get UI term
 * Type-safe access to UI_TERMS
 * 
 * @example
 * const label = getUITerm('SESSION_CODE'); // Returns "Class Code"
 */
export function getUITerm(key: keyof typeof UI_TERMS): string {
  return UI_TERMS[key];
}

/**
 * Generate user-facing message with proper terminology
 * 
 * @example
 * formatMessage('Created {SESSION} {code}', { code: 'ABC123' })
 * // Returns: "Created Class ABC123"
 * 
 * formatMessage('Select Students ({count})', { count: 5 })
 * // Returns: "Select Students (5)"
 */
export function formatMessage(template: string, vars: Record<string, string | number> = {}): string {
  let message = template;
  
  // Replace UI term placeholders
  Object.keys(UI_TERMS).forEach(key => {
    const placeholder = `{${key}}`;
    if (message.includes(placeholder)) {
      message = message.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), UI_TERMS[key as keyof typeof UI_TERMS]);
    }
  });
  
  // Replace variable placeholders (convert numbers to strings)
  Object.entries(vars).forEach(([key, value]) => {
    message = message.replace(`{${key}}`, String(value));
  });
  
  return message;
}

/**
 * Pluralize UI term based on count
 * 
 * @example
 * pluralize('SESSION', 1) // "Class"
 * pluralize('SESSION', 3) // "Classes"
 */
export function pluralize(term: keyof typeof UI_TERMS, count: number): string {
  const singular = UI_TERMS[term];
  
  if (count === 1) return singular;
  
  // Handle special plurals
  if (term === 'SESSION') return UI_TERMS.SESSION_PLURAL;
  if (term.includes('PLAYER')) return UI_TERMS.PLAYERS;
  
  // Default pluralization
  return singular + 's';
}

/**
 * TypeScript type for UI terms
 * Use this for type safety
 */
export type UITermKey = keyof typeof UI_TERMS;

/**
 * Check if we're in migration phase
 * Controls whether to show old or new terms
 */
export const MIGRATION_PHASE = {
  CURRENT: 1, // 1 = Code+UI both use "session"
  TARGET: 2,  // 2 = Code uses "session", UI uses "class"
} as const;

/**
 * Get appropriate term based on migration phase
 * For gradual rollout
 * 
 * @deprecated Use UI_TERMS directly in Phase 2+
 */
export function getTermForPhase(phase: number, internalTerm: string, uiTerm: string): string {
  return phase >= 2 ? uiTerm : internalTerm;
}
