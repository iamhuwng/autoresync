/**
 * useBeforeUnloadWarning Hook
 * PRD-0019 Task 6.7: Warn students before leaving page during test
 * 
 * Displays browser warning when student attempts to close/refresh
 * the page while test is in progress and not yet submitted.
 */

import { useEffect } from 'react';

interface UseBeforeUnloadWarningOptions {
  /** Whether the test is currently active (not submitted) */
  enabled: boolean;
  /** Custom warning message (browser may override with default) */
  message?: string;
}

/**
 * Hook to warn users before leaving the page during an active test.
 * 
 * @param options - Configuration options
 * 
 * @example
 * ```tsx
 * useBeforeUnloadWarning({
 *   enabled: !testSubmitted && sessionStatus === 'in-progress',
 *   message: 'Your test progress will be saved, but you should complete the test.'
 * });
 * ```
 */
export const useBeforeUnloadWarning = ({
  enabled,
  message = 'Are you sure you want to leave? Your progress will be saved, but you should complete the test.',
}: UseBeforeUnloadWarningOptions): void => {
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Standard way to trigger browser warning
      e.preventDefault();
      
      // Chrome requires returnValue to be set
      e.returnValue = message;
      
      // Some browsers use the return value
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, message]);
};

export default useBeforeUnloadWarning;
