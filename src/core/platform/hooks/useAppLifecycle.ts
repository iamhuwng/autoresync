/**
 * Platform App Lifecycle Hook
 *
 * Handles app lifecycle events (before close, background/foreground) in a
 * platform-agnostic way.
 * Web: uses window.onbeforeunload
 * React Native (future): uses AppState + BackHandler
 *
 * @see documentation/rules/mobile-portability.md — Rule 19
 */

import { useEffect, useRef } from 'react';

interface AppLifecycleOptions {
  /** Called when user is about to leave/close the app. Return a string to show confirmation. */
  onBeforeUnload?: () => string | undefined | void;
  /** Called when app goes to background (web: visibilitychange hidden) */
  onBackground?: () => void;
  /** Called when app comes to foreground (web: visibilitychange visible) */
  onForeground?: () => void;
  /** Called when the page is being hidden/unloaded (web: pagehide) */
  onPageHide?: () => void;
}

export function useAppLifecycle(options: AppLifecycleOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Before unload (web: tab close / navigation away)
    const handleBeforeUnload = (e: BeforeUnloadEvent): string | undefined => {
      const message = optionsRef.current.onBeforeUnload?.();
      if (message) {
        e.preventDefault();
        // Some browsers require returnValue to be set
        e.returnValue = message;
        return message;
      }
      return undefined;
    };

    // Visibility change (web: tab switch, minimize)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        optionsRef.current.onBackground?.();
      } else if (document.visibilityState === 'visible') {
        optionsRef.current.onForeground?.();
      }
    };

    const handlePageHide = () => {
      optionsRef.current.onPageHide?.();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
