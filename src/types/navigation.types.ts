/**
 * Navigation Type Definitions
 * Defines all navigation-related types and interfaces
 */

/**
 * Possible navigation states in the application
 */
export type NavigationState = 
  | 'login'
  | 'waiting_room'
  | 'in_test'
  | 'in_quiz'
  | 'viewing_results'
  | 'teacher_lobby'
  | 'monitoring_test'
  | 'monitoring_quiz';

/**
 * User roles for role-based navigation
 */
export type UserRole = 'student' | 'teacher' | 'admin';

/**
 * Session status from Firebase
 */
export type SessionStatus = 'waiting' | 'in-progress' | 'completed' | 'expired' | 'feedback' | 'results';

/**
 * Navigation context containing current state and metadata
 */
export interface NavigationContext {
  currentState: NavigationState;
  sessionCode?: string;
  gameSessionId?: string;
  testId?: string;
  quizId?: string;
  role: UserRole;
  isNavigating: boolean;
  lastNavigation?: NavigationRecord;
}

/**
 * Record of a navigation event for debugging and loop detection
 */
export interface NavigationRecord {
  from: string;
  to: string;
  timestamp: number;
  reason: string;
}

/**
 * Navigation options for fine-grained control
 */
export interface NavigationOptions {
  /** Replace current history entry instead of pushing */
  replace?: boolean;
  /** Reason for navigation (for debugging) */
  reason?: string;
  /** Force navigation even if already navigating */
  force?: boolean;
  /** Delay navigation by X milliseconds */
  delay?: number;
}

/**
 * Navigation guard for conditional navigation
 */
export interface NavigationGuard {
  /** Check if navigation is allowed */
  canNavigate: (from: NavigationState, to: NavigationState, context?: NavigationContext) => boolean;
  /** Alternative destination if navigation blocked */
  redirectTo?: NavigationState;
  /** Reason for blocking */
  reason?: string;
}

/**
 * Result of a navigation attempt
 */
export interface NavigationResult {
  success: boolean;
  blocked?: boolean;
  reason?: string;
  destination?: string;
}

/**
 * Session change event data
 */
export interface SessionChangeEvent {
  status: SessionStatus;
  sessionCode?: string;
  testId?: string | null;
  quizId?: string | null;
}

/**
 * Navigation hook return type
 */
export interface UseNavigationReturn {
  navigateTo: (destination: string, params?: any, options?: NavigationOptions) => NavigationResult;
  handleSessionChange: (status: SessionStatus, sessionCode?: string) => void;
  handleTestChange: (testId: string | null, sessionCode?: string) => void;
  currentPath: string;
  isNavigating: boolean;
  navigationHistory: NavigationRecord[];
  context: NavigationContext;
}
