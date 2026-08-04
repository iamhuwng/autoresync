import {
  createDefaultBookIntegrityPolicy,
  createTrustedBookIntegrityCaptureService,
} from '../../../../src/services/book-activity/bookIntegrityCapture.service.ts';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCaptureTarget,
  type BookIntegritySignalRequest,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';
import {
  createTrustedBookIntegrityReportService,
} from '../../../../src/services/book-activity/bookIntegrityReport.service.ts';
import type {
  BookIntegritySignalScope,
  BookIntegrityTerminalAttempt,
} from '../../../../src/services/book-activity/bookIntegrityReport.types.ts';
import {
  InMemoryBookIntegrityReportRepository,
} from './report-repository.ts';
import {
  InMemoryBookIntegrityRepository,
} from './repository.ts';
import {
  createBookIntegrityReportHandler,
} from './worker.ts';

const responseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
} as const;

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: responseHeaders,
});

const target: BookIntegrityCaptureTarget = {
  bookId: 'book-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
};

const policy = createDefaultBookIntegrityPolicy('accountable', {
  policyId: 'ticket92-accountable',
  policyRevision: 1,
});

const authority: BookIntegrityAttemptAuthority = {
  ...target,
  recipientId: 'student-1',
  accountableAttemptId: 'active-attempt-1',
  attemptNumber: 1,
  active: true,
  frozenPolicy: policy,
};

const request = (
  sequence: number,
  signal: BookIntegritySignalRequest['signal'],
  clientSessionId = 'ticket92-session-a',
): BookIntegritySignalRequest => ({
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  target,
  policyId: policy.policyId,
  policyRevision: policy.policyRevision,
  clientSessionId,
  sequence,
  signal,
});

const terminal: BookIntegrityTerminalAttempt = {
  attemptId: 'active-attempt-1',
  terminalId: 'active-attempt-1:completion',
  resultId: 'active-attempt-1:result',
  completionId: 'active-attempt-1:completion',
  attemptNumber: 1,
  submittedAt: '2026-08-02T00:00:10.000Z',
  recipientId: 'student-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
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
};

const createProofState = async () => {
  const signalRepository = new InMemoryBookIntegrityRepository();
  const capture = createTrustedBookIntegrityCaptureService({
    repository: signalRepository,
    now: () => Date.parse('2026-08-02T00:00:00.000Z'),
    resolveAttemptAuthority: async () => authority,
  });
  const first = await capture.capture({
    actorUid: 'student-1',
    routeBookId: target.bookId,
    request: request(1, 'paste'),
  });
  const second = await capture.capture({
    actorUid: 'student-1',
    routeBookId: target.bookId,
    request: request(2, 'focus_loss'),
  });
  const severe = await capture.capture({
    actorUid: 'student-1',
    routeBookId: target.bookId,
    request: request(1, 'concurrent_attempt', 'ticket92-session-b'),
  });
  const replay = await capture.capture({
    actorUid: 'student-1',
    routeBookId: target.bookId,
    request: request(1, 'paste'),
  });
  const snapshot = signalRepository.snapshot();
  const scope = Object.values(snapshot.scopes)[0] as unknown as BookIntegritySignalScope;
  const reportRepository = new InMemoryBookIntegrityReportRepository({
    scopes: {
      [`book_activity_integrity/scopes/${authority.recipientId}/${target.contextId}/${target.placementId}/${target.activityId}/${authority.accountableAttemptId}`]: scope,
    },
  });
  const reportService = createTrustedBookIntegrityReportService({
    repository: reportRepository,
    now: () => '2026-08-02T00:00:10.000Z',
  });
  const sealed = await reportService.sealSubmittedAttempt({ ownerId: terminal.ownerId, terminal });
  const replayed = await reportService.sealSubmittedAttempt({ ownerId: terminal.ownerId, terminal });
  return {
    signalRepository,
    reportRepository,
    first,
    second,
    severe,
    replay,
    sealed,
    replayed,
    terminal,
  };
};

