/**
 * Navigation Service
 * Centralized navigation control with loop detection and debugging
 * 
 * Key Features:
 * - Singleton pattern ensures single source of truth
 * - Loop detection prevents infinite navigation cycles
 * - Debug logging for troubleshooting
 * - Session state handling
 * - Role-based navigation guards
 * 
 * Usage:
 *   const nav = NavigationService.getInstance();
 *   nav.navigateTo('STUDENT_TEST', { sessionCode: 'ABC123' }, { reason: 'test_started' });
 */

import { NavigateFunction } from 'react-router-dom';
import { buildRoute, RouteParams, RouteName } from '../constants/routes';
import type {
  NavigationContext,
  NavigationState,
  UserRole,
  SessionStatus,
  NavigationOptions,
  NavigationResult,
  NavigationRecord
} from '../types/navigation.types';

class NavigationService {
  private static instance: NavigationService;
  private navigateFunction: NavigateFunction | null = null;

  private context: NavigationContext = {
    currentState: 'login',
    role: 'student',
    isNavigating: false,
  };

  private navigationStack: NavigationRecord[] = [];
  private debugMode = process.env.NODE_ENV === 'development';
  private maxStackSize = 10;
  private loopDetectionWindow = 3; // Check last 3 navigations for loops

  // Pending navigation to retry when current navigation completes
  private pendingNavigation: {
    destination: RouteName;
    params?: RouteParams;
    options?: NavigationOptions;
    retryCount: number;
  } | null = null;
  private maxRetries = 3;
  private retryDelay = 150; // ms between retries

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  /**
   * Initialize service with React Router's navigate function
   * Must be called before using navigation
   */
  initialize(navigate: NavigateFunction, role: UserRole): void {
    this.navigateFunction = navigate;
    this.context.role = role;
    this.log('🚀 Navigation Service Initialized', { role, path: window.location.pathname });
  }

  /**
   * Central navigation method
   * All navigation should go through this method
   */
  navigateTo(
    destination: RouteName,
    params?: RouteParams,
    options?: NavigationOptions
  ): NavigationResult {
    // Guard: Check if already navigating
    if (this.context.isNavigating && !options?.force) {
      this.log('⚠️ Navigation blocked - already navigating', { destination });

      // For session status changes, queue for retry instead of just failing
      const isSessionCritical = options?.reason?.startsWith('test_') ||
        options?.reason?.startsWith('quiz_') ||
        options?.reason?.startsWith('session_');

      if (isSessionCritical) {
        this.log('📋 Queueing critical navigation for retry', { destination, reason: options?.reason });
        this.pendingNavigation = {
          destination,
          params,
          options: { ...options, force: true }, // Force on retry
          retryCount: 0
        };
        // Schedule retry
        this.scheduleRetry();
      }

      return { success: false, blocked: true, reason: 'already_navigating' };
    }

    const from = window.location.pathname;
    const to = buildRoute(destination, params);

    if (typeof to !== 'string' || to.length === 0) {
      this.log('❌ Invalid destination route', { destination, params });
      return { success: false, reason: 'invalid_route' };
    }

    // Guard: Check if already at destination
    if (from === to && !options?.force) {
      this.log('ℹ️ Already at destination', { from, to });
      // Clear pending if we've reached destination
      if (this.pendingNavigation?.destination === destination) {
        this.pendingNavigation = null;
      }
      return { success: true, destination: to, reason: 'already_at_destination' };
    }

    // Guard: Check for navigation loops
    const loopDetected = this.isNavigationLoop(from, to);
    if (loopDetected) {
      this.log('🔴 Navigation loop detected!', {
        from,
        to,
        recentStack: this.navigationStack.slice(-5),
        reason: options?.reason
      });
      return { success: false, blocked: true, reason: 'loop_detected' };
    }

    // Execute navigation
    try {
      this.context.isNavigating = true;

      // Clear pending since we're now navigating
      this.pendingNavigation = null;

      // Record navigation
      const record: NavigationRecord = {
        from,
        to,
        timestamp: Date.now(),
        reason: options?.reason || 'programmatic',
      };

      this.context.lastNavigation = record;
      this.navigationStack.push(record);

      // Trim stack to max size
      if (this.navigationStack.length > this.maxStackSize) {
        this.navigationStack.shift();
      }

      this.log('➡️ Navigating', { from, to, reason: options?.reason });

      if (this.navigateFunction) {
        if (options?.delay) {
          // Delayed navigation
          setTimeout(() => {
            this.navigateFunction!(to, { replace: options?.replace, state: options?.state ?? params });
          }, options.delay);
        } else {
          // Immediate navigation - pass params as state for routes that don't use URL params
          this.navigateFunction(to, { replace: options?.replace, state: options?.state ?? params });
        }

        return { success: true, destination: to };
      } else {
        this.log('❌ Navigate function not initialized');
        return { success: false, reason: 'not_initialized' };
      }
    } finally {
      // Reset navigating flag after a longer delay to allow route to render
      // Increased from 100ms to 300ms to prevent race conditions with rapid Firebase updates
      setTimeout(() => {
        this.context.isNavigating = false;
        // Process any pending navigation after flag is reset
        this.processPendingNavigation();
      }, 300);
    }
  }

