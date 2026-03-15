/**
 * useTestIntegrity Hook — Core Anti-Cheat Detection Engine
 *
 * PRD-0036: Anti-Cheating & Test Integrity System (Task 2.0)
 *
 * Central hook that:
 *   - Detects tab switches (visibilitychange + blur/focus)
 *   - Applies grace period logic (first 2 switches free + <5s grace)
 *   - Buffers events in memory + sessionStorage for crash recovery
 *   - Batches RTDB writes every 5 minutes (session context only)
 *   - Manages student warning escalation (toast → escalated → final)
 *   - Triggers auto-submit when threshold is reached
 *   - Tracks time-per-question for post-analysis
 *   - Provides devtools resize heuristic detection
 *
 * External hooks (useAntiCopyPaste, useFullscreenMode) inject events
 * via the exposed `addEvent` function.
 *
 * @module hooks/test/useTestIntegrity
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AntiCheatConfig,
  IntegrityEvent,
  IntegrityReport,
} from '../../types/integrity.types';
import { EMPTY_INTEGRITY_REPORT } from '../../types/integrity.types';
import { computeRiskLevel } from '../../utils/antiCheatPresets';

// ============================================================================
// TYPES
// ============================================================================

export interface UseTestIntegrityOptions {
  config: AntiCheatConfig | null;
  context: 'session' | 'homework' | 'solo';
  sessionCode?: string; // Required for session context (RTDB writes)
  studentId: string;
  testId: string;
}

export interface UseTestIntegrityResult {
  violationCount: number;
  totalEvents: number;
  warningLevel: 'none' | 'toast' | 'escalated' | 'final';
  warningMessage: string;
  shouldAutoSubmit: boolean;
  flushEvents: () => Promise<void>;
  getIntegrityReport: () => IntegrityReport;
  addEvent: (event: IntegrityEvent) => void;
  trackQuestionTime: (questionIndex: number) => void;
}

// ============================================================================
// WARNING MESSAGES
// ============================================================================

const WARNING_MESSAGES = {
  none: '',
  toast: 'Please stay on this page to complete your work.',
  escalated:
    'You have left this page multiple times. Continuing may affect your submission.',
  final:
    "Your submission is about to be finalized. Click 'Continue Test' to keep working, or your current answers will be submitted.",
} as const;

// ============================================================================
// NO-OP RESULT
// ============================================================================

const NOOP_RESULT: UseTestIntegrityResult = {
  violationCount: 0,
  totalEvents: 0,
  warningLevel: 'none',
  warningMessage: '',
  shouldAutoSubmit: false,
  flushEvents: async () => {},
  getIntegrityReport: () => ({ ...EMPTY_INTEGRITY_REPORT }),
  addEvent: () => {},
  trackQuestionTime: () => {},
};

// ============================================================================
// HELPER — build report from event buffer
// ============================================================================

function buildReport(
  events: IntegrityEvent[],
  forceSubmitted: boolean,
  forceSubmittedBy: 'system' | 'teacher' | null,
): IntegrityReport {
  let violationCount = 0;
  let tabSwitchCount = 0;
  let totalTimeAwayMs = 0;
  let copyAttempts = 0;
  let pasteAttempts = 0;
  let rightClickAttempts = 0;
  let fullscreenExitCount = 0;
  let keyboardShortcutAttempts = 0;

  for (const evt of events) {
    if (evt.counted) violationCount++;

    switch (evt.type) {
      case 'tab_switch':
      case 'window_blur':
        tabSwitchCount++;
        if (evt.durationMs) totalTimeAwayMs += evt.durationMs;
        break;
      case 'copy_attempt':
        copyAttempts++;
        break;
      case 'paste_attempt':
        pasteAttempts++;
        break;
      case 'right_click':
        rightClickAttempts++;
        break;
      case 'fullscreen_exit':
        fullscreenExitCount++;
        break;
      case 'keyboard_shortcut':
        keyboardShortcutAttempts++;
        break;
    }
  }

  return {
    violationCount,
    totalEvents: events.length,
    tabSwitchCount,
    totalTimeAwayMs,
    copyAttempts,
    pasteAttempts,
    rightClickAttempts,
    fullscreenExitCount,
    keyboardShortcutAttempts,
    forceSubmitted,
    forceSubmittedBy,
    riskLevel: computeRiskLevel(violationCount, forceSubmitted),
    events,
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useTestIntegrity(
  options: UseTestIntegrityOptions,
): UseTestIntegrityResult {
  const { config, context, sessionCode, studentId, testId } = options;

  // ── No-op early return ──
  if (!config || context === 'solo') {
    return NOOP_RESULT;
  }

  // ── State ──
  const [violationCount, setViolationCount] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [warningLevel, setWarningLevel] = useState<
    'none' | 'toast' | 'escalated' | 'final'
  >('none');
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);

  // ── Refs ──
  const eventsRef = useRef<IntegrityEvent[]>([]);
  const violationCountRef = useRef(0);
  const switchCountRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const blurAtRef = useRef<number | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forceSubmittedRef = useRef(false);
  const forceSubmittedByRef = useRef<'system' | 'teacher' | null>(null);
  const currentQuestionRef = useRef<{
    index: number;
    startedAt: number;
  } | null>(null);

  // Store config in ref to avoid stale closure issues in intervals
  const configRef = useRef(config);
  configRef.current = config;

  // ── Grace Period Calculator (Task 2.4) ──
  const applyGracePeriod = useCallback(
    (durationMs: number): { withinGrace: boolean; counted: boolean } => {
      switchCountRef.current++;
      const isShortDuration = durationMs < 5000;
      const isFreeSwitchLeft = switchCountRef.current <= 2;
      const withinGrace = isShortDuration || isFreeSwitchLeft;
      const counted = !withinGrace;
      return { withinGrace, counted };
    },
    [],
  );

  // ── Warning Evaluator (Task 2.8) ──
  const evaluateWarning = useCallback(
    (currentViolations: number) => {
      if (!configRef.current?.enableStudentWarnings) return;

      const threshold = configRef.current.autoSubmitThreshold;

      if (currentViolations === 0) {
        setWarningLevel('none');
      } else if (currentViolations < threshold - 1) {
        setWarningLevel('toast');
      } else if (currentViolations === threshold - 1) {
        setWarningLevel('escalated');
      } else {
        setWarningLevel('final');
      }
    },
    [],
  );

  // ── Add Event (Task 2.5) ──
  const addEvent = useCallback(
    (event: IntegrityEvent) => {
      // (a) Push to buffer
      eventsRef.current.push(event);
      setTotalEvents(eventsRef.current.length);

      // (b) Increment violation count if counted
      if (event.counted) {
        violationCountRef.current++;
        setViolationCount(violationCountRef.current);
      }

      // (c) Mirror to sessionStorage (Task 2.6)
      try {
        sessionStorage.setItem(
          `integrity_events_${testId}`,
          JSON.stringify(eventsRef.current),
        );
      } catch {
        // sessionStorage might be full or unavailable — silently continue
      }

      // (d) Evaluate warnings
      evaluateWarning(violationCountRef.current);
    },
    [testId, evaluateWarning],
  );

  // ── Auto-Submit Check (Task 2.9) ──
  useEffect(() => {
    if (
      config.enableAutoSubmit &&
      violationCount >= config.autoSubmitThreshold &&
      !shouldAutoSubmit
    ) {
      forceSubmittedRef.current = true;
      forceSubmittedByRef.current = 'system';
      setShouldAutoSubmit(true);
    }
  }, [violationCount, config.enableAutoSubmit, config.autoSubmitThreshold, shouldAutoSubmit]);

  // ── Crash Recovery on Mount (Task 2.6) ──
  useEffect(() => {
    // Mark test as in progress
    try {
      sessionStorage.setItem('test_in_progress', testId);
    } catch {
      // Ignore
    }

    // Check for existing events (crash recovery)
    try {
      const existingFlag = sessionStorage.getItem('test_in_progress');
      const existingEvents = sessionStorage.getItem(
        `integrity_events_${testId}`,
      );

      if (existingEvents && existingFlag === testId) {
        const parsed: IntegrityEvent[] = JSON.parse(existingEvents);
        if (Array.isArray(parsed) && parsed.length > 0) {
          eventsRef.current = parsed;

          // Recompute violation count from recovered events
          let recoveredViolations = 0;
          let recoveredSwitchCount = 0;
          for (const evt of parsed) {
            if (evt.counted) recoveredViolations++;
            if (evt.type === 'tab_switch' || evt.type === 'window_blur') {
              recoveredSwitchCount++;
            }
          }
          violationCountRef.current = recoveredViolations;
          switchCountRef.current = recoveredSwitchCount;
          setViolationCount(recoveredViolations);
          setTotalEvents(parsed.length);

          // Add reload event
          const reloadEvent: IntegrityEvent = {
            type: 'page_reload',
            timestamp: Date.now(),
            withinGrace: true,
            counted: false,
          };
          eventsRef.current.push(reloadEvent);
          setTotalEvents(eventsRef.current.length);

          console.log(
            `[Integrity] Crash recovery: restored ${parsed.length} events, ${recoveredViolations} violations`,
          );
        }
      }
    } catch {
      // Ignore parse errors
    }

    return () => {
      try {
        sessionStorage.removeItem('test_in_progress');
      } catch {
        // Ignore
      }
    };
  }, [testId]);

  // ── Visibilitychange Listener (Task 2.2) ──
  useEffect(() => {
    if (!config.detectTabSwitch) return;

    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (
        document.visibilityState === 'visible' &&
        hiddenAtRef.current !== null
      ) {
        const durationMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        const { withinGrace, counted } = applyGracePeriod(durationMs);
        addEvent({
          type: 'tab_switch',
          timestamp: Date.now(),
          durationMs,
          withinGrace,
          counted,
        });
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  }, [config.detectTabSwitch, applyGracePeriod, addEvent]);

  // ── Window Blur/Focus Listeners (Task 2.3) ──
  useEffect(() => {
    if (!config.detectTabSwitch) return;

    const blurHandler = () => {
      blurAtRef.current = Date.now();
    };

    const focusHandler = () => {
      if (blurAtRef.current !== null) {
        const durationMs = Date.now() - blurAtRef.current;
        blurAtRef.current = null;
        const { withinGrace, counted } = applyGracePeriod(durationMs);
        addEvent({
          type: 'window_blur',
          timestamp: Date.now(),
          durationMs,
          withinGrace,
          counted,
        });
      }
    };

    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
    return () => {
      window.removeEventListener('blur', blurHandler);
      window.removeEventListener('focus', focusHandler);
    };
  }, [config.detectTabSwitch, applyGracePeriod, addEvent]);

  // ── Devtools Resize Detection (Task 2.10) ──
  useEffect(() => {
    if (!config.detectKeyboardShortcuts) return;

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const resizeHandler = () => {
      const widthDelta = Math.abs(window.innerWidth - lastWidth);
      const heightDelta = Math.abs(window.innerHeight - lastHeight);

      if (widthDelta > 200 && heightDelta <= 50) {
        addEvent({
          type: 'devtools_resize',
          timestamp: Date.now(),
          withinGrace: true,
          counted: false,
          details: `width delta: ${widthDelta}px`,
        });
      }

      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
    };

    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }, [config.detectKeyboardShortcuts, addEvent]);

  // ── Batched RTDB Writer (Task 2.7) ──
  useEffect(() => {
    if (context !== 'session' || !sessionCode) return;

    const writeBatchToRTDB = async () => {
      try {
        const { ref, update } = await import('firebase/database');
        // @ts-ignore - firebase.js is a JS file without type declarations
        const { database } = await import('../../services/firebase');

        const report = buildReport(
          eventsRef.current,
          forceSubmittedRef.current,
          forceSubmittedByRef.current,
        );

        // Batch writes exclude the full events array to keep RTDB lean
        const { events: _events, ...reportWithoutEvents } = report;

        await update(
          ref(
            database,
            `game_sessions/${sessionCode}/players/${studentId}/integrity`,
          ),
          reportWithoutEvents,
        );
        console.log('[Integrity] Batched write success');
      } catch (error) {
        console.error('[Integrity] Batched write failed:', error);
      }
    };

    // Write every 5 minutes
    intervalIdRef.current = setInterval(writeBatchToRTDB, 300_000);

    return () => {
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [context, sessionCode, studentId]);

  // ── Flush Events (called at submission time) ──
  const flushEvents = useCallback(async () => {
    if (context === 'session' && sessionCode) {
      // Write FULL report (including events) to RTDB
      try {
        const { ref, update } = await import('firebase/database');
        // @ts-ignore - firebase.js is a JS file without type declarations
        const { database } = await import('../../services/firebase');

        const report = buildReport(
          eventsRef.current,
          forceSubmittedRef.current,
          forceSubmittedByRef.current,
        );

        await update(
          ref(
            database,
            `game_sessions/${sessionCode}/players/${studentId}/integrity`,
          ),
          report,
        );
        console.log('[Integrity] Final flush success');
      } catch (error) {
        console.error('[Integrity] Final flush failed:', error);
      }
    }

    // Clear sessionStorage
    try {
      sessionStorage.removeItem(`integrity_events_${testId}`);
      sessionStorage.removeItem('test_in_progress');
    } catch {
      // Ignore
    }
  }, [context, sessionCode, studentId, testId]);

  // ── Get Integrity Report ──
  const getIntegrityReport = useCallback((): IntegrityReport => {
    return buildReport(
      eventsRef.current,
      forceSubmittedRef.current,
      forceSubmittedByRef.current,
    );
  }, []);

  // ── Track Question Time (Task 2.11) ──
  const trackQuestionTime = useCallback(
    (questionIndex: number) => {
      const now = Date.now();
      const prev = currentQuestionRef.current;

      if (prev !== null) {
        const elapsed = now - prev.startedAt;
        addEvent({
          type: 'time_per_question',
          timestamp: now,
          durationMs: elapsed,
          withinGrace: true,
          counted: false,
          details: `Q${prev.index}`,
        });
      }

      currentQuestionRef.current = { index: questionIndex, startedAt: now };
    },
    [addEvent],
  );

  // ── Dismiss Warning ──
  const warningMessage = WARNING_MESSAGES[warningLevel];

  return {
    violationCount,
    totalEvents,
    warningLevel,
    warningMessage,
    shouldAutoSubmit,
    flushEvents,
    getIntegrityReport,
    addEvent,
    trackQuestionTime,
  };
}
