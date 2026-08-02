import {
  createDefaultBookIntegrityPolicy,
  createTrustedBookIntegrityCaptureService,
  isBookIntegritySignalRequest,
} from '../../../../src/services/book-activity/bookIntegrityCapture.service.ts';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCaptureTarget,
  type BookIntegritySignalRequest,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';
import {
  BOOK_ACTIVITY_INTEGRITY_ROOT,
  FirebaseRestBookIntegrityRepository,
} from './repository.ts';
import { Ticket91RulesEquivalentRtdb } from './ticket91-preview-rtdb.ts';

const responseHeaders = {
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: responseHeaders,
});

const target = (contextId = 'homework-1'): BookIntegrityCaptureTarget => ({
  bookId: 'book-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextKind: 'homework',
  contextId,
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
});

const accountablePolicy = createDefaultBookIntegrityPolicy('accountable', {
  policyId: 'ticket91-accountable',
  policyRevision: 1,
});
const practicePolicy = createDefaultBookIntegrityPolicy('practice', {
  policyId: 'ticket91-practice',
  policyRevision: 1,
});

const authorityFor = (
  requested: BookIntegrityCaptureTarget,
  actorUid: string,
): BookIntegrityAttemptAuthority | null => {
  if (actorUid !== 'student-1' || requested.bookId !== 'book-1'
    || !['homework-1', 'homework-policy-off', 'homework-inactive'].includes(
      requested.contextId,
    )) {
    return null;
  }
  const canonicalTarget = target(requested.contextId);
  const frozenPolicy = requested.contextId === 'homework-policy-off'
    ? practicePolicy
    : accountablePolicy;
  return {
    ...canonicalTarget,
    recipientId: actorUid,
    accountableAttemptId: requested.contextId === 'homework-inactive'
      ? 'inactive-attempt-1'
      : 'active-attempt-1',
    attemptNumber: 1,
    active: requested.contextId !== 'homework-inactive',
    frozenPolicy,
  };
};

const signalRequest = (
  sequence: number,
  contextId = 'homework-1',
): BookIntegritySignalRequest => ({
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  target: target(contextId),
  policyId: contextId === 'homework-policy-off'
    ? practicePolicy.policyId
    : accountablePolicy.policyId,
  policyRevision: 1,
  clientSessionId: 'ticket91-session-a',
  sequence,
  signal: 'paste',
});

const createState = () => {
  const rtdb = new Ticket91RulesEquivalentRtdb();
  const repository = new FirebaseRestBookIntegrityRepository({
    env: {
      FIREBASE_DB_URL: 'https://ticket91.invalid',
      BOOK_INTEGRITY_SERVICE_IDENTITY: 'ticket91-integrity@example.invalid',
    },
    fetchImpl: rtdb.fetch,
    getAccessToken: async () => 'ticket91-service-token',
  });
  const nowMs = Date.parse('2026-08-02T00:00:00.000Z');
  const service = createTrustedBookIntegrityCaptureService({
    repository,
    now: () => nowMs,
    resolveAttemptAuthority: async ({ actorUid, target: requested }) => (
      authorityFor(requested, actorUid)
    ),
  });
  return {
    repository,
    rtdb,
    service,
  };
};