  /**
   * Schedule a retry for pending navigation
   */
  private scheduleRetry(): void {
    setTimeout(() => {
      this.processPendingNavigation();
    }, this.retryDelay);
  }

  /**
   * Process any pending navigation
   */
  private processPendingNavigation(): void {
    if (this.pendingNavigation && !this.context.isNavigating) {
      const pending = this.pendingNavigation;

      if (pending.retryCount >= this.maxRetries) {
        this.log('❌ Max retries reached for navigation', { destination: pending.destination });
        this.pendingNavigation = null;
        return;
      }

      this.log('🔄 Retrying queued navigation', {
        destination: pending.destination,
        attempt: pending.retryCount + 1
      });

      pending.retryCount++;
      this.navigateTo(pending.destination, pending.params, pending.options);
    }
  }

  /**
   * Handle session status changes
   * Central handler for Firebase session updates
   */
  handleSessionStateChange(
    status: SessionStatus,
    sessionCode?: string
  ): void {
    this.log('📊 Session state changed', { status, sessionCode, role: this.context.role });

    switch (status) {
      case 'waiting':
        // Session waiting - route students to waiting room
        if (this.context.role === 'student') {
          this.navigateTo('STUDENT_WAITING',
            { gameSessionId: sessionCode },
            { reason: 'session_status_waiting' }
          );
        }
        break;

      case 'in-progress':
        // Test/quiz started - handled by specific components
        this.log('ℹ️ Session in progress - component will handle navigation');
        break;

      case 'completed':
        // Session ended - return to login
        this.navigateTo('LOGIN',
          {},
          { reason: 'session_completed', replace: true }
        );
        break;

      case 'expired':
        // Session expired - return to login
        this.navigateTo('LOGIN',
          {},
          { reason: 'session_expired', replace: true }
        );
        break;

      case 'feedback':
        // Quiz feedback phase - route students to feedback page
        if (this.context.role === 'student') {
          this.navigateTo('STUDENT_FEEDBACK',
            { gameSessionId: sessionCode },
            { reason: 'session_status_feedback' }
          );
        }
        break;

      case 'results':
        // Quiz results phase - route students to results page
        if (this.context.role === 'student') {
          this.navigateTo('STUDENT_RESULTS',
            { gameSessionId: sessionCode },
            { reason: 'session_status_results' }
          );
        }
        break;
    }
  }

  /**
   * Handle test ID changes
   * Called when testId is added or removed from session
   */
  handleTestChange(
    testId: string | null,
    sessionCode?: string
  ): void {
    // If test ID cleared while in test, return to waiting room
    if (!testId && this.context.currentState === 'in_test') {
      this.log('⚠️ Test ended - navigating to waiting room');
      this.navigateTo('STUDENT_WAITING',
        { gameSessionId: sessionCode },
        { reason: 'test_ended' }
      );
    }
  }

  /**
   * Detect navigation loops
   * Checks recent navigation history for repeating patterns
   */
  private isNavigationLoop(from: string, to: string): boolean {
    if (this.navigationStack.length < 2) {
      return false; // Not enough history to detect loop
    }

    const recent = this.navigationStack.slice(-this.loopDetectionWindow);

    // Check for A→B→A pattern (immediate loop)
    if (recent.length >= 2) {
      const lastTwo = recent.slice(-2);
      if (lastTwo[0]?.from === to && lastTwo[1]?.to === from) {
        return true;
      }
    }

    // Check for repeated back-and-forth within window
    const pathPairs = recent.map(r => `${r.from}→${r.to}`);
    const currentPair = `${from}→${to}`;

    const occurrences = pathPairs.filter(pair => pair === currentPair).length;
    if (occurrences >= 2) {
      return true; // Same navigation happened multiple times recently
    }

    return false;
  }

  /**
   * Update current navigation state
   */
  updateState(state: NavigationState): void {
    this.context.currentState = state;
    this.log('📍 State updated', { state });
  }

  /**
   * Clear navigation history
   * Useful for testing or after major state changes
   */
  clearHistory(): void {
    this.navigationStack = [];
    this.log('🗑️ Navigation history cleared');
  }

  /**
   * Get current navigation context
   * Useful for debugging
   */
  getContext(): NavigationContext {
    return { ...this.context };
  }

  /**
   * Get navigation history
   * Returns copy of navigation stack
   */
  getHistory(): NavigationRecord[] {
    return [...this.navigationStack];
  }

  /**
   * Enable/disable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.log('🐛 Debug mode', { enabled });
  }

  /**
   * Internal logging helper
   */
  private log(message: string, data?: any): void {
    if (this.debugMode) {
      const timestamp = new Date().toISOString().split('T')[1]?.split('.')[0] || '00:00:00';
      console.log(`[NAV ${timestamp}] ${message}`, data || '');
    }
  }

  /**
   * Reset service to initial state
   * Useful for testing
   */
  reset(): void {
    this.context = {
      currentState: 'login',
      role: 'student',
      isNavigating: false,
    };
    this.navigationStack = [];
    this.navigateFunction = null;
    this.log('🔄 Service reset');
  }
}

// Export singleton instance
export const navigationService = NavigationService.getInstance();

// Export class for testing
export { NavigationService };
