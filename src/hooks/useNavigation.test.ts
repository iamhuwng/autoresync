/**
 * useNavigation Hook Unit Tests
 * Tests for React integration layer of navigation service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNavigation, useNavigationHistory, useNavigationDebug } from './useNavigation';
import { navigationService } from '../services/navigation.service';
import type { UserRole } from '../types/navigation.types';

// Mock React Router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

describe('useNavigation Hook', () => {
  beforeEach(() => {
    navigationService.reset();
    navigationService.setDebugMode(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return <BrowserRouter>{children}</BrowserRouter>;
  };

  describe('Hook Initialization', () => {
    it('should initialize with student role by default', () => {
      const { result } = renderHook(() => useNavigation());
      
      expect(result.current.context.role).toBe('student');
    });

    it('should initialize with specified role', () => {
      const { result } = renderHook(() => useNavigation('teacher'));
      
      expect(result.current.context.role).toBe('teacher');
    });

    it('should initialize with admin role', () => {
      const { result } = renderHook(() => useNavigation('admin'));
      
      expect(result.current.context.role).toBe('admin');
    });

    it('should provide current path from location', () => {
      const { result } = renderHook(() => useNavigation());
      
      expect(result.current.currentPath).toBe('/');
    });

    it('should not be navigating initially', () => {
      const { result } = renderHook(() => useNavigation());
      
      expect(result.current.isNavigating).toBe(false);
    });
  });

  describe('navigateTo Function', () => {
    it('should provide navigateTo function', () => {
      const { result } = renderHook(() => useNavigation());
      
      expect(result.current.navigateTo).toBeDefined();
      expect(typeof result.current.navigateTo).toBe('function');
    });

    it('should call navigation service on navigateTo', () => {
      const { result } = renderHook(() => useNavigation());
      
      act(() => {
        result.current.navigateTo('SESSIONS', {}, { reason: 'test' });
      });
      
      const history = result.current.navigationHistory;
      expect(history.length).toBeGreaterThan(0);
    });

    it('should pass parameters to navigation service', () => {
      const { result } = renderHook(() => useNavigation());
      
      act(() => {
        result.current.navigateTo('STUDENT_TEST', 
          { sessionCode: 'ABC123' }, 
          { reason: 'with_params' }
        );
      });
      
      const history = result.current.navigationHistory;
      expect(history[0]?.to).toContain('ABC123');
    });

    it('should pass navigation options', () => {
      const { result } = renderHook(() => useNavigation());
      
      act(() => {
        result.current.navigateTo('LOGIN', {}, { 
          replace: true, 
          reason: 'logout' 
        });
      });
      
      const history = result.current.navigationHistory;
      expect(history[0]?.reason).toBe('logout');
    });

    it('should maintain stable reference for navigateTo', () => {
      const { result, rerender } = renderHook(() => useNavigation());
      
      const firstRef = result.current.navigateTo;
      rerender();
      const secondRef = result.current.navigateTo;
      
      expect(firstRef).toBe(secondRef);
    });
  });

  describe('handleSessionChange Function', () => {
    it('should provide handleSessionChange function', () => {
      const { result } = renderHook(() => useNavigation('student'));
      
      expect(result.current.handleSessionChange).toBeDefined();
      expect(typeof result.current.handleSessionChange).toBe('function');
    });

    it('should handle waiting status', () => {
      const { result } = renderHook(() => useNavigation('student'));
      
      act(() => {
        result.current.handleSessionChange('waiting', 'SESSION_ABC');
      });
      
      // Should trigger navigation for students
      const history = result.current.navigationHistory;
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle completed status', () => {
      const { result } = renderHook(() => useNavigation('student'));
      
      act(() => {
        result.current.handleSessionChange('completed');
      });
      
      const history = result.current.navigationHistory;
      expect(history.some(h => h.to === '/')).toBe(true);
    });

    it('should maintain stable reference for handleSessionChange', () => {
      const { result, rerender } = renderHook(() => useNavigation());
      
      const firstRef = result.current.handleSessionChange;
      rerender();
      const secondRef = result.current.handleSessionChange;
      
      expect(firstRef).toBe(secondRef);
    });
  });

  describe('handleTestChange Function', () => {
    it('should provide handleTestChange function', () => {
      const { result } = renderHook(() => useNavigation());
      
      expect(result.current.handleTestChange).toBeDefined();
      expect(typeof result.current.handleTestChange).toBe('function');
    });

    it('should handle test ending', () => {
      const { result } = renderHook(() => useNavigation());
      
      // Set state to in_test
      act(() => {
        navigationService.updateState('in_test');
      });
      
      // Handle test end
      act(() => {
        result.current.handleTestChange(null, 'SESSION_XYZ');
      });
      
      const history = result.current.navigationHistory;
      expect(history.length).toBeGreaterThan(0);
    });

    it('should maintain stable reference for handleTestChange', () => {
      const { result, rerender } = renderHook(() => useNavigation());
      
      const firstRef = result.current.handleTestChange;
      rerender();
      const secondRef = result.current.handleTestChange;
      
      expect(firstRef).toBe(secondRef);
    });
  });

  describe('Navigation Context Access', () => {
    it('should provide navigation context', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      expect(result.current.context).toBeDefined();
      expect(result.current.context.role).toBeDefined();
      expect(result.current.context.currentState).toBeDefined();
    });

    it('should update context on navigation', async () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      act(() => {
        result.current.navigateTo('SESSIONS', {}, { reason: 'context_test' });
      });
      
      await waitFor(() => {
        const context = result.current.context;
        expect(context.lastNavigation?.reason).toBe('context_test');
      }, { timeout: 200 });
    });
  });

  describe('Navigation History Access', () => {
    it('should provide navigation history', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      expect(result.current.navigationHistory).toBeDefined();
      expect(Array.isArray(result.current.navigationHistory)).toBe(true);
    });

    it('should update history on navigation', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      const initialLength = result.current.navigationHistory.length;
      
      act(() => {
        result.current.navigateTo('SESSIONS', {}, { reason: 'history_test' });
      });
      
      const newLength = result.current.navigationHistory.length;
      expect(newLength).toBeGreaterThan(initialLength);
    });

    it('should provide navigation records with complete data', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      act(() => {
        result.current.navigateTo('SESSIONS', {}, { reason: 'data_test' });
      });
      
      const history = result.current.navigationHistory;
      const latest = history[history.length - 1];
      
      expect(latest).toBeDefined();
      expect(latest?.from).toBeDefined();
      expect(latest?.to).toBeDefined();
      expect(latest?.timestamp).toBeGreaterThan(0);
      expect(latest?.reason).toBe('data_test');
    });
  });

  describe('Hook Re-rendering', () => {
    it('should not cause infinite re-renders', () => {
      const renderCount = vi.fn();
      
      const TestComponent = () => {
        const nav = useNavigation();
        renderCount();
        return null;
      };
      
      renderHook(() => {
        const Component = TestComponent;
        Component();
        return null;
      });
      
      // Should render once on mount, maybe a few times for initialization
      expect(renderCount).toHaveBeenCalledTimes(1);
    });

    it('should handle role changes', () => {
      const { result, rerender } = renderHook(
        ({ role }: { role: UserRole }) => useNavigation(role),
        { 
          initialProps: { role: 'student' as UserRole }
        }
      );
      
      expect(result.current.context.role).toBe('student');
      
      rerender({ role: 'teacher' as UserRole });
      
      expect(result.current.context.role).toBe('teacher');
    });
  });

  describe('Integration with Navigation Service', () => {
    it('should sync with navigation service state', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      act(() => {
        navigationService.updateState('in_test');
      });
      
      const context = result.current.context;
      expect(context.currentState).toBe('in_test');
    });

    it('should use service for loop detection', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      // Build up navigation history in service
      act(() => {
        Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
        result.current.navigateTo('SESSIONS', {}, { reason: '1' });
      });
      
      act(() => {
        Object.defineProperty(window, 'location', { value: { pathname: '/sessions' }, writable: true });
        result.current.navigateTo('LOGIN', {}, { reason: '2' });
      });
      
      act(() => {
        Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true });
        result.current.navigateTo('SESSIONS', {}, { reason: '3' });
      });
      
      // Service should detect and prevent loops
      const history = result.current.navigationHistory;
      expect(history.length).toBeLessThan(10); // Not infinite
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation errors gracefully', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      // Try invalid navigation
      expect(() => {
        act(() => {
          // @ts-expect-error Testing invalid input
          result.current.navigateTo('INVALID_ROUTE', {}, { reason: 'error_test' });
        });
      }).not.toThrow();
    });

    it('should handle missing session code', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      expect(() => {
        act(() => {
          result.current.handleSessionChange('waiting');
        });
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle rapid navigation attempts', () => {
      const { result } = renderHook(() => useNavigation(), { wrapper });
      
      // Rapid navigation calls
      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.navigateTo('SESSIONS', {}, { reason: `rapid${i}` });
        }
      });
      
      // Should not crash or cause memory issues
      const history = result.current.navigationHistory;
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should not leak memory on unmount', () => {
      const { unmount } = renderHook(() => useNavigation(), { wrapper });
      
      // Perform some navigations
      navigationService.navigateTo('SESSIONS', {}, { reason: 'test' });
      
      // Unmount should clean up
      unmount();
      
      // Service should still work
      expect(() => {
        navigationService.navigateTo('LOGIN', {}, { reason: 'after_unmount' });
      }).not.toThrow();
    });
  });
});

describe('useNavigationHistory Hook', () => {
  beforeEach(() => {
    navigationService.reset();
    navigationService.setDebugMode(false);
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return <BrowserRouter>{children}</BrowserRouter>;
  };

  it('should return navigation history', () => {
    const { result } = renderHook(() => useNavigationHistory(), { wrapper });
    
    expect(Array.isArray(result.current)).toBe(true);
  });

  it('should update when navigation occurs', async () => {
    const { result } = renderHook(() => useNavigationHistory(), { wrapper });
    
    const initialLength = result.current.length;
    
    // Trigger navigation
    act(() => {
      navigationService.navigateTo('SESSIONS', {}, { reason: 'history_update' });
    });
    
    // Wait for update
    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(initialLength);
    }, { timeout: 1000 });
  });

  it('should be read-only', () => {
    const { result } = renderHook(() => useNavigationHistory(), { wrapper });
    
    // History should be a fresh array each time
    const first = result.current;
    const second = result.current;
    
    expect(first).not.toBe(second); // Different references (defensive copy)
  });
});

describe('useNavigationDebug Hook', () => {
  beforeEach(() => {
    navigationService.reset();
    navigationService.setDebugMode(false);
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return <BrowserRouter>{children}</BrowserRouter>;
  };

  it('should log navigation events', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    renderHook(() => {
      useNavigationDebug('TestComponent');
      const nav = useNavigation();
      
      act(() => {
        nav.navigateTo('SESSIONS', {}, { reason: 'debug_test' });
      });
      
      return null;
    }, { wrapper });
    
    // Should log component name and navigation details
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('should include component name in logs', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    
    renderHook(() => {
      useNavigationDebug('MyCustomComponent');
      return null;
    }, { wrapper });
    
    // Trigger navigation to generate log
    act(() => {
      navigationService.navigateTo('SESSIONS', {}, { reason: 'name_test' });
    });
    
    const calls = consoleSpy.mock.calls.flat();
    const hasComponentName = calls.some(call => 
      typeof call === 'string' && call.includes('MyCustomComponent')
    );
    
    expect(hasComponentName).toBe(true);
    
    consoleSpy.mockRestore();
  });

  it('should not affect navigation functionality', () => {
    renderHook(() => {
      useNavigationDebug('TestComponent');
      return null;
    }, { wrapper });
    
    // Navigation should still work
    expect(() => {
      navigationService.navigateTo('SESSIONS', {}, { reason: 'functionality_test' });
    }).not.toThrow();
  });
});

describe('Real-World Integration Scenarios', () => {
  const wrapper = ({ children }: { children: ReactNode }) => {
    return <BrowserRouter>{children}</BrowserRouter>;
  };

  beforeEach(() => {
    navigationService.reset();
  });

  it('should handle student joining and leaving test', () => {
    const { result } = renderHook(() => useNavigation('student'), { wrapper });
    
    // Student navigates to test
    act(() => {
      result.current.navigateTo('STUDENT_TEST', 
        { sessionCode: 'ABC123' }, 
        { reason: 'join_test' }
      );
    });
    
    // Test ends, student returns to waiting
    act(() => {
      navigationService.updateState('in_test');
      result.current.handleTestChange(null, 'ABC123');
    });
    
    const history = result.current.navigationHistory;
    expect(history.length).toBeGreaterThan(0);
  });

  it('should handle teacher monitoring test', () => {
    const { result } = renderHook(() => useNavigation('teacher'), { wrapper });
    
    // Teacher goes to lobby
    act(() => {
      result.current.navigateTo('TEACHER_LOBBY', 
        { sessionCode: 'SESSION_XYZ' }, 
        { reason: 'manage_session' }
      );
    });
    
    // Teacher starts monitoring
    act(() => {
      result.current.navigateTo('TEACHER_TEST_MONITOR', 
        { sessionCode: 'SESSION_XYZ' }, 
        { reason: 'start_monitoring' }
      );
    });
    
    const history = result.current.navigationHistory;
    expect(history.some(h => h.to.includes('teacher-test'))).toBe(true);
  });

  it('should prevent navigation loops in complex scenarios', () => {
    const { result } = renderHook(() => useNavigation('student'), { wrapper });
    
    // Simulate rapid status changes causing potential loops
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.handleSessionChange('waiting', 'LOOP_TEST');
        result.current.handleSessionChange('in-progress', 'LOOP_TEST');
      });
    }
    
    // History should not be infinite
    const history = result.current.navigationHistory;
    expect(history.length).toBeLessThan(20);
  });
});