const reportRead = async (
  state: Awaited<ReturnType<typeof createProofState>>,
  uid: string,
  token: string,
): Promise<{ status: number; body: unknown }> => {
  const handler = createBookIntegrityReportHandler({
    reportRepository: state.reportRepository,
    resolveTeacherOwnerId: async ({ actorUid }) => actorUid === 'teacher-1' && token === 'teacher-token'
      ? 'teacher-1'
      : null,
  });
  const response = await handler({
    request: new Request('https://ticket92.preview/book-integrity/books/book-1/terminals/active-attempt-1:completion/report', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    }),
    env: { BOOK_INTEGRITY_REPORT_ROUTES_ENABLED: 'enabled' },
    uid,
    params: {
      bookId: 'book-1',
      terminalId: 'active-attempt-1:completion',
    },
    descriptor: {
      id: 'book.integrity.report',
      methods: ['GET'],
      pathTemplate: '/book-integrity/books/:bookId/terminals/:terminalId/report',
      owner: '#92',
      domain: 'integrity',
      handler: 'futureSeam.integrityReport',
      firebaseAuth: 'firebase-id-token-teacher',
      rateClass: 'book-read',
      gateEnv: 'BOOK_INTEGRITY_REPORT_ROUTES_ENABLED',
      gateDefault: 'disabled',
      requestBodyBytes: 0,
      responseLimitBytes: 32 * 1024,
      source: 'contributor',
      contributorTicket: '#92',
    },
  }) as Response;
  return { status: response.status, body: await response.json() };
};

const proofResponse = async (): Promise<Response> => {
  const state = await createProofState();
  const owningTeacher = await reportRead(state, 'teacher-1', 'teacher-token');
  const student = await reportRead(state, 'student-1', 'student-token');
  const otherTeacher = await reportRead(state, 'teacher-2', 'teacher-token');
  const sealedReport = state.sealed.report;
  const replayedReport = state.replayed.report;
  const serialized = JSON.stringify(sealedReport);
  const replayUnchanged = JSON.stringify(sealedReport) === JSON.stringify(replayedReport);
  const reportSafe = !/answer|response|prompt|score|feedback|credential|privateObjectKey/iu.test(serialized);
  const nonPunitive = !/autoSubmit|autoLock|zero|consumeAttempt|eligibility/iu.test(serialized);
  const pass = state.first.status === 'recorded'
    && state.second.status === 'recorded'
    && state.severe.status === 'recorded'
    && state.replay.status === 'deduplicated'
    && state.signalRepository.snapshot().scopes[Object.keys(state.signalRepository.snapshot().scopes)[0]!]
      ?.events !== undefined
    && Object.keys(state.signalRepository.snapshot().scopes[Object.keys(state.signalRepository.snapshot().scopes)[0]!]!.events).length === 3
    && state.sealed.status === 'sealed'
    && state.replayed.status === 'replayed'
    && replayUnchanged
    && sealedReport?.risk === 'integrity_high_risk'
    && owningTeacher.status === 200
    && student.status === 403
    && otherTeacher.status === 403
    && reportSafe
    && nonPunitive;
  return json({
    proofKind: 'prd0062-ticket92-production-equivalent',
    pass,
    terminal: {
      attemptId: state.terminal.attemptId,
      terminalId: state.terminal.terminalId,
      resultStatus: state.terminal.resultStatus,
      completionStatus: state.terminal.completionStatus,
    },
    capture: {
      first: state.first,
      second: state.second,
      severe: state.severe,
      replay: state.replay,
      immutableEventCount: Object.keys(state.signalRepository.snapshot().scopes[Object.keys(state.signalRepository.snapshot().scopes)[0]!]!.events).length,
    },
    linkage: {
      first: state.sealed,
      replay: state.replayed,
      replayUnchanged,
      sealCalls: state.reportRepository.metrics().sealCalls,
    },
    teacherRead: owningTeacher,
    studentRead: student,
    crossOwnerRead: otherTeacher,
    reportSafe,
    nonPunitive,
    preservedAcademicOutcomes: {
      resultStatus: state.terminal.resultStatus,
      completionStatus: state.terminal.completionStatus,
      attemptNumber: state.terminal.attemptNumber,
    },
  }, pass ? 200 : 500);
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/proof') {
      return proofResponse();
    }
    return json({ code: 'ticket92_preview_fail_closed' }, 503);
  },
} satisfies ExportedHandler;
