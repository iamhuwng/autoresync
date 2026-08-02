import {
  BOOK_INTEGRITY_SIGNAL_TYPES,
  type BookIntegrityCanonicalEvent,
  type BookIntegritySignalType,
} from './bookIntegrityCapture.types';
import {
  BOOK_INTEGRITY_REPORT_DEFAULT_POLICY,
  BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS,
  BOOK_INTEGRITY_REPORT_SCHEMA_VERSION,
  type BookIntegrityReport,
  type BookIntegrityReportCounts,
  type BookIntegrityReportEventReference,
  type BookIntegrityReportLocator,
  type BookIntegrityReportPolicy,
  type BookIntegrityReportRepository,
  type BookIntegrityRiskLevel,
  type BookIntegritySignalScope,
  type BookIntegrityTerminalAttempt,
} from './bookIntegrityReport.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const TERMINAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,219}$/u;
const EVENT_ID = /^integrity-v1-[a-f0-9]{40}$/u;
const SIGNAL_SET = new Set<string>(BOOK_INTEGRITY_SIGNAL_TYPES);

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const iso = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const positiveInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number => (
  Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
);

export class BookIntegrityReportError extends Error {
  constructor(
    readonly code:
      | 'integrity_report_terminal_invalid'
      | 'integrity_report_terminal_not_submitted'
      | 'integrity_report_scope_invalid'
      | 'integrity_report_scope_mismatch'
      | 'integrity_report_event_invalid'
      | 'integrity_report_policy_invalid'
      | 'integrity_report_immutable_conflict'
      | 'integrity_report_response_malformed'
      | 'integrity_report_unavailable',
    readonly status = 409,
  ) {
    super(code);
    this.name = 'BookIntegrityReportError';
  }
}

const validPolicy = (value: unknown): value is BookIntegrityReportPolicy => {
  const source = record(value);
  return source !== null
    && exactKeys(source, [
      'schemaVersion',
      'policyId',
      'policyRevision',
      'flaggedEventCount',
      'highRiskEventCount',
      'highRiskSignals',
    ])
    && source.schemaVersion === BOOK_INTEGRITY_REPORT_SCHEMA_VERSION
    && typeof source.policyId === 'string'
    && ID.test(source.policyId)
    && positiveInteger(source.policyRevision)
    && positiveInteger(source.flaggedEventCount, BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS)
    && positiveInteger(source.highRiskEventCount, BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS)
    && Number(source.highRiskEventCount) >= Number(source.flaggedEventCount)
    && Array.isArray(source.highRiskSignals)
    && source.highRiskSignals.length <= BOOK_INTEGRITY_SIGNAL_TYPES.length
    && new Set(source.highRiskSignals).size === source.highRiskSignals.length
    && source.highRiskSignals.every((signal) => typeof signal === 'string' && SIGNAL_SET.has(signal));
};

const validTerminal = (value: unknown): value is BookIntegrityTerminalAttempt => {
  const source = record(value);
  return source !== null
    && exactKeys(source, [
      'attemptId',
      'terminalId',
      'resultId',
      'completionId',
      'attemptNumber',
      'submittedAt',
      'recipientId',
      'ownerId',
      'bookId',
      'bindingId',
      'bindingRevision',
      'contextKind',
      'contextId',
      'placementId',
      'activityId',
      'activityVersion',
      'activityVersionId',
      'submissionScope',
      'resultStatus',
      'completionStatus',
    ])
    && [
      'attemptId',
      'terminalId',
      'resultId',
      'completionId',
      'recipientId',
      'ownerId',
      'bookId',
      'bindingId',
      'contextId',
      'placementId',
      'activityId',
      'activityVersionId',
    ].every((key) => typeof source[key] === 'string'
      && (key === 'attemptId' ? ID : TERMINAL_ID).test(source[key] as string))
    && source.attemptNumber !== undefined
    && positiveInteger(source.attemptNumber, 1_000)
    && iso(source.submittedAt)
    && positiveInteger(source.bindingRevision)
    && source.contextKind === 'homework'
    && positiveInteger(source.activityVersion)
    && source.submissionScope === 'activity'
    && (source.resultStatus === 'pending_review' || source.resultStatus === 'submitted')
    && source.completionStatus === 'completed'
    && source.resultId === `${source.attemptId}:result`
    && source.completionId === `${source.attemptId}:completion`
    && source.terminalId === source.completionId;
};

