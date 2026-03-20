import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigationService } from '../services/navigation.service';
import {
  useNavigation,
  useNavigationDebug,
  useNavigationHistory,
} from './useNavigation';

const { mockNavigate, mockLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLocation: { pathname: '/' },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

describe('useNavigation', () => {
  const setPath = (pathname: string) => {
    mockLocation.pathname = pathname;
    Object.defineProperty(window, 'location', {
      value: { pathname },
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigate.mockReset();
    navigationService.reset();
    navigationService.setDebugMode(false);
    setPath('/');
  });

  afterEach(() => {
    navigationService.reset();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes the service with the requested role', () => {
    const { result, rerender } = renderHook(() => useNavigation('teacher'));
    rerender();

    expect(result.current.context.role).toBe('teacher');
    expect(navigationService.getContext().role).toBe('teacher');
  });

  it('returns the current path from the router location', () => {
    setPath('/admin/dashboard');

    const { result } = renderHook(() => useNavigation('admin'));

    expect(result.current.currentPath).toBe('/admin/dashboard');
  });

  it('delegates navigateTo to the navigation service', () => {
    const navigateSpy = vi
      .spyOn(navigationService, 'navigateTo')
      .mockReturnValue({ success: true, destination: '/sessions' });
    const { result } = renderHook(() => useNavigation());

    let response;
    act(() => {
      response = result.current.navigateTo('SESSIONS', {}, { reason: 'hook_test' });
    });

    expect(navigateSpy).toHaveBeenCalledWith('SESSIONS', {}, { reason: 'hook_test' });
    expect(response).toEqual({ success: true, destination: '/sessions' });
  });

  it('delegates session changes to the navigation service', () => {
    const sessionSpy = vi.spyOn(navigationService, 'handleSessionStateChange');
    const { result } = renderHook(() => useNavigation('student'));

    act(() => {
      result.current.handleSessionChange('waiting', 'SESSION_1');
    });

    expect(sessionSpy).toHaveBeenCalledWith('waiting', 'SESSION_1');
  });

  it('delegates test changes to the navigation service', () => {
    const testSpy = vi.spyOn(navigationService, 'handleTestChange');
    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.handleTestChange(null, 'SESSION_1');
    });

    expect(testSpy).toHaveBeenCalledWith(null, 'SESSION_1');
  });

  it('keeps its callbacks stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useNavigation());
    const firstNavigate = result.current.navigateTo;
    const firstSessionHandler = result.current.handleSessionChange;
    const firstTestHandler = result.current.handleTestChange;

    rerender();

    expect(result.current.navigateTo).toBe(firstNavigate);
    expect(result.current.handleSessionChange).toBe(firstSessionHandler);
    expect(result.current.handleTestChange).toBe(firstTestHandler);
  });

  it('reads context and history snapshots on rerender', () => {
    const { result, rerender } = renderHook(() => useNavigation());
    vi.spyOn(navigationService, 'getHistory').mockReturnValue([
      {
        from: '/',
        to: '/sessions',
        reason: 'snapshot',
        timestamp: Date.now(),
      },
    ]);
    vi.spyOn(navigationService, 'getContext').mockReturnValue({
      currentState: 'in_test',
      role: 'student',
      isNavigating: true,
      lastNavigation: {
        from: '/',
        to: '/sessions',
        reason: 'snapshot',
        timestamp: Date.now(),
      },
    });

    rerender();

    expect(result.current.navigationHistory).toEqual([
      expect.objectContaining({
        to: '/sessions',
        reason: 'snapshot',
      }),
    ]);
    expect(result.current.context).toEqual(
      expect.objectContaining({
        currentState: 'in_test',
        isNavigating: true,
        lastNavigation: expect.objectContaining({
          to: '/sessions',
          reason: 'snapshot',
        }),
      })
    );
  });
});

describe('useNavigationHistory', () => {
  const setPath = (pathname: string) => {
    mockLocation.pathname = pathname;
    Object.defineProperty(window, 'location', {
      value: { pathname },
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigate.mockReset();
    navigationService.reset();
    navigationService.setDebugMode(false);
    setPath('/');
    navigationService.initialize(mockNavigate, 'student');
  });

  afterEach(() => {
    navigationService.reset();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('polls the navigation service for history updates', () => {
    const getHistorySpy = vi
      .spyOn(navigationService, 'getHistory')
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          from: '/',
          to: '/sessions',
          reason: 'history_poll',
          timestamp: Date.now(),
        },
      ]);
    const { result } = renderHook(() => useNavigationHistory());

    expect(result.current).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(getHistorySpy).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual([
      expect.objectContaining({
        to: '/sessions',
        reason: 'history_poll',
      }),
    ]);
  });
});

describe('useNavigationDebug', () => {
  const setPath = (pathname: string) => {
    mockLocation.pathname = pathname;
    Object.defineProperty(window, 'location', {
      value: { pathname },
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigate.mockReset();
    navigationService.reset();
    navigationService.setDebugMode(false);
    setPath('/');
    navigationService.initialize(mockNavigate, 'student');
  });

  afterEach(() => {
    navigationService.reset();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('logs the latest navigation record after the polling interval', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(navigationService, 'getHistory')
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          from: '/',
          to: '/sessions',
          reason: 'debug_reason',
          timestamp: Date.now(),
        },
      ]);

    renderHook(() => useNavigationDebug('DebugPanel'));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[DebugPanel] Navigation:',
      expect.objectContaining({
        from: '/',
        to: '/sessions',
        reason: 'debug_reason',
      })
    );
  });
});
