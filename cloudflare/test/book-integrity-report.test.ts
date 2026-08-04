import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultBookIntegrityPolicy,
  createTrustedBookIntegrityCaptureService,
} from '../../src/services/book-activity/bookIntegrityCapture.service';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCaptureTarget,
  type BookIntegritySignalRequest,
} from '../../src/services/book-activity/bookIntegrityCapture.types';
import {
  canonicalBookIntegrityReport,
  createTrustedBookIntegrityReportService,
  deriveBookIntegrityReport,
  BookIntegrityReportError,
} from '../../src/services/book-activity/bookIntegrityReport.service';
import type {
  BookIntegritySignalScope,
  BookIntegrityTerminalAttempt,
} from '../../src/services/book-activity/bookIntegrityReport.types';
import {
  InMemoryBookIntegrityRepository,
} from '../src/upload-worker/book-activity-integrity/repository';
import {
  InMemoryBookIntegrityReportRepository,
} from '../src/upload-worker/book-activity-integrity/report-repository';
import {
  createBookIntegrityReportHandler,
} from '../src/upload-worker/book-activity-integrity/worker';
import {
  bookIntegrityReportRouteDescriptor,
} from '../src/upload-worker/book-activity-integrity/route';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest';
import fragment from '../src/upload-worker/book-rules/fragments/37B.json';
import ticket92Preview from '../src/upload-worker/book-activity-integrity/ticket92-preview-worker';
import ticket92RollbackPreview from '../src/upload-worker/book-activity-integrity/ticket92-preview-rollback-worker';

const target: BookIntegrityCaptureTarget = {
  bookId: 'book-1',
  bindingId: 'binding-1',
  bindingRevision: 2,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
};

const authority = (attemptId = 'attempt-1'): BookIntegrityAttemptAuthority => ({
  ...target,
  recipientId: 'student-1',
  accountableAttemptId: attemptId,
  attemptNumber: 1,
  active: true,
  frozenPolicy: createDefaultBookIntegrityPolicy('accountable', {
    policyId: 'capture-policy',
    policyRevision: 1,
  }),
});

const terminal = (attemptId = 'attempt-1', update: Partial<BookIntegrityTerminalAttempt> = {}): BookIntegrityTerminalAttempt => ({
  attemptId,
  terminalId: `${attemptId}:completion`,
  resultId: `${attemptId}:result`,
  completionId: `${attemptId}:completion`,
  attemptNumber: 1,
  submittedAt: '2026-08-02T00:00:10.000Z',
  recipientId: 'student-1',
  ownerId: 'teacher-1',
  bookId: target.bookId,
  bindingId: target.bindingId,
  bindingRevision: target.bindingRevision,
  contextKind: 'homework',
  contextId: target.contextId,
  placementId: target.placementId,
  activityId: target.activityId,
  activityVersion: target.activityVersion,
  activityVersionId: 'activity-version-1',
  submissionScope: 'activity',
  resultStatus: 'pending_review',
  completionStatus: 'completed',
  ...update,
});

const request = (
  sequence: number,
  signal: BookIntegritySignalRequest['signal'],
  session = 'session-a-0001',
): BookIntegritySignalRequest => ({
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  target,
  policyId: 'capture-policy',
  policyRevision: 1,
  clientSessionId: session,
  sequence,
  signal,
});

const capturedScope = async (signals: readonly BookIntegritySignalRequest[]): Promise<BookIntegritySignalScope> => {
  const repository = new InMemoryBookIntegrityRepository();
  const service = createTrustedBookIntegrityCaptureService({
    repository,
    resolveAttemptAuthority: async () => authority(),
    now: () => Date.parse('2026-08-02T00:00:00.000Z'),
  });
  for (const signal of signals) {
    await service.capture({ actorUid: 'student-1', routeBookId: 'book-1', request: signal });
  }
  const scopes = repository.snapshot().scopes;
  return Object.values(scopes)[0] as unknown as BookIntegritySignalScope;
};

const repoFor = (scope: BookIntegritySignalScope) => new InMemoryBookIntegrityReportRepository({
  scopes: {
    'book_activity_integrity/scopes/student-1/homework-1/placement-1/activity-1/attempt-1': scope,
  },
});