const validEvent = (value: unknown): value is BookIntegrityCanonicalEvent => {
  const source = record(value);
  const target = record(source?.target);
  return source !== null
    && exactKeys(source, [
      'schemaVersion',
      'eventId',
      'requestFingerprint',
      'signal',
      'recordedAt',
      'source',
      'clientSessionId',
      'sequence',
      'recipientId',
      'accountableAttemptId',
      'attemptNumber',
      'target',
      'policyId',
      'policyRevision',
    ])
    && source.schemaVersion === 1
    && typeof source.eventId === 'string'
    && EVENT_ID.test(source.eventId)
    && typeof source.requestFingerprint === 'string'
    && /^[a-f0-9]{64}$/u.test(source.requestFingerprint)
    && typeof source.signal === 'string'
    && SIGNAL_SET.has(source.signal)
    && iso(source.recordedAt)
    && source.source === 'browser'
    && typeof source.clientSessionId === 'string'
    && source.clientSessionId.length >= 8
    && positiveInteger(source.sequence, 1_000_000)
    && typeof source.recipientId === 'string'
    && ID.test(source.recipientId)
    && typeof source.accountableAttemptId === 'string'
    && ID.test(source.accountableAttemptId)
    && positiveInteger(source.attemptNumber, 1_000)
    && target !== null
    && exactKeys(target, [
      'bookId',
      'bindingId',
      'bindingRevision',
      'contextKind',
      'contextId',
      'placementId',
      'activityId',
      'activityVersion',
    ])
    && typeof target.bookId === 'string'
    && ID.test(target.bookId)
    && typeof target.bindingId === 'string'
    && ID.test(target.bindingId)
    && positiveInteger(target.bindingRevision)
    && target.contextKind === 'homework'
    && typeof target.contextId === 'string'
    && ID.test(target.contextId)
    && typeof target.placementId === 'string'
    && ID.test(target.placementId)
    && typeof target.activityId === 'string'
    && ID.test(target.activityId)
    && positiveInteger(target.activityVersion)
    && typeof source.policyId === 'string'
    && ID.test(source.policyId)
    && positiveInteger(source.policyRevision);
};

export const isBookIntegritySignalScope = (value: unknown): value is BookIntegritySignalScope => {
  const source = record(value);
  const events = record(source?.events);
  const sessions = source?.sessions === undefined ? null : record(source.sessions);
  return source !== null
    && exactKeys(source, [
      'schemaVersion',
      'recipientId',
      'contextId',
      'placementId',
      'activityId',
      'accountableAttemptId',
      'events',
    ], ['sessions'])
    && source.schemaVersion === 1
    && typeof source.recipientId === 'string'
    && ID.test(source.recipientId)
    && typeof source.contextId === 'string'
    && ID.test(source.contextId)
    && typeof source.placementId === 'string'
    && ID.test(source.placementId)
    && typeof source.activityId === 'string'
    && ID.test(source.activityId)
    && typeof source.accountableAttemptId === 'string'
    && ID.test(source.accountableAttemptId)
    && events !== null
    && Object.keys(events).length <= BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS
    && Object.entries(events).every(([key, event]) => (
      key === (event as Record<string, unknown>)?.eventId && validEvent(event)
    ))
    && (source.sessions === undefined || (
      sessions !== null
      && Object.entries(sessions).every(([sessionId, session]) => {
        const item = record(session);
        return item !== null
          && exactKeys(item, ['clientSessionId', 'lastSeenAt'])
          && item.clientSessionId === sessionId
          && typeof item.clientSessionId === 'string'
          && iso(item.lastSeenAt);
      })
    ));
};

const targetMatchesTerminal = (
  event: BookIntegrityCanonicalEvent,
  terminal: BookIntegrityTerminalAttempt,
): boolean => event.accountableAttemptId === terminal.attemptId
  && event.recipientId === terminal.recipientId
  && event.target.bookId === terminal.bookId
  && event.target.bindingId === terminal.bindingId
  && event.target.bindingRevision === terminal.bindingRevision
  && event.target.contextKind === terminal.contextKind
  && event.target.contextId === terminal.contextId
  && event.target.placementId === terminal.placementId
  && event.target.activityId === terminal.activityId
  && event.target.activityVersion === terminal.activityVersion;

const emptyCounts = (): BookIntegrityReportCounts => ({
  visibility_loss: 0,
  focus_loss: 0,
  route_reload_close: 0,
  paste: 0,
  protected_copy: 0,
  focus_mode_exit: 0,
  concurrent_attempt: 0,
  inactivity: 0,
});

const riskFor = (
  events: readonly BookIntegrityReportEventReference[],
  policy: BookIntegrityReportPolicy,
): BookIntegrityRiskLevel => {
  if (events.length === 0) return 'normal';
  if (events.length >= policy.highRiskEventCount
    || events.some((event) => policy.highRiskSignals.includes(event.signal))) {
    return 'integrity_high_risk';
  }
  return events.length >= policy.flaggedEventCount
    ? 'integrity_flagged'
    : 'normal';
};

