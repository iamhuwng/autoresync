/**
 * useFullscreenMode Hook — Fullscreen API Wrapper
 *
 * PRD-0036: Anti-Cheating & Test Integrity System (Task 3.4)
 *
 * Manages fullscreen mode for test-taking:
 *   - Requests fullscreen on mount (if enabled)
 *   - Monitors fullscreen exits and logs as integrity events
 *   - Gracefully degrades on unsupported browsers (mobile Safari, etc.)
 *   - Provides manual requestFullscreen for fallback UIs
 *
 * @module hooks/test/useFullscreenMode
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { IntegrityEvent } from '../../types/integrity.types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseFullscreenModeOptions {
  /** Whether fullscreen mode is required (maps to config.requireFullscreen) */
  enabled: boolean;
  /** Callback for fullscreen exit events — injected into useTestIntegrity's addEvent */
  onFullscreenExit: (event: IntegrityEvent) => void;
}

export interface UseFullscreenModeResult {
  /** Whether the browser is currently in fullscreen */
  isFullscreen: boolean;
  /** Whether the Fullscreen API is supported */
  isSupported: boolean;
  /** Manually request fullscreen (e.g., from a "Go fullscreen" button) */
  requestFullscreen: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useFullscreenMode({
  enabled,
  onFullscreenExit,
}: UseFullscreenModeOptions): UseFullscreenModeResult {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSupportedRef = useRef(true);
  const [isSupported, setIsSupported] = useState(true);

  // ── Request Fullscreen ──
  const requestFullscreen = useCallback(() => {
    if (!isSupportedRef.current) return;

    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => {
          console.warn('[Integrity] Fullscreen request failed (user gesture required?):', err);
        });
      } else {
        // Unsupported
        isSupportedRef.current = false;
        setIsSupported(false);
      }
    } catch (err) {
      console.warn('[Integrity] Fullscreen API not available:', err);
      isSupportedRef.current = false;
      setIsSupported(false);
    }
  }, []);

  // ── Auto-request on mount + monitor exits ──
  useEffect(() => {
    if (!enabled) return;

    // Attempt to enter fullscreen on mount
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch(() => {
          // Failed — likely no user gesture or mobile Safari
          isSupportedRef.current = false;
          setIsSupported(false);
          onFullscreenExit({
            type: 'fullscreen_unavailable',
            timestamp: Date.now(),
            withinGrace: true,
            counted: false,
          });
        });
      } else {
        isSupportedRef.current = false;
        setIsSupported(false);
        onFullscreenExit({
          type: 'fullscreen_unavailable',
          timestamp: Date.now(),
          withinGrace: true,
          counted: false,
        });
      }
    } catch {
      isSupportedRef.current = false;
      setIsSupported(false);
      onFullscreenExit({
        type: 'fullscreen_unavailable',
        timestamp: Date.now(),
        withinGrace: true,
        counted: false,
      });
    }

    // Monitor fullscreen changes
    const handler = () => {
      if (document.fullscreenElement === null) {
        setIsFullscreen(false);
        onFullscreenExit({
          type: 'fullscreen_exit',
          timestamp: Date.now(),
          withinGrace: false,
          counted: true,
        });
      } else {
        setIsFullscreen(true);
      }
    };

    document.addEventListener('fullscreenchange', handler);

    return () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, [enabled, onFullscreenExit]);

  return {
    isFullscreen,
    isSupported,
    requestFullscreen,
  };
}
