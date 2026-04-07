/**
 * Mobile Exam Mode Detection Hook
 *
 * Determines whether the current device should use the phone-optimized
 * Reading exam layout rather than the standard desktop/tablet two-column view.
 *
 * Detection priority:
 * 1. QA session-scoped override (__qa_mobile_exam_override__)
 * 2. Primary: navigator.userAgent mobile/handheld signals
 * 3. Secondary: useScreenSize().isMobile + pointer:coarse media query
 * 4. Fail-safe: returns false (desktop/tablet layout)
 *
 * @see documentation/rules/mobile-portability.md — Rule 19
 */

import { useState, useEffect, useMemo } from 'react';
import { useScreenSize } from './useScreenSize';
import { sessionStore } from '../storage';

/** QA session-scoped override key */
const QA_OVERRIDE_KEY = '__qa_mobile_exam_override__';

/** Supported override values */
type QaOverride = 'auto' | 'force-mobile' | 'force-standard';

/**
 * Check navigator.userAgent for mobile/handheld signals.
 * Returns true if the UA string contains typical phone identifiers.
 */
function detectMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Match common phone-class tokens; exclude iPad since iPad UA often contains 'Mobile'
  // but iPads should use the tablet/desktop layout.
  return /Mobi|Android.*Mobile|iPhone|iPod|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

/**
 * Check if the primary pointer is coarse (touch-only device).
 * Tablets also have coarse pointers, so this is a secondary signal only.
 */
function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export interface UseMobileExamModeResult {
  /** true when the phone-optimized Reading layout should render */
  isMobileExamMode: boolean;
}

export function useMobileExamMode(): UseMobileExamModeResult {
  const { isMobile } = useScreenSize();
  const [qaOverride, setQaOverride] = useState<QaOverride>('auto');

  // Load QA override from session-scoped platform storage
  useEffect(() => {
    let cancelled = false;
    const loadOverride = async () => {
      try {
        const stored = await sessionStore.getString(QA_OVERRIDE_KEY);
        if (!cancelled && stored) {
          const normalized = stored as QaOverride;
          if (['auto', 'force-mobile', 'force-standard'].includes(normalized)) {
            setQaOverride(normalized);
          }
        }
      } catch {
        // Silently default to 'auto'
      }
    };
    loadOverride();
    return () => { cancelled = true; };
  }, []);

  const isMobileExamMode = useMemo(() => {
    // 1. QA override takes precedence
    if (qaOverride === 'force-mobile') return true;
    if (qaOverride === 'force-standard') return false;

    // 2. Primary: navigator.userAgent heuristic
    const uaMobile = detectMobileUserAgent();
    if (uaMobile) return true;

    // 3. Secondary: small viewport + touch pointer
    if (isMobile && hasCoarsePointer()) return true;

    // 4. Fail-safe: uncertain → default to desktop/tablet
    return false;
  }, [qaOverride, isMobile]);

  return { isMobileExamMode };
}