const defaultPolicy = (policy?: BookIntegrityReportPolicy): BookIntegrityReportPolicy => {
  const selected = policy ?? BOOK_INTEGRITY_REPORT_DEFAULT_POLICY;
  if (!validPolicy(selected)) throw new BookIntegrityReportError('integrity_report_policy_invalid');
  return freeze(clone(selected));
};

const reportFor = (input: {
  readonly terminal: BookIntegrityTerminalAttempt;
  readonly scope?: BookIntegritySignalScope | null;
  readonly sealedAt: string;
  readonly policy?: BookIntegrityReportPolicy;
}): BookIntegrityReport => {
  if (!validTerminal(input.terminal)) {
    throw new BookIntegrityReportError('integrity_report_terminal_invalid');
  }
  if (input.terminal.resultStatus !== 'pending_review'
    && input.terminal.resultStatus !== 'submitted') {
    throw new BookIntegrityReportError('integrity_report_terminal_not_submitted');
  }
  if (!iso(input.sealedAt)) throw new BookIntegrityReportError('integrity_report_unavailable', 503);
  if (input.scope !== undefined && input.scope !== null) {
    if (!isBookIntegritySignalScope(input.scope)) {
      throw new BookIntegrityReportError('integrity_report_scope_invalid');
    }
    if (input.scope.recipientId !== input.terminal.recipientId
      || input.scope.contextId !== input.terminal.contextId
      || input.scope.placementId !== input.terminal.placementId
      || input.scope.activityId !== input.terminal.activityId
      || input.scope.accountableAttemptId !== input.terminal.attemptId) {
      throw new BookIntegrityReportError('integrity_report_scope_mismatch');
    }
  }
  const policy = defaultPolicy(input.policy);
  const rawEvents = Object.values(input.scope?.events ?? {});
  const events = rawEvents
    .filter((event) => {
      if (!validEvent(event)) throw new BookIntegrityReportError('integrity_report_event_invalid');
      if (!targetMatchesTerminal(event, input.terminal)) {
        throw new BookIntegrityReportError('integrity_report_scope_mismatch');
      }
      return true;
    })
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)
      || left.eventId.localeCompare(right.eventId));
  if (events.length > BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS) {
    throw new BookIntegrityReportError('integrity_report_scope_invalid');
  }
  const counts: Record<BookIntegritySignalType, number> = { ...emptyCounts() };
  for (const event of events) counts[event.signal] += 1;
  const eventRefs = events.map((event): BookIntegrityReportEventReference => ({
    eventId: event.eventId,
    signal: event.signal,
    recordedAt: event.recordedAt,
  }));
  return freeze({
    schemaVersion: BOOK_INTEGRITY_REPORT_SCHEMA_VERSION,
    reportId: `book-integrity-report-v1-${input.terminal.attemptId}`,
    status: 'sealed',
    visibility: 'teacher-only',
    sealedAt: input.sealedAt,
    terminal: clone(input.terminal),
    policy,
    risk: riskFor(eventRefs, policy),
    totalEventCount: eventRefs.length,
    counts: freeze(counts),
    eventRefs: freeze(eventRefs),
  });
};

export const deriveBookIntegrityReport = (input: {
  readonly terminal: BookIntegrityTerminalAttempt;
  readonly scope?: BookIntegritySignalScope | null;
  readonly sealedAt: string;
  readonly policy?: BookIntegrityReportPolicy;
}): BookIntegrityReport => reportFor(input);

export const canonicalBookIntegrityReport = (report: BookIntegrityReport): string => stable(report);

