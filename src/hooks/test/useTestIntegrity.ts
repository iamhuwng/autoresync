/**
 * useTestIntegrity Hook - Core Anti-Cheat Detection Engine
 *
 * PRD-0036: Anti-Cheating & Test Integrity System
 *
 * Central hook that:
 *   - Detects tab switches (visibilitychange + blur/focus)
 *   - Applies grace period logic (first 2 switches free + <5s grace)
 *   - Buffers events in memory + sessionStorage for crash recovery
 *   - Batches RTDB writes every 5 minutes (session context only)
 *   - Manages student warning escalation (toast -> escalated -> final)
 *   - Triggers auto-submit when threshold is reached
 *   - Tracks time-per-question for post-analysis
 *   - Provides devtools resize heuristic detection
 *
 * External hooks (useAntiCopyPaste, useFullscreenMode) inject events
 * via the exposed addEvent function.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AntiCheatConfig,
  IntegrityEvent,
  IntegrityReport,
} from '../../types/integrity.types';
import { EMPTY_INTEGRITY_REPORT } from '../../types/integrity.types';
import { computeRiskLevel } from '../../utils/antiCheatPresets';
import {
  summarizeAntiCheatConfig,
  summarizeError,
  summarizeIntegrityEvent,
  summarizeIntegritySnapshot,
  trackAntiCheatAction,
} from '../../services/antiCheatReporting';

export interface UseTestIntegrityOptions {
  config: AntiCheatConfig | null;
  context: 'session' | 'homework' | 'solo';
  surface: string;
  sessionCode?: string;
  studentId: string;
  testId: string;
  homeworkId?: string;
  submissionId?: string;
}

export interface UseTestIntegrityResult {
  violationCount: number;
  totalEvents: number;
  warningLevel: 'none' | 'toast' | 'escalated' | 'final';
  warningMessage: string;
  shouldAutoSubmit: boolean;
  flushEvents: (reason?: string) => Promise<void>;
  getIntegrityReport: () => IntegrityReport;
  addEvent: (event: IntegrityEvent) => void;
  trackQuestionTime: (questionIndex: number) => void;
}

const WARNING_MESSAGES = {
  none: '',
  toast: 'Please stay on this page to complete your work.',
  escalated:
    'You have left this page multiple times. Continuing may affect your submission.',
  final:
    "Your submission is about to be finalized. Click 'Continue Test' to keep working, or your current answers will be submitted.",
} as const;

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

export function useTestIntegrity(
  options: UseTestIntegrityOptions,
): UseTestIntegrityResult {
  const {
    config,
    context,
    surface,
    sessionCode,
    studentId,
    testId,
    homeworkId,
    submissionId,
  } = options;

  const disabled = !config || context === 'solo';

  const [violationCount, setViolationCount] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [warningLevel, setWarningLevel] = useState<
    'none' | 'toast' | 'escalated' | 'final'
  >('none');
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);

  const eventsRef = useRef<IntegrityEvent[]>([]);
  const violationCountRef = useRef(0);
  const switchCountRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const blurAtRef = useRef<number | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forceSubmittedRef = useRef(false);
  const forceSubmittedByRef = useRef<'system' | 'teacher' | null>(null);
  const currentQuestionRef = useRef<{ index: number; startedAt: number } | null>(
    null,
  );
  const immediateWritePendingRef = useRef(false);
  const initTrackingKeyRef = useRef<string | null>(null);
  const autoSubmitTrackedRef = useRef(false);
  const lastTrackedWarningRef = useRef<'none' | 'toast' | 'escalated' | 'final'>(
    'none',
  );
  const lastVisibilityReturnRef = useRef(0);

  const configRef = useRef(config);
  configRef.current = config;

  const trackTelemetry = useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      if (disabled) return;

      trackAntiCheatAction(
        action,
        {
          context,
          surface,
          sessionCode,
          studentId,
          testId,
          homeworkId,
          submissionId,
        },
        metadata,
      );
    },
    [
      context,
      disabled,
      homeworkId,
      sessionCode,
      studentId,
      submissionId,
      surface,
      testId,
    ],
  );

  useEffect(() => {
    if (disabled || !config) {
      initTrackingKeyRef.current = null;
      return;
    }

    const initTrackingKey = [
      context,
      surface,
      sessionCode || '',
      studentId,
      testId,
      homeworkId || '',
      submissionId || '',
      config.preset,
    ].join(':');

    if (initTrackingKeyRef.current === initTrackingKey) {
      return;
    }

    initTrackingKeyRef.current = initTrackingKey;
    trackTelemetry('initializeProtection', summarizeAntiCheatConfig(config));
  }, [
    config,
    context,
    disabled,
    homeworkId,
    sessionCode,
    studentId,
    submissionId,
    surface,
    testId,
    trackTelemetry,
  ]);

  const immediateWriteToRTDB = useCallback(async () => {
    if (disabled || context !== 'session' || !sessionCode) return;
    if (immediateWritePendingRef.current) return;
    immediateWritePendingRef.current = true;

    try {
      const { ref: dbRef, update: dbUpdate } = await import('firebase/database');
      // @ts-ignore - firebase.js is a JS file without type declarations
      const { database } = await import('../../services/firebase');

      const report = buildReport(
        eventsRef.current,
        forceSubmittedRef.current,
        forceSubmittedByRef.current,
      );
      const { events: _events, ...reportWithoutEvents } = report;

      await dbUpdate(
        dbRef(
          database,
          `game_sessions/${sessionCode}/players/${studentId}/integrity`,
        ),
        reportWithoutEvents,
      );

      trackTelemetry('persistIntegritySnapshot', {
        stage: 'immediate',
        status: 'success',
        ...summarizeIntegritySnapshot(report),
      });
    } catch (error) {
      const report = buildReport(
        eventsRef.current,
        forceSubmittedRef.current,
        forceSubmittedByRef.current,
      );

      trackTelemetry('persistIntegritySnapshot', {
        stage: 'immediate',
        status: 'failed',
        ...summarizeIntegritySnapshot(report),
        ...summarizeError(error),
      });
      console.error('[Integrity] Immediate write failed:', error);
    } finally {
      immediateWritePendingRef.current = false;
    }
  }, [context, disabled, sessionCode, studentId, trackTelemetry]);

  const applyGracePeriod = useCallback(
    (durationMs: number): { withinGrace: boolean; counted: boolean } => {
      switchCountRef.current++;
      const isShortDuration = durationMs < 5000;
      const isFreeSwitchLeft = switchCountRef.current <= 2;
      const withinGrace = isShortDuration || isFreeSwitchLeft;
      return {
        withinGrace,
        counted: !withinGrace,
      };
    },
    [],
  );

  const evaluateWarning = useCallback((currentViolations: number) => {
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
  }, []);

  const addEvent = useCallback(
    (event: IntegrityEvent) => {
      if (disabled) return;

      eventsRef.current.push(event);
      setTotalEvents(eventsRef.current.length);

      if (event.counted) {
        violationCountRef.current++;
        setViolationCount(violationCountRef.current);
        trackTelemetry('recordViolation', {
          ...summarizeIntegrityEvent(event),
          violationCount: violationCountRef.current,
          totalEvents: eventsRef.current.length,
        });
        immediateWriteToRTDB();
      } else if (
        event.type === 'page_reload' ||
        event.type === 'fullscreen_unavailable' ||
        event.type === 'devtools_resize'
      ) {
        trackTelemetry('recordSignal', {
          ...summarizeIntegrityEvent(event),
          violationCount: violationCountRef.current,
          totalEvents: eventsRef.current.length,
        });
      }

      try {
        sessionStorage.setItem(
          `integrity_events_${testId}`,
          JSON.stringify(eventsRef.current),
        );
      } catch {
        // Ignore sessionStorage issues.
      }

      evaluateWarning(violationCountRef.current);
    },
    [disabled, evaluateWarning, immediateWriteToRTDB, testId, trackTelemetry],
  );

  useEffect(() => {
    if (disabled || !config) return;

    if (
      config.enableAutoSubmit &&
      violationCount >= config.autoSubmitThreshold &&
      !shouldAutoSubmit
    ) {
      if (!autoSubmitTrackedRef.current) {
        autoSubmitTrackedRef.current = true;
        trackTelemetry('triggerAutoSubmit', {
          violationCount,
          totalEvents: eventsRef.current.length,
          autoSubmitThreshold: config.autoSubmitThreshold,
        });
      }

      forceSubmittedRef.current = true;
      forceSubmittedByRef.current = 'system';
      setShouldAutoSubmit(true);
    } else if (!shouldAutoSubmit) {
      autoSubmitTrackedRef.current = false;
    }
  }, [config, disabled, shouldAutoSubmit, trackTelemetry, violationCount]);

  useEffect(() => {
    if (disabled) return;

    try {
      sessionStorage.setItem('test_in_progress', testId);
    } catch {
      // Ignore sessionStorage issues.
    }

    try {
      const existingFlag = sessionStorage.getItem('test_in_progress');
      const existingEvents = sessionStorage.getItem(`integrity_events_${testId}`);

      if (existingEvents && existingFlag === testId) {
        const parsed: IntegrityEvent[] = JSON.parse(existingEvents);

        if (Array.isArray(parsed) && parsed.length > 0) {
          eventsRef.current = parsed;

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

          trackTelemetry('restoreIntegrityState', {
            recoveredEvents: parsed.length,
            recoveredViolations,
            recoveredSwitchCount,
          });

          const reloadEvent: IntegrityEvent = {
            type: 'page_reload',
            timestamp: Date.now(),
            withinGrace: true,
            counted: false,
          };
          eventsRef.current.push(reloadEvent);
          setTotalEvents(eventsRef.current.length);
        }
      }
    } catch {
      // Ignore parse errors.
    }

    return () => {
      try {
        sessionStorage.removeItem('test_in_progress');
      } catch {
        // Ignore sessionStorage issues.
      }
    };
  }, [disabled, testId, trackTelemetry]);

  useEffect(() => {
    if (disabled || !config?.detectTabSwitch) return;

    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (
        document.visibilityState === 'visible' &&
        hiddenAtRef.current !== null
      ) {
        const durationMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        lastVisibilityReturnRef.current = Date.now();
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
    return () => document.removeEventListener('visibilitychange', handler);
  }, [addEvent, applyGracePeriod, config?.detectTabSwitch, disabled]);

  useEffect(() => {
    if (disabled || !config?.detectTabSwitch) return;

    const blurHandler = () => {
      blurAtRef.current = Date.now();
    };

    const focusHandler = () => {
      if (blurAtRef.current === null) return;

      const durationMs = Date.now() - blurAtRef.current;
      blurAtRef.current = null;

      if (Date.now() - lastVisibilityReturnRef.current < 500) {
        return;
      }

      const { withinGrace, counted } = applyGracePeriod(durationMs);
      addEvent({
        type: 'window_blur',
        timestamp: Date.now(),
        durationMs,
        withinGrace,
        counted,
      });
    };

    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
    return () => {
      window.removeEventListener('blur', blurHandler);
      window.removeEventListener('focus', focusHandler);
    };
  }, [addEvent, applyGracePeriod, config?.detectTabSwitch, disabled]);

  useEffect(() => {
    if (disabled || !config?.detectKeyboardShortcuts) return;

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
    return () => window.removeEventListener('resize', resizeHandler);
  }, [addEvent, config?.detectKeyboardShortcuts, disabled]);

  useEffect(() => {
    if (disabled || context !== 'session' || !sessionCode) return;

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
        const { events: _events, ...reportWithoutEvents } = report;

        await update(
          ref(
            database,
            `game_sessions/${sessionCode}/players/${studentId}/integrity`,
          ),
          reportWithoutEvents,
        );

        trackTelemetry('persistIntegritySnapshot', {
          stage: 'batch',
          status: 'success',
          ...summarizeIntegritySnapshot(report),
        });
      } catch (error) {
        const report = buildReport(
          eventsRef.current,
          forceSubmittedRef.current,
          forceSubmittedByRef.current,
        );

        trackTelemetry('persistIntegritySnapshot', {
          stage: 'batch',
          status: 'failed',
          ...summarizeIntegritySnapshot(report),
          ...summarizeError(error),
        });
        console.error('[Integrity] Batched write failed:', error);
      }
    };

    intervalIdRef.current = setInterval(writeBatchToRTDB, 300_000);

    return () => {
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [context, disabled, sessionCode, studentId, trackTelemetry]);

  const flushEvents = useCallback(
    async (reason = 'manual') => {
      if (disabled) return;

      const report = buildReport(
        eventsRef.current,
        forceSubmittedRef.current,
        forceSubmittedByRef.current,
      );

      if (context === 'session' && sessionCode) {
        try {
          const { ref, update } = await import('firebase/database');
          // @ts-ignore - firebase.js is a JS file without type declarations
          const { database } = await import('../../services/firebase');

          await update(
            ref(
              database,
              `game_sessions/${sessionCode}/players/${studentId}/integrity`,
            ),
            report,
          );

          trackTelemetry('flushIntegrityLogs', {
            status: 'success',
            trigger: reason,
            persistenceTarget: 'rtdb',
            ...summarizeIntegritySnapshot(report),
          });
        } catch (error) {
          trackTelemetry('flushIntegrityLogs', {
            status: 'failed',
            trigger: reason,
            persistenceTarget: 'rtdb',
            ...summarizeIntegritySnapshot(report),
            ...summarizeError(error),
          });
          console.error('[Integrity] Final flush failed:', error);
        }
      } else {
        trackTelemetry('flushIntegrityLogs', {
          status: 'success',
          trigger: reason,
          persistenceTarget: 'local',
          ...summarizeIntegritySnapshot(report),
        });
      }

      try {
        sessionStorage.removeItem(`integrity_events_${testId}`);
        sessionStorage.removeItem('test_in_progress');
      } catch {
        // Ignore sessionStorage issues.
      }
    },
    [context, disabled, sessionCode, studentId, testId, trackTelemetry],
  );

  useEffect(() => {
    if (disabled) {
      lastTrackedWarningRef.current = 'none';
      return;
    }

    if (warningLevel === 'none') {
      lastTrackedWarningRef.current = 'none';
      return;
    }

    if (lastTrackedWarningRef.current === warningLevel) {
      return;
    }

    lastTrackedWarningRef.current = warningLevel;
    trackTelemetry('escalateWarning', {
      warningLevel,
      violationCount: violationCountRef.current,
      totalEvents: eventsRef.current.length,
      autoSubmitThreshold: configRef.current?.autoSubmitThreshold,
    });
  }, [disabled, trackTelemetry, warningLevel]);

  const getIntegrityReport = useCallback((): IntegrityReport => {
    if (disabled) return { ...EMPTY_INTEGRITY_REPORT };

    return buildReport(
      eventsRef.current,
      forceSubmittedRef.current,
      forceSubmittedByRef.current,
    );
  }, [disabled]);

  const trackQuestionTime = useCallback(
    (questionIndex: number) => {
      if (disabled) return;

      const now = Date.now();
      const previousQuestion = currentQuestionRef.current;

      if (previousQuestion !== null) {
        const elapsed = now - previousQuestion.startedAt;
        addEvent({
          type: 'time_per_question',
          timestamp: now,
          durationMs: elapsed,
          withinGrace: true,
          counted: false,
          details: `Q${previousQuestion.index}`,
        });
      }

      currentQuestionRef.current = {
        index: questionIndex,
        startedAt: now,
      };
    },
    [addEvent, disabled],
  );

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
