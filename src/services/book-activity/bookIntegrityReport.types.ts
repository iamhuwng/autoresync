import type {
  BookIntegrityCanonicalEvent,
  BookIntegritySignalType,
} from './bookIntegrityCapture.types';

export const BOOK_INTEGRITY_REPORT_SCHEMA_VERSION = 1 as const;
export const BOOK_INTEGRITY_REPORT_POLICY_ID = 'book-integrity-risk';
export const BOOK_INTEGRITY_REPORT_POLICY_REVISION = 1 as const;
export const BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS = 64;

export type BookIntegrityRiskLevel =
  | 'normal'
  | 'integrity_flagged'
  | 'integrity_high_risk';

/**
 * This policy is intentionally explicit and immutable.  The report stores a
 * copy of it so a later policy change cannot change an already sealed report.
 */
export interface BookIntegrityReportPolicy {
  readonly schemaVersion: typeof BOOK_INTEGRITY_REPORT_SCHEMA_VERSION;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly flaggedEventCount: number;
  readonly highRiskEventCount: number;
  readonly highRiskSignals: readonly BookIntegritySignalType[];
}

export const BOOK_INTEGRITY_REPORT_DEFAULT_POLICY: BookIntegrityReportPolicy = Object.freeze({
  schemaVersion: BOOK_INTEGRITY_REPORT_SCHEMA_VERSION,
  policyId: BOOK_INTEGRITY_REPORT_POLICY_ID,
  policyRevision: BOOK_INTEGRITY_REPORT_POLICY_REVISION,
  // A single signal is surfaced as evidence without escalating the
  // submitted attempt. Repeated signals are the first bounded escalation.
  flaggedEventCount: 2,
  highRiskEventCount: 4,
  highRiskSignals: Object.freeze(['concurrent_attempt', 'focus_mode_exit'] as const),
});

export interface BookIntegrityReportEventReference {
  readonly eventId: BookIntegrityCanonicalEvent['eventId'];
  readonly signal: BookIntegritySignalType;
  readonly recordedAt: string;
}

export interface BookIntegrityReportCounts {
  readonly visibility_loss: number;
  readonly focus_loss: number;
  readonly route_reload_close: number;
  readonly paste: number;
  readonly protected_copy: number;
  readonly focus_mode_exit: number;
  readonly concurrent_attempt: number;
  readonly inactivity: number;
}

/**
 * The terminal identity is deliberately limited to trusted submission
 * metadata.  It never contains an answer, prompt, response, score, or
 * feedback payload.
 */
export interface BookIntegrityTerminalAttempt {
  readonly attemptId: string;
  readonly terminalId: string;
  readonly resultId: string;
  readonly completionId: string;
  readonly attemptNumber: number;
  readonly submittedAt: string;
  readonly recipientId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextKind: 'homework';
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  readonly submissionScope: 'activity';
  readonly resultStatus: 'pending_review' | 'submitted';
  readonly completionStatus: 'completed';
}

export interface BookIntegritySignalScope {
  readonly schemaVersion: 1;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly accountableAttemptId: string;
  readonly events: Readonly<Record<string, BookIntegrityCanonicalEvent>>;
  readonly sessions?: Readonly<Record<string, {
    readonly clientSessionId: string;
    readonly lastSeenAt: string;
  }>>;
}

export interface BookIntegrityReport {
  readonly schemaVersion: typeof BOOK_INTEGRITY_REPORT_SCHEMA_VERSION;
  readonly reportId: string;
  readonly status: 'sealed';
  readonly visibility: 'teacher-only';
  readonly sealedAt: string;
  readonly terminal: BookIntegrityTerminalAttempt;
  readonly policy: BookIntegrityReportPolicy;
  readonly risk: BookIntegrityRiskLevel;
  readonly totalEventCount: number;
  readonly counts: BookIntegrityReportCounts;
  readonly eventRefs: readonly BookIntegrityReportEventReference[];
}

export interface BookIntegrityReportLocator {
  readonly attemptId: string;
  readonly terminalId: string;
  readonly ownerId?: string;
}

export interface BookIntegrityReportRepository {
  readSignalScope(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly activityId: string;
    readonly accountableAttemptId: string;
  }): Promise<BookIntegritySignalScope | null>;
  readReportByAttempt(attemptId: string): Promise<BookIntegrityReport | null>;
  readReportForTeacher(input: {
    readonly ownerId: string;
    readonly terminalId: string;
  }): Promise<BookIntegrityReport | null>;
  sealReport(input: {
    readonly ownerId: string;
    readonly report: BookIntegrityReport;
  }): Promise<{
    readonly status: 'sealed' | 'replayed';
    readonly report: BookIntegrityReport;
  }>;
}