export const isBookIntegrityReport = (value: unknown): value is BookIntegrityReport => {
  const source = record(value);
  const terminal = record(source?.terminal);
  const policy = record(source?.policy);
  const counts = record(source?.counts);
  const eventRefs = source?.eventRefs;
  if (source === null
    || !exactKeys(source, [
      'schemaVersion',
      'reportId',
      'status',
      'visibility',
      'sealedAt',
      'terminal',
      'policy',
      'risk',
      'totalEventCount',
      'counts',
      'eventRefs',
    ])
    || source.schemaVersion !== BOOK_INTEGRITY_REPORT_SCHEMA_VERSION
    || typeof source.reportId !== 'string'
    || !validTerminal(terminal)
    || source.reportId !== `book-integrity-report-v1-${terminal.attemptId}`
    || source.status !== 'sealed'
    || source.visibility !== 'teacher-only'
    || !iso(source.sealedAt)
    || !validPolicy(policy)
    || !['normal', 'integrity_flagged', 'integrity_high_risk'].includes(String(source.risk))
    || !Number.isSafeInteger(source.totalEventCount)
    || Number(source.totalEventCount) < 0
    || Number(source.totalEventCount) > BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS
    || counts === null
    || !exactKeys(counts, BOOK_INTEGRITY_SIGNAL_TYPES)
    || !BOOK_INTEGRITY_SIGNAL_TYPES.every((signal) => (
      Object.hasOwn(counts, signal)
      && Number.isSafeInteger(counts[signal])
      && Number(counts[signal]) >= 0
    ))) return false;
  if (!Array.isArray(eventRefs)
    || eventRefs.length !== Number(source.totalEventCount)
    || eventRefs.length > BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS) return false;
  const eventIds = new Set<string>();
  const validRefs = eventRefs.every((event) => {
    const item = record(event);
    if (item === null
      || !exactKeys(item, ['eventId', 'signal', 'recordedAt'])
      || typeof item.eventId !== 'string'
      || !EVENT_ID.test(item.eventId)
      || typeof item.signal !== 'string'
      || !SIGNAL_SET.has(item.signal)
      || !iso(item.recordedAt)) return false;
    if (eventIds.has(item.eventId)) return false;
    eventIds.add(item.eventId);
    return true;
  });
  if (!validRefs) return false;
  const typedRefs = eventRefs as readonly BookIntegrityReportEventReference[];
  return BOOK_INTEGRITY_SIGNAL_TYPES.every((signal) => (
      typedRefs.filter((event) => event.signal === signal).length
        === Number(counts[signal])
    )) && riskFor(typedRefs, policy as BookIntegrityReportPolicy) === source.risk;
};

export interface BookIntegrityReportLinkResult {
  readonly status: 'sealed' | 'replayed' | 'not_linked';
  readonly report?: BookIntegrityReport;
  readonly reason?: 'linkage_disabled' | 'terminal_not_submitted';
}

export interface TrustedBookIntegrityReportService {
  sealSubmittedAttempt(input: {
    readonly ownerId: string;
    readonly terminal: BookIntegrityTerminalAttempt;
  }): Promise<BookIntegrityReportLinkResult>;
  readTeacherReport(locator: BookIntegrityReportLocator): Promise<BookIntegrityReport | null>;
}

export const createTrustedBookIntegrityReportService = (options: {
  readonly repository: BookIntegrityReportRepository;
  readonly now?: () => string;
  readonly policy?: BookIntegrityReportPolicy;
}): TrustedBookIntegrityReportService => ({
  async sealSubmittedAttempt(input) {
    if (!validTerminal(input.terminal)
      || input.terminal.ownerId !== input.ownerId) {
      throw new BookIntegrityReportError('integrity_report_terminal_invalid');
    }
    if (input.terminal.resultStatus !== 'pending_review'
      && input.terminal.resultStatus !== 'submitted') {
      return { status: 'not_linked', reason: 'terminal_not_submitted' };
    }
    const prior = await options.repository.readReportByAttempt(input.terminal.attemptId);
    if (prior) {
      if (prior.terminal.ownerId !== input.ownerId
        || stable(prior.terminal) !== stable(input.terminal)) {
        throw new BookIntegrityReportError('integrity_report_immutable_conflict');
      }
      const replay = await options.repository.sealReport({
        ownerId: input.ownerId,
        report: prior,
      });
      return { status: 'replayed', report: replay.report };
    }
    const scope = await options.repository.readSignalScope({
      recipientId: input.terminal.recipientId,
      contextId: input.terminal.contextId,
      placementId: input.terminal.placementId,
      activityId: input.terminal.activityId,
      accountableAttemptId: input.terminal.attemptId,
    });
    const report = reportFor({
      terminal: input.terminal,
      scope,
      sealedAt: options.now?.() ?? new Date().toISOString(),
      ...(options.policy ? { policy: options.policy } : {}),
    });
    const result = await options.repository.sealReport({ ownerId: input.ownerId, report });
    return { status: result.status, report: result.report };
  },

  async readTeacherReport(locator) {
    if (!ID.test(locator.attemptId) || !TERMINAL_ID.test(locator.terminalId)) {
      throw new BookIntegrityReportError('integrity_report_response_malformed', 400);
    }
    if (locator.ownerId === undefined || !ID.test(locator.ownerId)) return null;
    const report = await options.repository.readReportForTeacher({
      ownerId: locator.ownerId,
      terminalId: locator.terminalId,
    });
    if (!report
      || report.terminal.attemptId !== locator.attemptId
      || report.terminal.terminalId !== locator.terminalId) return null;
    return report;
  },
});