describe('PRD0062 37B immutable integrity report linkage', () => {
  it('derives normal, flagged, and high-risk statuses under a versioned policy', async () => {
    const none = deriveBookIntegrityReport({
      terminal: terminal(),
      scope: null,
      sealedAt: '2026-08-02T00:00:10.000Z',
    });
    const one = deriveBookIntegrityReport({
      terminal: terminal(),
      scope: await capturedScope([request(1, 'paste')]),
      sealedAt: '2026-08-02T00:00:10.000Z',
    });
    const repeated = deriveBookIntegrityReport({
      terminal: terminal(),
      scope: await capturedScope([
        request(1, 'paste'),
        request(2, 'focus_loss'),
      ]),
      sealedAt: '2026-08-02T00:00:10.000Z',
    });
    const severe = deriveBookIntegrityReport({
      terminal: terminal(),
      scope: await capturedScope([
        request(1, 'paste'),
        request(2, 'focus_loss'),
        request(3, 'concurrent_attempt', 'session-b-0001'),
      ]),
      sealedAt: '2026-08-02T00:00:10.000Z',
    });
    expect(none).toMatchObject({ risk: 'normal', totalEventCount: 0 });
    expect(one).toMatchObject({ risk: 'normal', totalEventCount: 1, counts: { paste: 1 } });
    expect(repeated).toMatchObject({ risk: 'integrity_flagged', totalEventCount: 2 });
    expect(severe).toMatchObject({ risk: 'integrity_high_risk', totalEventCount: 3 });
    expect(one.eventRefs.map((event) => event.signal)).toEqual(['paste']);
  });

  it('seals exact attempt references and replays the same immutable report', async () => {
    const reportRepository = repoFor(await capturedScope([
      request(1, 'paste'),
      request(2, 'focus_loss'),
    ]));
    const service = createTrustedBookIntegrityReportService({
      repository: reportRepository,
      now: () => '2026-08-02T00:00:10.000Z',
    });
    const first = await service.sealSubmittedAttempt({ ownerId: 'teacher-1', terminal: terminal() });
    const replay = await service.sealSubmittedAttempt({ ownerId: 'teacher-1', terminal: terminal() });
    expect(first.status).toBe('sealed');
    expect(replay.status).toBe('replayed');
    expect(canonicalBookIntegrityReport(first.report!)).toBe(canonicalBookIntegrityReport(replay.report!));
    expect(reportRepository.metrics().sealCalls).toBe(1 + 1);
    expect(first.report?.terminal.attemptId).toBe('attempt-1');
    expect(first.report?.totalEventCount).toBe(2);
  });

  it('rejects cross-attempt scope mixing and never changes a sealed severity', async () => {
    const scope = await capturedScope([request(1, 'paste')]);
    expect(() => deriveBookIntegrityReport({
      terminal: terminal('attempt-2'),
      scope,
      sealedAt: '2026-08-02T00:00:10.000Z',
    })).toThrowError(new BookIntegrityReportError('integrity_report_scope_mismatch'));
    expect(() => deriveBookIntegrityReport({
      terminal: terminal('attempt-1', { resultStatus: 'pending_review' }),
      scope,
      sealedAt: '2026-08-02T00:00:10.000Z',
    })).not.toThrow();
  });

  it('keeps report reads teacher-owned and excludes student/cross-owner projections', async () => {
    const reportRepository = repoFor(await capturedScope([request(1, 'paste')]));
    const service = createTrustedBookIntegrityReportService({
      repository: reportRepository,
      now: () => '2026-08-02T00:00:10.000Z',
    });
    await service.sealSubmittedAttempt({ ownerId: 'teacher-1', terminal: terminal() });
    const handler = createBookIntegrityReportHandler({
      reportRepository,
      resolveTeacherOwnerId: async ({ actorUid }) => actorUid === 'teacher-1' ? 'teacher-1' : null,
    });
    const read = (uid: string, terminalId = 'attempt-1:completion') => handler({
      request: new Request('https://worker.test/book-integrity/books/book-1/terminals/x/report', { method: 'GET' }),
      env: { BOOK_INTEGRITY_REPORT_ROUTES_ENABLED: 'enabled' },
      uid,
      params: { bookId: 'book-1', terminalId },
      descriptor: bookIntegrityReportRouteDescriptor,
    }) as Promise<Response>;
    const teacher = await read('teacher-1');
    const student = await read('student-1');
    const other = await read('teacher-2');
    expect(teacher.status).toBe(200);
    expect(student.status).toBe(403);
    expect(other.status).toBe(403);
    expect(JSON.stringify(await teacher.json())).not.toMatch(/response|answer|prompt|score|feedback/iu);
  });

  it('rejects a malformed repository projection before it reaches the teacher', async () => {
    const malformed = {
      reportId: 'book-integrity-report-v1-attempt-1',
      terminal: {
        ...terminal(),
        response: 'student answer must never cross this boundary',
      },
    };
    const reportRepository = {
      readReportForTeacher: vi.fn(async () => malformed),
    } as unknown as InMemoryBookIntegrityReportRepository;
    const handler = createBookIntegrityReportHandler({
      reportRepository,
      resolveTeacherOwnerId: async () => 'teacher-1',
    });
    const response = await handler({
      request: new Request('https://worker.test/book-integrity/books/book-1/terminals/attempt-1:completion/report', { method: 'GET' }),
      env: { BOOK_INTEGRITY_REPORT_ROUTES_ENABLED: 'enabled' },
      uid: 'teacher-1',
      params: { bookId: 'book-1', terminalId: 'attempt-1:completion' },
      descriptor: bookIntegrityReportRouteDescriptor,
    }) as Response;
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain('student answer');
  });

  it('resolves ownership before reading and rejects Solo-shaped terminals', async () => {
    const readReportForTeacher = vi.fn(async () => null);
    const reportRepository = { readReportForTeacher } as unknown as InMemoryBookIntegrityReportRepository;
    const handler = createBookIntegrityReportHandler({
      reportRepository,
      resolveTeacherOwnerId: async () => null,
    });
    const response = await handler({
      request: new Request('https://worker.test/book-integrity/books/book-1/terminals/attempt-1:completion/report', { method: 'GET' }),
      env: { BOOK_INTEGRITY_REPORT_ROUTES_ENABLED: 'enabled' },
      uid: 'student-1',
      params: { bookId: 'book-1', terminalId: 'attempt-1:completion' },
      descriptor: bookIntegrityReportRouteDescriptor,
    }) as Response;
    expect(response.status).toBe(403);
    expect(readReportForTeacher).not.toHaveBeenCalled();
    expect(() => deriveBookIntegrityReport({
      terminal: terminal('attempt-1', { contextKind: 'solo' as never }),
      scope: null,
      sealedAt: '2026-08-02T00:00:10.000Z',
    })).toThrowError(new BookIntegrityReportError('integrity_report_terminal_invalid'));
  });

  it('declares the fixed teacher route and service-only report/index rules', () => {
    expect(bookIntegrityReportRouteDescriptor).toMatchObject({
      owner: '#92',
      handler: 'futureSeam.integrityReport',
      pathTemplate: '/book-integrity/books/:bookId/terminals/:terminalId/report',
      gateEnv: 'BOOK_INTEGRITY_REPORT_ROUTES_ENABLED',
    });
    expect(canonicalBookRouteManifest.find((entry) => entry.id === 'book.integrity.report'))
      .toMatchObject({ handler: 'futureSeam.integrityReport', owner: '#92' });
    expect(fragment.ticketId).toBe('37B');
    const operations = fragment.operations as Array<{ path: string; rule: string; expression: string }>;
    expect(operations.find((entry) => entry.path === 'book_activity_integrity/reports' && entry.rule === '.read')?.expression)
      .toBe('false');
    expect(operations.find((entry) => entry.path.endsWith('reports/$attemptId') && entry.rule === '.write')?.expression)
      .toContain('!data.exists()');
    expect(operations.find((entry) => entry.path.includes('reports_by_teacher/$ownerId/$terminalId') && entry.rule === '.read')?.expression)
      .toContain('book_integrity_service');
  });

  it('proves production-equivalent linkage, replay, and owner-only reads', async () => {
    const response = await ticket92Preview.fetch(new Request('https://ticket92.preview/proof'));
    const body = await response.json() as {
      pass: boolean;
      linkage: { replayUnchanged: boolean; sealCalls: number };
      teacherRead: { status: number };
      studentRead: { status: number };
      crossOwnerRead: { status: number };
    };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      pass: true,
      linkage: { replayUnchanged: true, sealCalls: 2 },
      teacherRead: { status: 200 },
      studentRead: { status: 403 },
      crossOwnerRead: { status: 403 },
    });
  });

  it('proves rollback hides the report while preserving academic outcomes', async () => {
    const response = await ticket92RollbackPreview.fetch(new Request('https://ticket92.preview/rollback'));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      report: 'hidden',
      reportRoute: 'disabled',
      linkage: 'disabled',
      attempts: 'preserved',
      results: 'preserved',
      signals: 'preserved',
      academicOutcomes: 'preserved',
      submissionAvailable: true,
      gradingAvailable: true,
      completionAvailable: true,
    });
  });
});
