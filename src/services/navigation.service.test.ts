import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router-dom';
import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  let service: NavigationService;
  let mockNavigate: NavigateFunction;

  const setPath = (pathname: string) => {
    Object.defineProperty(window, 'location', {
      value: { pathname },
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    setPath('/');

    service = NavigationService.getInstance();
    service.reset();

    mockNavigate = vi.fn() as unknown as NavigateFunction;
    service.initialize(mockNavigate, 'student');
    service.setDebugMode(false);
  });

  afterEach(() => {
    service.reset();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes with the provided role and default state', () => {
    expect(service.getContext()).toMatchObject({
      role: 'student',
      currentState: 'login',
      isNavigating: false,
    });
  });

  it('does not emit navigation debug logs by default during initialize', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    service.reset();
    service.initialize(mockNavigate, 'student');

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('navigates to a route and records history', () => {
    const result = service.navigateTo('SESSIONS', {}, { reason: 'user_click' });

    expect(result).toEqual({ success: true, destination: '/sessions' });
    expect(mockNavigate).toHaveBeenCalledWith('/sessions', {
      replace: undefined,
      state: {},
    });
    expect(service.getHistory()).toEqual([
      expect.objectContaining({
        from: '/',
        to: '/sessions',
        reason: 'user_click',
        timestamp: expect.any(Number),
      }),
    ]);
    expect(service.getContext().lastNavigation).toEqual(
      expect.objectContaining({
        to: '/sessions',
        reason: 'user_click',
      })
    );
  });

  it('blocks overlapping navigation unless forced', () => {
    service.navigateTo('SESSIONS', {}, { reason: 'first' });

    const blocked = service.navigateTo('LOGIN', {}, { reason: 'second' });
    const forced = service.navigateTo('LOGIN', {}, { reason: 'forced', force: true });

    expect(blocked).toEqual({
      success: false,
      blocked: true,
      reason: 'already_navigating',
    });
    expect(forced).toEqual({ success: true, destination: '/' });
  });

  it('returns already_at_destination when navigating to the current path', () => {
    setPath('/sessions');

    const result = service.navigateTo('SESSIONS', {}, { reason: 'noop' });

    expect(result).toEqual({
      success: true,
      destination: '/sessions',
      reason: 'already_at_destination',
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('queues session-critical navigation and retries it after the lock clears', () => {
    service.navigateTo('SESSIONS', {}, { reason: 'first' });
    setPath('/sessions');

    const blocked = service.navigateTo('LOGIN', {}, {
      reason: 'session_completed',
      replace: true,
    });

    expect(blocked).toEqual({
      success: false,
      blocked: true,
      reason: 'already_navigating',
    });

    vi.advanceTimersByTime(300);

    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/', {
      replace: true,
      state: {},
    });
  });

  it('delays navigation when requested but records it immediately', () => {
    const result = service.navigateTo('SESSIONS', {}, {
      reason: 'delayed',
      delay: 100,
    });

    expect(result).toEqual({ success: true, destination: '/sessions' });
    expect(service.getHistory()).toHaveLength(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(mockNavigate).toHaveBeenCalledWith('/sessions', {
      replace: undefined,
      state: {},
    });
  });

  it('routes student session updates to the expected destinations', () => {
    service.handleSessionStateChange('waiting', 'ABC123');
    vi.advanceTimersByTime(300);
    setPath('/student-wait/ABC123');

    service.handleSessionStateChange('completed');

    expect(mockNavigate).toHaveBeenNthCalledWith(
      1,
      '/student-wait/ABC123',
      expect.objectContaining({
        state: { gameSessionId: 'ABC123' },
      })
    );
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/', {
      replace: true,
      state: {},
    });
  });

  it('does not redirect teachers on student-only session states', () => {
    service.reset();
    service.initialize(mockNavigate, 'teacher');
    service.setDebugMode(false);

    service.handleSessionStateChange('waiting', 'ABC123');

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns students to the waiting room when a test disappears mid-session', () => {
    service.updateState('in_test');

    service.handleTestChange(null, 'ABC123');

    expect(mockNavigate).toHaveBeenCalledWith(
      '/student-wait/ABC123',
      expect.objectContaining({
        state: { gameSessionId: 'ABC123' },
      })
    );
  });

  it('caps navigation history at ten records and can clear it', () => {
    for (let index = 0; index < 12; index += 1) {
      setPath(`/from-${index}`);
      service.navigateTo('SESSIONS', {}, { reason: `nav-${index}`, force: true });
    }

    const history = service.getHistory();

    expect(history).toHaveLength(10);
    expect(history[0]?.reason).toBe('nav-2');
    expect(history[9]?.reason).toBe('nav-11');

    service.clearHistory();

    expect(service.getHistory()).toEqual([]);
  });

  it('returns invalid_route for unknown destinations', () => {
    const result = service.navigateTo('INVALID_ROUTE' as never, {}, { reason: 'invalid' });

    expect(result).toEqual({ success: false, reason: 'invalid_route' });
  });

  it('blocks a repeated navigation pair once it appears twice in the loop window', () => {
    setPath('/repeat');
    service.navigateTo('SESSIONS', {}, { reason: 'first', force: true });
    setPath('/repeat');
    service.navigateTo('SESSIONS', {}, { reason: 'second', force: true });
    setPath('/repeat');

    const result = service.navigateTo('SESSIONS', {}, { reason: 'third', force: true });

    expect(result).toEqual({
      success: false,
      blocked: true,
      reason: 'loop_detected',
    });
  });
});
