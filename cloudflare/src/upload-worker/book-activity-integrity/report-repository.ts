import {
  BOOK_ACTIVITY_INTEGRITY_ROOT,
} from './repository.ts';
import {
  canonicalBookIntegrityReport,
  isBookIntegrityReport,
} from '../../../../src/services/book-activity/bookIntegrityReport.service.ts';
import type {
  BookIntegrityReport,
  BookIntegrityReportRepository,
  BookIntegritySignalScope,
} from '../../../../src/services/book-activity/bookIntegrityReport.types.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const TERMINAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,219}$/u;
const REPORT_ID = /^book-integrity-report-v1-[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_RETRIES = 5;

export class BookIntegrityReportRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookIntegrityReportRepositoryError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);

const pathId = (value: string, label: string, pattern = ID): string => {
  if (!pattern.test(value)) throw new BookIntegrityReportRepositoryError(`integrity_report_${label}_invalid`);
  return value;
};

export const bookIntegritySignalScopePath = (input: {
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly accountableAttemptId: string;
}): string => [
  BOOK_ACTIVITY_INTEGRITY_ROOT,
  'scopes',
  pathId(input.recipientId, 'recipient'),
  pathId(input.contextId, 'context'),
  pathId(input.placementId, 'placement'),
  pathId(input.activityId, 'activity'),
  pathId(input.accountableAttemptId, 'attempt'),
].join('/');

const reportPath = (attemptId: string): string => [
  BOOK_ACTIVITY_INTEGRITY_ROOT,
  'reports',
  pathId(attemptId, 'attempt'),
].join('/');

const teacherIndexPath = (ownerId: string, terminalId: string): string => [
  BOOK_ACTIVITY_INTEGRITY_ROOT,
  'reports_by_teacher',
  pathId(ownerId, 'owner'),
  pathId(terminalId, 'terminal', TERMINAL_ID),
].join('/');

const validScope = (value: unknown): value is BookIntegritySignalScope => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.schemaVersion === 1
    && typeof source.recipientId === 'string'
    && typeof source.contextId === 'string'
    && typeof source.placementId === 'string'
    && typeof source.activityId === 'string'
    && typeof source.accountableAttemptId === 'string'
    && source.events !== null
    && typeof source.events === 'object'
    && !Array.isArray(source.events);
};

const reportIndex = (report: BookIntegrityReport): Record<string, unknown> => ({
  schemaVersion: 1,
  ownerId: report.terminal.ownerId,
  terminalId: report.terminal.terminalId,
  attemptId: report.terminal.attemptId,
  reportId: report.reportId,
});

const validIndex = (
  value: unknown,
  ownerId: string,
  terminalId: string,
): value is { readonly attemptId: string; readonly reportId: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return Object.keys(source).length === 5
    && source.schemaVersion === 1
    && source.ownerId === ownerId
    && source.terminalId === terminalId
    && typeof source.attemptId === 'string'
    && ID.test(source.attemptId)
    && typeof source.reportId === 'string'
    && REPORT_ID.test(source.reportId)
    && source.reportId === `book-integrity-report-v1-${source.attemptId}`;
};

export interface InMemoryBookIntegrityReportRepositoryOptions {
  readonly scopes?: Readonly<Record<string, BookIntegritySignalScope>>;
  readonly reports?: Readonly<Record<string, BookIntegrityReport>>;
}

export class InMemoryBookIntegrityReportRepository implements BookIntegrityReportRepository {
  private readonly scopes: Record<string, BookIntegritySignalScope>;
  private readonly reports: Record<string, BookIntegrityReport>;
  private readonly teacherIndex: Record<string, string>;
  private sealCalls = 0;

  constructor(options: InMemoryBookIntegrityReportRepositoryOptions = {}) {
    this.scopes = clone(options.scopes ?? {});
    this.reports = clone(options.reports ?? {});
    this.teacherIndex = {};
    for (const report of Object.values(this.reports)) {
      if (isBookIntegrityReport(report)) {
        this.teacherIndex[JSON.stringify([report.terminal.ownerId, report.terminal.terminalId])] = report.terminal.attemptId;
      }
    }
  }

