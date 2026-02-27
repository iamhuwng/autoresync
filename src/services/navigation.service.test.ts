/**
 * Navigation Service Unit Tests
 * Comprehensive tests for centralized navigation with loop detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NavigationService } from './navigation.service';
import type { NavigateFunction } from 'react-router-dom';

describe('NavigationService', () => {
  let service: NavigationService;
  let mockNavigate: NavigateFunction;
  let navigationCalls: Array<{ path: string; options?: any }>;

  beforeEach(() => {
    // Create fresh instance for each test
    service = NavigationService.getInstance();
    service.reset();
    
    // Mock navigate function
    navigationCalls = [];
    mockNavigate = vi.fn((path: string | number, options?: any) => {
      if (typeof path === 'string') {
        navigationCalls.push({ path, options });
      }
    }) as unknown as NavigateFunction;
    
    // Initialize service
    service.initialize(mockNavigate, 'student');
    
    // Disable debug logging for cleaner test output
    service.setDebugMode(false);
  });

  afterEach(() => {
    service.reset();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with navigate function', () => {
      const context = service.getContext();
      expect(context.role).toBe('student');
      expect(context.currentState).toBe('login');
      expect(context.isNavigating).toBe(false);
    });

    it('should initialize with different roles', () => {
      service.reset();
      service.initialize(mockNavigate, 'teacher');
      expect(service.getContext().role).toBe('teacher');
      
      service.reset();
      service.initialize(mockNavigate, 'admin');
      expect(service.getContext().role).toBe('admin');
    });

    it('should handle re-initialization', () => {
      service.initialize(mockNavigate, 'teacher');
      expect(service.getContext().role).toBe('teacher');
    });

    it('should clear history on reset', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'test' });
      expect(service.getHistory().length).toBeGreaterThan(0);
      
      service.reset();
      expect(service.getHistory().length).toBe(0);
    });
  });

  describe('Basic Navigation', () => {
    it('should navigate to valid route', () => {
      const result = service.navigateTo('SESSIONS', {}, { reason: 'user_click' });
      
      expect(result.success).toBe(true);
      expect(result.destination).toBe('/sessions');
      expect(mockNavigate).toHaveBeenCalledWith('/sessions', { replace: undefined });
    });

    it('should navigate with parameters', () => {
      const result = service.navigateTo('STUDENT_TEST', 
        { sessionCode: 'ABC123' }, 
        { reason: 'test_started' }
      );
      
      expect(result.success).toBe(true);
      expect(result.destination).toBe('/student-test/ABC123');
    });

    it('should navigate with replace option', () => {
      service.navigateTo('LOGIN', {}, { replace: true, reason: 'logout' });
      
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should track navigation history', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'first' });
      service.navigateTo('LOGIN', {}, { reason: 'second' });
      
      const history = service.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]?.reason).toBe('first');
      expect(history[1]?.reason).toBe('second');
    });

    it('should record navigation timestamps', () => {
      const before = Date.now();
      service.navigateTo('SESSIONS', {}, { reason: 'test' });
      const after = Date.now();
      
      const history = service.getHistory();
      const timestamp = history[0]?.timestamp || 0;
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should update last navigation in context', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'context_test' });
      
      const context = service.getContext();
      expect(context.lastNavigation?.reason).toBe('context_test');
      expect(context.lastNavigation?.to).toBe('/sessions');
    });
  });

  describe('Navigation Guards', () => {
    beforeEach(() => {
      // Set initial location
      Object.defineProperty(window, 'location', {
        value: { pathname: '/' },
        writable: true,
        configurable: true,
      });
    });

    it('should prevent navigation when already navigating', () => {
      // Trigger first navigation
      service.navigateTo('SESSIONS', {}, { reason: 'first' });
      
      // Try second navigation immediately (within 100ms)
      const result = service.navigateTo('LOGIN', {}, { reason: 'second' });
      
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('already_navigating');
    });

    it('should allow forced navigation', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'first' });
      
      const result = service.navigateTo('LOGIN', {}, { 
        reason: 'forced', 
        force: true 
      });
      
      expect(result.success).toBe(true);
    });

    it('should skip navigation if already at destination', () => {
      // Mock current location
      Object.defineProperty(window, 'location', {
        value: { pathname: '/sessions' },
        writable: true,
      });
      
      const result = service.navigateTo('SESSIONS', {}, { reason: 'redundant' });
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('already_at_destination');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should allow forced navigation even if at destination', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/sessions' },
        writable: true,
      });
      
      const result = service.navigateTo('SESSIONS', {}, { 
        reason: 'forced_refresh', 
        force: true 
      });
      
      expect(result.success).toBe(true);
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe('Loop Detection - Critical Feature', () => {
    it('should detect direct A→B→A loop', () => {
      // Simulate navigation loop
      Object.defineProperty(window, 'location', {
        value: { pathname: '/student-wait/ABC' },
        writable: true,
      });
      
      // Navigate to test page
      service.navigateTo('STUDENT_TEST', { sessionCode: 'ABC' }, { reason: 'step1' });
      
      // Mock being at test page
      Object.defineProperty(window, 'location', {
        value: { pathname: '/student-test/ABC' },
        writable: true,
      });
      
      // Try to navigate back to waiting (creates A→B pattern)
      service.navigateTo('STUDENT_WAITING', { gameSessionId: 'ABC' }, { reason: 'step2' });
      
      // Mock being back at waiting
      Object.defineProperty(window, 'location', {
        value: { pathname: '/student-wait/ABC' },
        writable: true,
      });
      
      // This should be blocked (completes A→B→A loop)
      const result = service.navigateTo('STUDENT_TEST', { sessionCode: 'ABC' }, { reason: 'loop' });
      
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('loop_detected');
    });

    it('should detect repeated navigation pattern', () => {
      const sessionCode = 'TEST';
      
      // Navigate multiple times to same route
      Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
      service.navigateTo('STUDENT_TEST', { sessionCode }, { reason: '1' });
      
      Object.defineProperty(window, 'location', { value: { pathname: '/student-test/TEST' }, writable: true });
      service.navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: '2' });
      
      Object.defineProperty(window, 'location', { value: { pathname: '/student-wait/TEST' }, writable: true });
      service.navigateTo('STUDENT_TEST', { sessionCode }, { reason: '3' });
      
      // This repeats the same navigation pattern
      Object.defineProperty(window, 'location', { value: { pathname: '/student-test/TEST' }, writable: true });
      const result = service.navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: '4' });
      
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('loop_detected');
    });

    it('should allow legitimate back navigation after delay', async () => {
      Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
      service.navigateTo('SESSIONS', {}, { reason: 'forward' });
      
      Object.defineProperty(window, 'location', { value: { pathname: '/sessions' }, writable: true });
      
      // Wait 150ms (longer than isNavigating timeout)
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = service.navigateTo('LOGIN', {}, { reason: 'back' });
      expect(result.success).toBe(true);
    });

    it('should not detect loop for different paths', () => {
      Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
      service.navigateTo('SESSIONS', {}, { reason: '1' });
      
      Object.defineProperty(window, 'location', { value: { pathname: '/sessions' }, writable: true });
      service.navigateTo('CREATE_QUIZ', {}, { reason: '2' });
      
      Object.defineProperty(window, 'location', { value: { pathname: '/create-quiz' }, writable: true });
      const result = service.navigateTo('SESSIONS', {}, { reason: '3' });
      
      // Different path, not a loop
      expect(result.success).toBe(true);
    });

    it('should clear history to prevent false loop detection', () => {
      // Build up history
      for (let i = 0; i < 5; i++) {
        Object.defineProperty(window, 'location', { value: { pathname: `/${i}` }, writable: true });
        service.navigateTo('SESSIONS', {}, { reason: `nav${i}` });
      }
      
      service.clearHistory();
      
      // Should allow navigation after clearing
      const result = service.navigateTo('LOGIN', {}, { reason: 'after_clear' });
      expect(result.success).toBe(true);
    });
  });

  describe('Session State Handling', () => {
    it('should navigate students to waiting room on waiting status', () => {
      service.handleSessionStateChange('waiting', 'ABC123');
      
      expect(mockNavigate).toHaveBeenCalledWith(
        '/student-wait/ABC123',
        expect.any(Object)
      );
    });

    it('should navigate to login on completed status', () => {
      service.handleSessionStateChange('completed');
      
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should navigate to login on expired status', () => {
      service.handleSessionStateChange('expired');
      
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should not navigate on in-progress status', () => {
      service.handleSessionStateChange('in-progress', 'ABC123');
      
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should only navigate students, not teachers', () => {
      service.reset();
      service.initialize(mockNavigate, 'teacher');
      
      service.handleSessionStateChange('waiting', 'ABC123');
      
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Test State Handling', () => {
    it('should navigate to waiting room when test ends', () => {
      service.updateState('in_test');
      
      service.handleTestChange(null, 'ABC123');
      
      expect(mockNavigate).toHaveBeenCalledWith(
        '/student-wait/ABC123',
        expect.any(Object)
      );
    });

    it('should not navigate if not in test', () => {
      service.updateState('waiting_room');
      
      service.handleTestChange(null, 'ABC123');
      
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should not navigate if test still exists', () => {
      service.updateState('in_test');
      
      service.handleTestChange('TEST_ID', 'ABC123');
      
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Navigation History Management', () => {
    it('should maintain last 10 navigations', () => {
      // Navigate 15 times
      for (let i = 0; i < 15; i++) {
        Object.defineProperty(window, 'location', { 
          value: { pathname: `/${i}` }, 
          writable: true 
        });
        service.navigateTo('SESSIONS', {}, { reason: `nav${i}` });
      }
      
      const history = service.getHistory();
      expect(history.length).toBe(10); // Only last 10 kept
      expect(history[0]?.reason).toBe('nav5'); // First kept is nav5
      expect(history[9]?.reason).toBe('nav14'); // Last is nav14
    });

    it('should provide navigation history for debugging', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'first' });
      service.navigateTo('LOGIN', {}, { reason: 'second' });
      
      const history = service.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.from).toBeDefined();
      expect(history[0]?.to).toBeDefined();
      expect(history[0]?.timestamp).toBeGreaterThan(0);
    });

    it('should track navigation reasons for debugging', () => {
      const reasons = ['user_click', 'session_ended', 'test_started'];
      
      reasons.forEach(reason => {
        Object.defineProperty(window, 'location', { 
          value: { pathname: `/prev` }, 
          writable: true 
        });
        service.navigateTo('SESSIONS', {}, { reason });
      });
      
      const history = service.getHistory();
      const recordedReasons = history.map(h => h.reason);
      expect(recordedReasons).toEqual(reasons);
    });
  });

  describe('Debug Logging', () => {
    it('should enable debug logging', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      service.setDebugMode(true);
      
      service.navigateTo('SESSIONS', {}, { reason: 'test' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should disable debug logging', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      service.setDebugMode(false);
      
      service.navigateTo('SESSIONS', {}, { reason: 'test' });
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('State Management', () => {
    it('should update navigation state', () => {
      service.updateState('in_test');
      
      const context = service.getContext();
      expect(context.currentState).toBe('in_test');
    });

    it('should track multiple state changes', () => {
      const states = ['login', 'waiting_room', 'in_test', 'viewing_results'];
      
      states.forEach(state => {
        service.updateState(state as any);
        expect(service.getContext().currentState).toBe(state);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation without initialization', () => {
      service.reset();
      
      const result = service.navigateTo('SESSIONS', {}, { reason: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('not_initialized');
    });

    it('should handle invalid parameters gracefully', () => {
      // @ts-expect-error Testing invalid input
      const result = service.navigateTo('INVALID_ROUTE', {}, { reason: 'test' });
      
      // Should not throw, just fail gracefully
      expect(result.success).toBe(false);
    });
  });

  describe('Delayed Navigation', () => {
    it('should support delayed navigation', async () => {
      service.navigateTo('SESSIONS', {}, { reason: 'delayed', delay: 100 });
      
      // Should not navigate immediately
      expect(mockNavigate).not.toHaveBeenCalled();
      
      // Should navigate after delay
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockNavigate).toHaveBeenCalled();
    });

    it('should record navigation immediately even with delay', () => {
      service.navigateTo('SESSIONS', {}, { reason: 'delayed', delay: 100 });
      
      const history = service.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]?.reason).toBe('delayed');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle multi-admin session navigation', () => {
      // Simulate multiple admin scenario
      Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
      
      // Admin 1 starts test
      service.handleSessionStateChange('in-progress', 'SESSION_1');
      
      // Admin 2 tries to navigate while test in progress
      const result = service.navigateTo('TEACHER_LOBBY', 
        { sessionCode: 'SESSION_1' }, 
        { reason: 'admin2_action' }
      );
      
      expect(result.success).toBe(true);
    });

    it('should handle student joining mid-test', () => {
      service.updateState('login');
      service.reset();
      service.initialize(mockNavigate, 'student');
      
      // Student joins while test in progress
      service.navigateTo('STUDENT_TEST', 
        { sessionCode: 'ACTIVE_TEST' }, 
        { reason: 'late_join' }
      );
      
      expect(mockNavigate).toHaveBeenCalledWith(
        '/student-test/ACTIVE_TEST',
        expect.any(Object)
      );
    });

    it('should handle rapid navigation attempts', () => {
      // Rapid fire navigation (simulating race condition)
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(service.navigateTo('SESSIONS', {}, { reason: `rapid${i}` }));
      }
      
      // First should succeed, others blocked
      expect(results[0]?.success).toBe(true);
      expect(results.slice(1).some(r => r?.blocked)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle many navigation calls efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        Object.defineProperty(window, 'location', { 
          value: { pathname: `/${i}` }, 
          writable: true 
        });
        service.navigateTo('SESSIONS', {}, { reason: `perf${i}` });
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should efficiently check navigation loops', () => {
      // Build up history
      for (let i = 0; i < 10; i++) {
        Object.defineProperty(window, 'location', { 
          value: { pathname: `/${i}` }, 
          writable: true 
        });
        service.navigateTo('SESSIONS', {}, { reason: `setup${i}` });
      }
      
      const start = performance.now();
      
      // Check for loops many times
      for (let i = 0; i < 1000; i++) {
        service.navigateTo('LOGIN', {}, { reason: 'loop_check' });
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200); // Should be very fast
    });
  });
});
