/**
 * useNavigation Hook
 * React integration layer for navigation service
 * 
 * Usage:
 *   const { navigateTo, handleSessionChange } = useNavigation('student');
 *   navigateTo('STUDENT_TEST', { sessionCode: 'ABC123' }, { reason: 'test_started' });
 */

import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { navigationService } from '../services/navigation.service';
import { RouteName, RouteParams } from '../constants/routes';
import type { 
  UserRole, 
  SessionStatus, 
  NavigationOptions, 
  NavigationResult,
  NavigationContext,
  NavigationRecord
} from '../types/navigation.types';

export interface UseNavigationReturn {
  navigateTo: (destination: RouteName, params?: RouteParams, options?: NavigationOptions) => NavigationResult;
  handleSessionChange: (status: SessionStatus, sessionCode?: string) => void;
  handleTestChange: (testId: string | null, sessionCode?: string) => void;
  currentPath: string;
  isNavigating: boolean;
  navigationHistory: NavigationRecord[];
  context: NavigationContext;
}

/**
 * Hook for accessing centralized navigation
 * @param role - User role for role-based navigation
 * @returns Navigation utilities and state
 */
export const useNavigation = (role: UserRole = 'student'): UseNavigationReturn => {
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize service with navigate function
  useEffect(() => {
    navigationService.initialize(navigate, role);
  }, [navigate, role]);

  // Memoized navigation function
  const navigateTo = useCallback((
    destination: RouteName,
    params?: RouteParams,
    options?: NavigationOptions
  ): NavigationResult => {
    return navigationService.navigateTo(destination, params, options);
  }, []);

  // Memoized session change handler
  const handleSessionChange = useCallback((
    status: SessionStatus,
    sessionCode?: string
  ): void => {
    navigationService.handleSessionStateChange(status, sessionCode);
  }, []);

  // Memoized test change handler
  const handleTestChange = useCallback((
    testId: string | null,
    sessionCode?: string
  ): void => {
    navigationService.handleTestChange(testId, sessionCode);
  }, []);

  return {
    navigateTo,
    handleSessionChange,
    handleTestChange,
    currentPath: location.pathname,
    isNavigating: navigationService.getContext().isNavigating,
    navigationHistory: navigationService.getHistory(),
    context: navigationService.getContext(),
  };
};

/**
 * Hook for accessing navigation history (read-only)
 * Useful for debugging components
 */
export const useNavigationHistory = (): NavigationRecord[] => {
  const [history, setHistory] = useState<NavigationRecord[]>([]);

  useEffect(() => {
    const updateHistory = () => {
      setHistory(navigationService.getHistory());
    };

    // Update every 500ms
    const interval = setInterval(updateHistory, 500);
    updateHistory(); // Initial update

    return () => clearInterval(interval);
  }, []);

  return history;
};

/**
 * Hook for navigation debugging
 * Logs all navigation attempts to console
 */
export const useNavigationDebug = (componentName: string): void => {
  const history = useNavigationHistory();

  useEffect(() => {
    if (history.length > 0) {
      const latest = history[history.length - 1];
      if (latest) {
        console.log(`[${componentName}] Navigation:`, {
          from: latest.from,
          to: latest.to,
          reason: latest.reason,
          timestamp: new Date(latest.timestamp).toLocaleTimeString(),
        });
      }
    }
  }, [history, componentName]);
};
