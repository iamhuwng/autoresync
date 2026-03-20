import { FEATURE_IDS } from '../config/featureRegistry';
import type {
  AntiCheatConfig,
  HomeworkIntegrity,
  IntegrityEvent,
  IntegrityReport,
} from '../types/integrity.types';
import { reportingService } from './reportingService';

export interface AntiCheatTelemetryContext {
  context: 'session' | 'homework' | 'solo';
  surface: string;
  sessionCode?: string;
  studentId?: string;
  testId?: string;
  homeworkId?: string;
  submissionId?: string;
}

type IntegritySnapshot = IntegrityReport | HomeworkIntegrity;

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export function summarizeAntiCheatConfig(
  config: AntiCheatConfig | null | undefined,
): Record<string, unknown> {
  if (!config) {
    return {
      antiCheatEnabled: false,
    };
  }

  return {
    antiCheatEnabled: true,
    preset: config.preset,
    detectTabSwitch: config.detectTabSwitch,
    detectCopyPaste: config.detectCopyPaste,
    detectRightClick: config.detectRightClick,
    detectFullscreenExit: config.detectFullscreenExit,
    detectKeyboardShortcuts: config.detectKeyboardShortcuts,
    enableStudentWarnings: config.enableStudentWarnings,
    enableAutoSubmit: config.enableAutoSubmit,
    autoSubmitThreshold: config.autoSubmitThreshold,
    requireFullscreen: config.requireFullscreen,
    shuffleQuestions: config.shuffleQuestions,
    shuffleOptions: config.shuffleOptions,
    nullifyRemainingAttempts: config.nullifyRemainingAttempts,
  };
}

export function summarizeIntegritySnapshot(
  report: IntegritySnapshot | null | undefined,
): Record<string, unknown> {
  if (!report) {
    return {
      hasIntegritySnapshot: false,
    };
  }

  return {
    hasIntegritySnapshot: true,
    violationCount: report.violationCount,
    totalEvents: report.totalEvents,
    tabSwitchCount: report.tabSwitchCount,
    totalTimeAwayMs: report.totalTimeAwayMs,
    copyAttempts: report.copyAttempts,
    pasteAttempts: report.pasteAttempts,
    rightClickAttempts: report.rightClickAttempts,
    fullscreenExitCount: report.fullscreenExitCount,
    keyboardShortcutAttempts: report.keyboardShortcutAttempts,
    forceSubmitted: report.forceSubmitted,
    forceSubmittedBy: report.forceSubmittedBy,
    riskLevel: report.riskLevel,
  };
}

export function summarizeIntegrityEvent(
  event: IntegrityEvent,
): Record<string, unknown> {
  return compactRecord({
    eventType: event.type,
    counted: event.counted,
    withinGrace: event.withinGrace,
    durationMs: event.durationMs,
    details: event.details,
  });
}

export function summarizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return compactRecord({
      errorName: error.name,
      errorMessage: error.message,
    });
  }

  return {
    errorMessage: String(error),
  };
}

export function trackAntiCheatAction(
  action: string,
  telemetryContext: AntiCheatTelemetryContext,
  metadata?: Record<string, unknown>,
): void {
  reportingService.trackAction(
    FEATURE_IDS.antiCheat,
    action,
    compactRecord({
      ...telemetryContext,
      ...(metadata || {}),
    }),
  );
}