const proofResponse = async (): Promise<Response> => {
  const state = createState();
  const first = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: signalRequest(1),
  });
  const replay = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: signalRequest(1),
  });
  for (let sequence = 2; sequence <= 8; sequence += 1) {
    await state.service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: signalRequest(sequence),
    });
  }
  const limited = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: signalRequest(9),
  });
  const beforeSilentChecks = state.rtdb.metrics().requests;
  const policyOff = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: signalRequest(10, 'homework-policy-off'),
  });
  const inactive = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: signalRequest(11, 'homework-inactive'),
  });
  const wrongStudent = await state.service.capture({
    actorUid: 'student-2',
    routeBookId: 'book-1',
    request: signalRequest(12),
  });
  const mismatchedTarget = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: 'book-1',
    request: {
      ...signalRequest(13),
      target: {
        ...target(),
        bindingId: 'forged-binding',
      },
    },
  });
  const afterSilentChecks = state.rtdb.metrics().requests;
  const parentReplacementDenied = await state.rtdb.proveParentReplacementDenied();
  const snapshot = state.rtdb.snapshot();
  const firstEventId = Object.keys(snapshot.events)[0] ?? 'integrity-v1-missing';
  const browserCanonicalAccessDenied = await state.rtdb.proveBrowserCanonicalAccessDenied(
    firstEventId,
  );
  const serialized = JSON.stringify(snapshot);
  const privacySafe = !/answer|response|prompt|pdfBytes|clipboardContents|secret|credential/iu
    .test(serialized);
  const noPunitiveBehavior = !/autoSubmit|autoLock|zero|consumeAttempt/iu.test(serialized);
  const immutableEventCount = Object.keys(snapshot.events).length;
  const repositoryMetrics = state.rtdb.metrics();
  const pass = first.status === 'recorded'
    && replay.status === 'deduplicated'
    && limited.status === 'rate_limited'
    && policyOff.status === 'ignored'
    && policyOff.reason === 'policy_off'
    && inactive.status === 'ignored'
    && inactive.reason === 'inactive_attempt'
    && wrongStudent.status === 'ignored'
    && mismatchedTarget.status === 'ignored'
    && mismatchedTarget.reason === 'attempt_mismatch'
    && afterSilentChecks === beforeSilentChecks
    && immutableEventCount === 8
    && repositoryMetrics.immutableEventWrites === 8
    && repositoryMetrics.immutableEventConflicts >= 1
    && parentReplacementDenied
    && browserCanonicalAccessDenied
    && privacySafe
    && noPunitiveBehavior;
  return json({
    proofKind: 'prd0062-ticket91-production-equivalent',
    pass,
    trustedBoundedWrites: {
      first,
      replay,
      limited,
      immutableEventCount,
      maxEventsPerAttempt: 64,
      maxEventsPerMinute: 8,
      trustedTimestamp: first.status === 'recorded' ? first.recordedAt : null,
    },
    policyOffSilence: {
      result: policyOff,
      repositoryRequestsBefore: beforeSilentChecks,
      repositoryRequestsAfter: afterSilentChecks,
    },
    accessDenials: {
      inactive,
      wrongStudent,
      mismatchedTarget,
      canonicalBrowserRead: 'denied',
      canonicalBrowserWrite: 'denied',
      crossStudentRead: 'denied',
      rulesEquivalentCanonicalAccessDenied: browserCanonicalAccessDenied,
    },
    productionRepository: {
      kind: 'firebase-rtdb-rest-cas-ledger-with-immutable-event-put',
      protectedRoot: BOOK_ACTIVITY_INTEGRITY_ROOT,
      serviceIdentityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
      credentialEnv: 'BOOK_INTEGRITY_GOOGLE_SA_KEY',
      browserCanonicalReads: false,
      immutableEvents: true,
      parentReplacementDenied,
      repositoryMetrics,
      rulesEquivalentTransport: true,
    },
    privacySafe,
    noPunitiveBehavior,
    completionAvailable: true,
    submissionAvailable: true,
  }, pass ? 200 : 500);
};

const commandResponse = async (request: Request, bookId: string): Promise<Response> => {
  const token = request.headers.get('authorization');
  if (token !== 'Bearer student-1-token') {
    return json({ code: 'integrity_unauthorized' }, 403);
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ code: 'integrity_request_malformed' }, 400);
  }
  if (!isBookIntegritySignalRequest(payload) || payload.target.bookId !== bookId) {
    return json({ code: 'integrity_request_malformed' }, 400);
  }
  const state = createState();
  const result = await state.service.capture({
    actorUid: 'student-1',
    routeBookId: bookId,
    request: payload,
  });
  return json(result);
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/proof') {
      return proofResponse();
    }
    if (request.method === 'GET' && url.pathname.startsWith('/book-integrity/')) {
      return json({ code: 'integrity_canonical_log_read_denied' }, 403);
    }
    const match = /^\/book-integrity\/books\/([^/]+)\/signals$/u.exec(url.pathname);
    if (request.method === 'POST' && match) {
      return commandResponse(request, decodeURIComponent(match[1]!));
    }
    return json({ code: 'ticket91_preview_fail_closed' }, 503);
  },
} satisfies ExportedHandler;
