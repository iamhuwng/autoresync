/**
 * Mobile Exam Mode Detection Hook
 *
 * Determines whether the current device should use the phone-optimized
 * exam layout rather than the standard desktop/tablet two-column view.
 *
 * Detection priority (UA-first architecture):
 * 1. QA session-scoped override (__qa_mobile_exam_override__)
 * 2. **Primary gate**: navigator.userAgent — if UA contains a definitive
 *    mobile token (Mobi, iPhone, iPod, etc.) → mobile. If UA contains a
 *    definitive desktop token (Windows, Macintosh, CrOS, Linux x86) → desktop.
 * 3. Only when UA is genuinely ambiguous (e.g., WebView, bot, unusual agent):
 *    secondary heuristics (screen size, pointer type, hover capability)
 * 4. Fail-safe: false (desktop/tablet layout)
 *
 * The previous architecture treated `pointer: coarse` as a strong mobile
 * signal, which caused false positives on touchscreen laptops and when
 * Chrome DevTools emulated touch. Now hardware signals are SUPPRESSED
 * whenever the UA contains a desktop platform identifier.
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

// ── UA Detection Helpers ────────────────────────────────────────────────────

/** Returns true if the UA contains unambiguous phone-class identifiers. */
function hasMobileUATokens(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Match common phone-class tokens.
  // Exclude iPad — iPad UA sometimes contains 'Mobile' but should use tablet layout.
  return /Mobi|Android.*Mobile|iPhone|iPod|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

/** Returns true if the UA contains unambiguous desktop/laptop platform tokens. */
function hasDesktopUATokens(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Windows, macOS, Chrome OS, or Linux on x86/x86_64 → definitely not a phone.
  return /Windows NT|Macintosh|CrOS|Linux\s+(x86|i[36]86|amd64)/i.test(ua);
}

// ── Hardware Signal Helpers (secondary only) ────────────────────────────────

/** Primary pointer is coarse (touch-only device). */
function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Device has a hover-capable pointer (mouse/trackpad). Strong desktop indicator. */
function hasHoverCapablePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover)').matches || window.matchMedia('(any-hover: hover)').matches;
}

/** Physical screen short-side < 768px → phone-class hardware. */
function hasPhoneSizedScreen(): boolean {
  if (typeof window === 'undefined' || !window.screen) return false;
  const shortestSide = Math.min(window.screen.width || 0, window.screen.height || 0);
  return shortestSide > 0 && shortestSide < 768;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UseMobileExamModeResult {
  /** true when the phone-optimized exam layout should render */
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
    // ── 1. QA override takes precedence ──────────────────────────────────
    if (qaOverride === 'force-mobile') {
      console.log('[MobileExamMode] → MOBILE (QA force-mobile override)');
      return true;
    }
    if (qaOverride === 'force-standard') {
      console.log('[MobileExamMode] → DESKTOP (QA force-standard override)');
      return false;
    }

    // ── 2. Primary gate: User-Agent analysis ─────────────────────────────
    const uaMobile = hasMobileUATokens();
    const uaDesktop = hasDesktopUATokens();

    // 2a. UA says mobile → mobile. Period.
    if (uaMobile) {
      console.log('[MobileExamMode] → MOBILE (UA mobile tokens detected)');
      return true;
    }

    // 2b. UA says desktop → desktop. Hardware signals are SUPPRESSED.
    //     This prevents touchscreen laptops / DevTools emulation from
    //     false-positiving into mobile mode.
    if (uaDesktop) {
      console.log('[MobileExamMode] → DESKTOP (UA desktop tokens detected, hardware signals suppressed)');
      return false;
    }

    // ── 3. Ambiguous UA — fall through to hardware heuristics ────────────
    //    This path is for unusual agents (WebViews, bots, etc.) where the
    //    UA string doesn't contain standard platform tokens.

    // 3a. Hover-capable pointer → almost certainly desktop/laptop
    if (hasHoverCapablePointer()) {
      console.log('[MobileExamMode] → DESKTOP (ambiguous UA, but hover:hover detected)');
      return false;
    }

    // 3b. Touch-only + small viewport or phone-sized screen → phone
    if (hasCoarsePointer() && (isMobile || hasPhoneSizedScreen())) {
      console.log('[MobileExamMode] → MOBILE (ambiguous UA, coarse pointer + small screen)');
      return true;
    }

    // ── 4. Fail-safe: uncertain → default to desktop/tablet ──────────────
    console.log('[MobileExamMode] → DESKTOP (fail-safe: no definitive signals)');
    return false;
  }, [qaOverride, isMobile]);

  return { isMobileExamMode };
}
