import { computeRiskLevel } from './antiCheatPresets';
import type {
  HomeworkIntegrity,
  IntegrityEvent,
  IntegrityReport,
  RiskLevel,
} from '../types/integrity.types';

export { computeRiskLevel };

export type IntegrityViewData = IntegrityReport | HomeworkIntegrity;

export function isIntegrityReport(
  report: IntegrityViewData,
): report is IntegrityReport {
  return Array.isArray((report as IntegrityReport).events);
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readForceSubmittedBy(
  value: unknown,
): 'system' | 'teacher' | null {
  return value === 'system' || value === 'teacher' ? value : null;
}

function readSummaryText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveRiskLevel(
  value: unknown,
  violationCount: number,
  forceSubmitted: boolean,
): RiskLevel {
  return isRiskLevel(value)
    ? value
    : computeRiskLevel(violationCount, forceSubmitted);
}

export function buildIntegrityAggregateSummary(
  report: Pick<
    IntegrityReport,
    | 'tabSwitchCount'
    | 'copyAttempts'
    | 'pasteAttempts'
    | 'rightClickAttempts'
    | 'fullscreenExitCount'
    | 'keyboardShortcutAttempts'
  >,
): string {
  return [
    report.tabSwitchCount > 0 && `${report.tabSwitchCount} tab switches`,
    report.copyAttempts > 0 && `${report.copyAttempts} copy attempts`,
    report.pasteAttempts > 0 && `${report.pasteAttempts} paste attempts`,
    report.rightClickAttempts > 0 && `${report.rightClickAttempts} right clicks`,
    report.fullscreenExitCount > 0 &&
      `${report.fullscreenExitCount} fullscreen exits`,
    report.keyboardShortcutAttempts > 0 &&
      `${report.keyboardShortcutAttempts} keyboard shortcuts`,
  ]
    .filter(Boolean)
    .join(', ') || 'No events';
}

export function buildIntegrityEventSummary(report: IntegrityReport): string {
  return buildIntegrityAggregateSummary(report);
}

export function normalizeIntegrityReport(raw: unknown): IntegrityReport | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const report = raw as Partial<IntegrityReport>;

  if (!Array.isArray(report.events)) {
    return null;
  }

  const violationCount = readNumber(report.violationCount);
  const forceSubmitted = Boolean(report.forceSubmitted);

  return {
    violationCount,
    totalEvents: readNumber(report.totalEvents, report.events.length),
    tabSwitchCount: readNumber(report.tabSwitchCount),
    totalTimeAwayMs: readNumber(report.totalTimeAwayMs),
    copyAttempts: readNumber(report.copyAttempts),
    pasteAttempts: readNumber(report.pasteAttempts),
    rightClickAttempts: readNumber(report.rightClickAttempts),
    fullscreenExitCount: readNumber(report.fullscreenExitCount),
    keyboardShortcutAttempts: readNumber(report.keyboardShortcutAttempts),
    forceSubmitted,
    forceSubmittedBy: readForceSubmittedBy(report.forceSubmittedBy),
    riskLevel: resolveRiskLevel(report.riskLevel, violationCount, forceSubmitted),
    events: report.events.filter(
      (event): event is IntegrityEvent =>
        Boolean(
          event &&
            typeof event === 'object' &&
            typeof event.type === 'string' &&
            typeof event.timestamp === 'number',
        ),
    ),
  };
}

export function toHomeworkIntegrity(
  report: IntegrityReport,
): HomeworkIntegrity {
  return {
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
    eventCount: report.events.length,
    eventSummary: buildIntegrityEventSummary(report),
  };
}

export function normalizeHomeworkIntegrity(
  raw: unknown,
): HomeworkIntegrity | null {
  const normalizedReport = normalizeIntegrityReport(raw);
  if (normalizedReport) {
    return toHomeworkIntegrity(normalizedReport);
  }

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const report = raw as Partial<HomeworkIntegrity>;
  const violationCount = readNumber(report.violationCount);
  const forceSubmitted = Boolean(report.forceSubmitted);

  return {
    violationCount,
    totalEvents: readNumber(report.totalEvents),
    tabSwitchCount: readNumber(report.tabSwitchCount),
    totalTimeAwayMs: readNumber(report.totalTimeAwayMs),
    copyAttempts: readNumber(report.copyAttempts),
    pasteAttempts: readNumber(report.pasteAttempts),
    rightClickAttempts: readNumber(report.rightClickAttempts),
    fullscreenExitCount: readNumber(report.fullscreenExitCount),
    keyboardShortcutAttempts: readNumber(report.keyboardShortcutAttempts),
    forceSubmitted,
    forceSubmittedBy: readForceSubmittedBy(report.forceSubmittedBy),
    riskLevel: resolveRiskLevel(report.riskLevel, violationCount, forceSubmitted),
    eventCount: readNumber(report.eventCount, readNumber(report.totalEvents)),
    eventSummary:
      readSummaryText(report.eventSummary) ||
      buildIntegrityAggregateSummary({
        tabSwitchCount: readNumber(report.tabSwitchCount),
        copyAttempts: readNumber(report.copyAttempts),
        pasteAttempts: readNumber(report.pasteAttempts),
        rightClickAttempts: readNumber(report.rightClickAttempts),
        fullscreenExitCount: readNumber(report.fullscreenExitCount),
        keyboardShortcutAttempts: readNumber(report.keyboardShortcutAttempts),
      }),
  };
}

export function getIntegrityEvents(report: IntegrityViewData): IntegrityEvent[] {
  return isIntegrityReport(report) ? report.events : [];
}

export function getIntegrityEventCount(report: IntegrityViewData): number {
  return isIntegrityReport(report) ? report.events.length : report.eventCount;
}

export function getIntegritySummary(report: IntegrityViewData): string {
  return isIntegrityReport(report)
    ? buildIntegrityEventSummary(report)
    : report.eventSummary || buildIntegrityAggregateSummary(report);
}