  metrics(): { readonly sealCalls: number } {
    return { sealCalls: this.sealCalls };
  }

  async readSignalScope(input: Parameters<BookIntegrityReportRepository['readSignalScope']>[0]): Promise<BookIntegritySignalScope | null> {
    const path = bookIntegritySignalScopePath(input);
    return this.scopes[path] ? clone(this.scopes[path]) : null;
  }

  async readReportByAttempt(attemptId: string): Promise<BookIntegrityReport | null> {
    if (!ID.test(attemptId)) throw new BookIntegrityReportRepositoryError('integrity_report_attempt_invalid');
    const report = this.reports[attemptId];
    return report && isBookIntegrityReport(report)
      && report.terminal.attemptId === attemptId ? clone(report) : null;
  }

  async readReportForTeacher(input: {
    readonly ownerId: string;
    readonly terminalId: string;
  }): Promise<BookIntegrityReport | null> {
    if (!ID.test(input.ownerId) || !TERMINAL_ID.test(input.terminalId)) {
      throw new BookIntegrityReportRepositoryError('integrity_report_index_invalid');
    }
    const attemptId = this.teacherIndex[JSON.stringify([input.ownerId, input.terminalId])];
    if (!attemptId) return null;
    const report = this.reports[attemptId];
    if (!report || !isBookIntegrityReport(report)
      || report.terminal.attemptId !== attemptId
      || report.terminal.ownerId !== input.ownerId
      || report.terminal.terminalId !== input.terminalId) return null;
    return clone(report);
  }

  async sealReport(input: {
    readonly ownerId: string;
    readonly report: BookIntegrityReport;
  }): Promise<{ readonly status: 'sealed' | 'replayed'; readonly report: BookIntegrityReport }> {
    this.sealCalls += 1;
    if (!isBookIntegrityReport(input.report) || input.report.terminal.ownerId !== input.ownerId) {
      throw new BookIntegrityReportRepositoryError('integrity_report_invalid');
    }
    const prior = this.reports[input.report.terminal.attemptId];
    if (prior) {
      if (canonicalBookIntegrityReport(prior) !== canonicalBookIntegrityReport(input.report)) {
        throw new BookIntegrityReportRepositoryError('integrity_report_immutable_conflict');
      }
      this.teacherIndex[JSON.stringify([input.ownerId, input.report.terminal.terminalId])] = input.report.terminal.attemptId;
      return { status: 'replayed', report: clone(prior) };
    }
    this.reports[input.report.terminal.attemptId] = clone(input.report);
    this.teacherIndex[JSON.stringify([input.ownerId, input.report.terminal.terminalId])] = input.report.terminal.attemptId;
    return { status: 'sealed', report: clone(input.report) };
  }
}

export interface FirebaseBookIntegrityReportRepositoryEnv extends RepositoryEnv {
  readonly BOOK_INTEGRITY_SERVICE_IDENTITY?: string;
  readonly BOOK_INTEGRITY_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestBookIntegrityReportRepository implements BookIntegrityReportRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly serviceIdentity: string;
  private readonly serviceAccountKey?: string;

  constructor(private readonly options: {
    readonly env: FirebaseBookIntegrityReportRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    const identity = options.env.BOOK_INTEGRITY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new BookIntegrityReportRepositoryError('missing_integrity_report_service_identity');
    const keyJson = options.env.BOOK_INTEGRITY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new BookIntegrityReportRepositoryError('missing_integrity_report_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
      } catch {
        throw new BookIntegrityReportRepositoryError('invalid_integrity_report_google_sa_key');
      }
      if (clientEmail !== identity) {
        throw new BookIntegrityReportRepositoryError('integrity_report_service_identity_mismatch');
      }
    }
    this.serviceIdentity = identity;
    this.serviceAccountKey = keyJson;
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? fetch,
      ...(options.getAccessToken ? { getAccessToken: options.getAccessToken } : {}),
      firebaseAuthToken: Boolean(options.getAccessToken),
    });
  }

  private assertIdentity(): void {
    if (this.options.env.BOOK_INTEGRITY_SERVICE_IDENTITY?.trim() !== this.serviceIdentity) {
      throw new BookIntegrityReportRepositoryError('integrity_report_service_identity_changed');
    }
  }

  async readSignalScope(input: Parameters<BookIntegrityReportRepository['readSignalScope']>[0]): Promise<BookIntegritySignalScope | null> {
    this.assertIdentity();
    const value = await this.rtdb.readValue(`${bookIntegritySignalScopePath(input)}/ledger`);
    if (value === null || value === undefined) return null;
    if (!validScope(value)) throw new BookIntegrityReportRepositoryError('integrity_report_scope_invalid');
    return clone(value);
  }

  async readReportByAttempt(attemptId: string): Promise<BookIntegrityReport | null> {
    this.assertIdentity();
    const value = await this.rtdb.readValue(reportPath(attemptId));
    if (value === null || value === undefined) return null;
    if (!isBookIntegrityReport(value)) throw new BookIntegrityReportRepositoryError('integrity_report_invalid');
    if (value.terminal.attemptId !== attemptId) return null;
    return clone(value);
  }

  async readReportForTeacher(input: {
    readonly ownerId: string;
    readonly terminalId: string;
  }): Promise<BookIntegrityReport | null> {
    this.assertIdentity();
    const index = await this.rtdb.readValue(teacherIndexPath(input.ownerId, input.terminalId));
    if (index === null || index === undefined) return null;
    if (!validIndex(index, input.ownerId, input.terminalId)) {
      throw new BookIntegrityReportRepositoryError('integrity_report_index_invalid');
    }
    const report = await this.readReportByAttempt(index.attemptId);
    if (!report || report.terminal.attemptId !== index.attemptId
      || report.reportId !== index.reportId
      || report.terminal.ownerId !== input.ownerId
      || report.terminal.terminalId !== input.terminalId) return null;
    return report;
  }

  async sealReport(input: {
    readonly ownerId: string;
    readonly report: BookIntegrityReport;
  }): Promise<{ readonly status: 'sealed' | 'replayed'; readonly report: BookIntegrityReport }> {
    this.assertIdentity();
    if (!isBookIntegrityReport(input.report)
      || input.report.terminal.ownerId !== input.ownerId) {
      throw new BookIntegrityReportRepositoryError('integrity_report_invalid');
    }
    const path = reportPath(input.report.terminal.attemptId);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const prior = await this.rtdb.readValue(path);
      if (prior !== null && prior !== undefined) {
        if (!isBookIntegrityReport(prior)
          || canonicalBookIntegrityReport(prior) !== canonicalBookIntegrityReport(input.report)) {
          throw new BookIntegrityReportRepositoryError('integrity_report_immutable_conflict');
        }
        await this.ensureTeacherIndex(input.report);
        return { status: 'replayed', report: clone(prior) };
      }
      if (await this.rtdb.writeIfMatch(path, input.report, 'null_etag')) {
        await this.ensureTeacherIndex(input.report);
        return { status: 'sealed', report: clone(input.report) };
      }
    }
    throw new BookIntegrityReportRepositoryError('integrity_report_repository_conflict');
  }

  private async ensureTeacherIndex(report: BookIntegrityReport): Promise<void> {
    const path = teacherIndexPath(report.terminal.ownerId, report.terminal.terminalId);
    const index = reportIndex(report);
    if (await this.rtdb.writeIfMatch(path, index, 'null_etag')) return;
    const existing = await this.rtdb.readValue(path);
    if (!validIndex(existing, report.terminal.ownerId, report.terminal.terminalId)
      || existing.attemptId !== report.terminal.attemptId
      || existing.reportId !== report.reportId) {
      throw new BookIntegrityReportRepositoryError('integrity_report_index_conflict');
    }
  }
}
