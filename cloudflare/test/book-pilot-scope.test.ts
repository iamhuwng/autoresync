import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_PILOT_MAX_STUDENTS,
  evaluateBookPilotScope,
  type BookPilotScopeConfigV1,
} from '../../src/services/book-rollout/bookPilotScope.policy.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeRoute,
} from '../src/book-pilot-scope.ts';
import {
  createBookRouter,
  type CanonicalBookRouteDescriptor,
} from '../src/upload-worker/book-router.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { evaluateBookRolloutGate } from '../../src/services/book-rollout/bookRolloutGate.policy.ts';
import { createBookSourceControlHost } from '../src/book-source-worker/control-host.ts';
import { enforceBookPilotScopeIfConfigured } from '../src/book-pilot-scope.ts';

const NOW = new Date('2026-08-12T00:30:00.000Z');
const STUDENTS = Array.from({ length: BOOK_PILOT_MAX_STUDENTS }, (_, index) => `student-${index + 1}`);
const config: BookPilotScopeConfigV1 = {
  schemaVersion: 'v1',
  environment: 'test',
  revision: 'pilot-test-1',
  issuedAt: '2026-08-12T00:00:00.000Z',
  expiresAt: '2026-08-12T01:00:00.000Z',
  teacherId: 'teacher-1',
  bookId: 'book-1',
  assignmentId: 'assignment-1',
  studentIds: STUDENTS,
  maxStudents: BOOK_PILOT_MAX_STUDENTS,
};

const scopeEnv = (overrides: Record<string, unknown> = {}) => ({
  ...(() => {
    const issuedAt = new Date(Date.now() - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    return {
      BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({ ...config, issuedAt, expiresAt }),
    };
  })(),
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_AUDIT: vi.fn(),
  ...overrides,
});

const evaluate = (overrides: Partial<Parameters<typeof evaluateBookPilotScope>[0]> = {}) =>
  evaluateBookPilotScope({
    operation: 'mutation',
    expectedEnvironment: 'test',
    actorId: 'teacher-1',
    actorKind: 'teacher',
    now: NOW,
    configReader: { read: () => config },
    ...overrides,
  });

const descriptor = (overrides: Partial<CanonicalBookRouteDescriptor> = {}): CanonicalBookRouteDescriptor => ({
  id: 'book.pilot.test',
  methods: ['POST'],
  pathTemplate: '/book-pilot/test',
  owner: '#126',
  domain: 'activity-authoring',
  handler: 'bookActivityAuthoring.stage',
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-control',
  gateEnv: 'BOOK_PILOT_ROUTES_ENABLED',
  gateDefault: 'disabled',
  requestBodyBytes: 256 * 1024,
  responseLimitBytes: 256 * 1024,
  source: 'future-seam',
  ...overrides,
});

const request = (body: unknown, path = '/book-pilot/test') => new Request(
  `https://worker.test${path}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

describe('bounded #126 pilot scope', () => {
  it('allows exact teacher, book, assignment, and named students across every action operation', () => {
    expect(evaluate({ operation: 'create' }).allowed).toBe(true);
    expect(evaluate({ operation: 'upload', bookId: 'book-1', requireBook: true }).allowed).toBe(true);
    expect(evaluate({ operation: 'publish', bookId: 'book-1', requireBook: true }).allowed).toBe(true);
    expect(evaluate({
      operation: 'assign-place',
      bookId: 'book-1',
      assignmentId: 'assignment-1',
      selectedStudentIds: ['student-1'],
      requireBook: true,
      requireAssignment: true,
      requireStudents: true,
    }).allowed).toBe(true);
    expect(evaluate({
      operation: 'launch-delivery',
      actorId: 'student-1',
      actorKind: 'student',
      assignmentId: 'assignment-1',
      studentId: 'student-1',
      selectedStudentIds: ['student-1'],
      requireAssignment: true,
      requireStudents: true,
    }).allowed).toBe(true);
    expect(evaluate({
      operation: 'mutation',
      actorId: 'student-1',
      actorKind: 'student',
      assignmentId: 'assignment-1',
      studentId: 'student-1',
      selectedStudentIds: ['student-1'],
      requireAssignment: true,
      requireStudents: true,
    }).allowed).toBe(true);
  });

  it('denies teacher, book, assignment, student, count, unresolved, and rollback states', () => {
    expect(evaluate({ actorId: 'teacher-2' }).reason).toBe('teacher_denied');
    expect(evaluate({ bookId: 'book-2', requireBook: true }).reason).toBe('book_denied');
    expect(evaluate({ assignmentId: 'assignment-2', requireAssignment: true }).reason).toBe('assignment_denied');
    expect(evaluate({ actorId: 'student-31', actorKind: 'student' }).reason).toBe('student_denied');
    expect(evaluate({ selectedStudentIds: [...STUDENTS, 'student-31'], count: 31 }).reason).toBe('count_exceeded');
    expect(evaluate({ configReader: { read: () => ({ ...config, teacherId: null }) } }).reason).toBe('identity_unresolved');
    expect(evaluate({ configReader: { read: () => undefined } }).reason).toBe('config_missing');
    expect(evaluate({ configReader: { read: () => ({ ...config, studentIds: [...STUDENTS, 'student-31'] }) } }).reason).toBe('invalid_config');
  });

  it('checks canonical mutation routes before the handler and leaves no direct bypass side effect', async () => {
    const audit = vi.fn();
    const writes = vi.fn();
    const route = descriptor({
      domain: 'delivery',
      handler: 'bookDelivery.create',
      pathTemplate: '/book-delivery/books/:bookId',
    });
    const handler = vi.fn(async () => {
      writes();
      return { body: { ok: true } };
    });
    const router = createBookRouter({
      manifest: [route],
      handlers: { 'bookDelivery.create': handler },
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    });
    const baseEnv = scopeEnv({
      BOOK_PILOT_SCOPE_AUDIT: audit,
      BOOK_PILOT_ROUTES_ENABLED: 'enabled',
      BOOK_PILOT_SCOPE_ROUTES_ENABLED: 'enabled',
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const exact = await router(request({
      intent: {
        bookId: 'book-1',
        contextId: 'assignment-1',
        contextKind: 'homework',
        recipientId: 'student-1',
      },
    }, '/book-delivery/books/book-1'), baseEnv);
    expect(exact?.status).toBe(200);
    expect(writes).toHaveBeenCalledOnce();

    const negative = async (body: unknown) => router(
      request(body, '/book-delivery/books/book-1'),
      baseEnv,
    );
    const wrongTeacher = createBookRouter({
      manifest: [route],
      handlers: { 'bookDelivery.create': handler },
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-2' }) },
    });
    const teacherResponse = await wrongTeacher(
      request({ intent: { bookId: 'book-1', contextId: 'assignment-1', contextKind: 'homework', recipientId: 'student-1' } }, '/book-delivery/books/book-1'),
      baseEnv,
    );
    expect(teacherResponse?.status).toBe(403);
    expect((await teacherResponse?.json()).decision.reason).toBe('teacher_denied');
    expect((await negative({ intent: { bookId: 'book-1', contextId: 'assignment-2', contextKind: 'homework', recipientId: 'student-1' } }))?.status).toBe(403);
    expect((await negative({ intent: { bookId: 'book-1', contextId: 'assignment-1', contextKind: 'homework', recipientId: 'student-31' } }))?.status).toBe(403);
    expect((await negative({ intent: { bookId: 'book-1', contextId: 'assignment-1', contextKind: 'course', recipientId: 'student-1' } }))?.status).toBe(403);
    expect(writes).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalled();
  });

  it('directly denies an adapter bypass without relying on the router', async () => {
    const env = scopeEnv();
    const direct = async (uid: string, body: unknown) => {
      try {
        await enforceBookPilotScopeRoute({
          env,
          uid,
          request: request(body),
          descriptor: descriptor({ domain: 'assembly', handler: 'bookAssembly.create' }),
          params: {},
        });
        return 'write';
      } catch (error) {
        if (error instanceof BookPilotScopeDeniedError) return error.decision.reason;
        throw error;
      }
    };
    expect(await direct('teacher-2', { bookId: 'book-1' })).toBe('teacher_denied');
    expect(await direct('teacher-1', { bookId: 'book-2' })).toBe('book_denied');
  });

  it('fail-closes direct adapters and enabled route gates when enforcement is absent, disabled, or malformed', async () => {
    const directHandler = vi.fn();
    const direct = async (env: Record<string, unknown>) => {
      try {
        await enforceBookPilotScopeIfConfigured({
          env,
          uid: 'teacher-1',
          request: request({ bookId: 'book-1' }),
          operation: 'mutation',
          actorKind: 'teacher',
          bookId: 'book-1',
          requireBook: true,
        });
        directHandler();
        return 'handler_called';
      } catch (error) {
        if (error instanceof BookPilotScopeDeniedError) return error.decision.reason;
        throw error;
      }
    };
    const missingFlagEnv = { ...scopeEnv() };
    Reflect.deleteProperty(missingFlagEnv, 'BOOK_PILOT_SCOPE_ENFORCEMENT');

    expect(await direct(missingFlagEnv)).toBe('enforcement_disabled');
    expect(await direct(scopeEnv({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'disabled' }))).toBe('enforcement_disabled');
    expect(await direct(scopeEnv({ BOOK_PILOT_SCOPE_CONFIG_JSON: '{ malformed' }))).toBe('invalid_config');
    expect(directHandler).not.toHaveBeenCalled();

    const routeHandler = vi.fn(async () => {
      directHandler();
      return { body: { ok: true } };
    });
    const router = createBookRouter({
      manifest: [descriptor({ domain: 'delivery', handler: 'bookDelivery.create' })],
      handlers: { 'bookDelivery.create': routeHandler },
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    });
    const routeEnv = scopeEnv({
      BOOK_PILOT_ROUTES_ENABLED: 'enabled',
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'disabled',
    });
    const response = await router(request({ bookId: 'book-1' }), routeEnv);
    expect(response?.status).toBe(503);
    expect((await response?.json()).decision.reason).toBe('enforcement_disabled');
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it('covers update/replacement seams and rollback-to-all-deny without activation', async () => {
    const update = vi.fn(async () => ({ body: { ok: true } }));
    const replacement = vi.fn(async () => ({ body: { ok: true } }));
    const handlers = createBookRouteHandlers({
      futureHandlers: {
        'futureSeam.updateCommand': update,
        'futureSeam.replacementCleanupCommand': replacement,
      },
    });
    const input = (handler: string, body: unknown, uid = 'teacher-1') => ({
      request: request(body),
      env: scopeEnv(),
      uid,
      params: {},
      descriptor: descriptor({ handler }),
    });
    await expect(handlers['futureSeam.updateCommand']!(input(
      'futureSeam.updateCommand', { bookId: 'book-2' },
    ))).rejects.toMatchObject({ message: 'book_pilot_scope_denied' });
    await expect(handlers['futureSeam.replacementCleanupCommand']!(input(
      'futureSeam.replacementCleanupCommand', { bookId: 'book-1' }, 'teacher-2',
    ))).rejects.toMatchObject({ message: 'book_pilot_scope_denied' });
    expect(update).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();

    const deniedActions = {
      create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny',
      'launch-delivery': 'deny', mutation: 'deny',
    } as const;
    const rollback = evaluateBookRolloutGate({
      operation: 'mutation',
      expectedEnvironment: 'test',
      now: NOW,
      configReader: {
        read: () => ({
          schemaVersion: 'v1', environment: 'test', revision: 'rollback-all-deny',
          issuedAt: '2026-08-12T00:00:00.000Z', expiresAt: '2026-08-12T01:00:00.000Z',
          actions: deniedActions,
        }),
      },
    });
    expect(rollback.allowed).toBe(false);
    expect(evaluateBookRolloutGate({
      operation: 'recovery',
      expectedEnvironment: 'test',
      now: NOW,
      configReader: { read: () => undefined },
    }).allowed).toBe(true);
  });

  it('denies the source retry/reconcile recovery adapter before its service can mutate', async () => {
    const observedOperations: string[] = [];
    const reconcile = vi.fn(async () => ({
      reservationId: 'reservation-1', bookId: 'book-2', sourceVersionId: 'source-1',
      status: 'released' as const, retryKind: 'none' as const,
    }));
    const response = await createBookSourceControlHost({
      service: {
        reconcile,
        begin: vi.fn(),
        complete: vi.fn(),
      },
      verifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      pilotScope: ({ actorId, bookId, operation, request: sourceRequest }) => {
        observedOperations.push(operation);
        return enforceBookPilotScopeIfConfigured({
          env: scopeEnv(),
          uid: actorId,
          request: sourceRequest,
          operation,
          actorKind: 'teacher',
          bookId,
          requireBook: true,
        });
      },
    }).fetch(new Request('https://worker.test/v1/book-source/books/book-2/upload/reservation-1/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), {});
    expect(response.status).toBe(403);
    expect(reconcile).not.toHaveBeenCalled();
    expect(observedOperations).toEqual(['mutation']);
  });

  it('denies every source control mutation when the trusted scope callback is absent', async () => {
    const begin = vi.fn(async () => ({
      status: 'reserved' as const,
      uploadUrl: 'https://upload.test/reservation-1',
      expiresAt: '2026-08-12T01:00:00.000Z',
      requiredHeaders: {},
      reservationId: 'reservation-1',
      sourceVersionId: 'source-1',
    }));
    const complete = vi.fn(async () => ({
      status: 'verified_completed' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-1',
    }));
    const requestCleanup = vi.fn(async () => ({
      reservationId: 'reservation-1', bookId: 'book-1', sourceVersionId: 'source-1',
      status: 'cleanup_pending' as const, retryKind: 'cleanup' as const,
    }));
    const reconcile = vi.fn(async () => ({
      reservationId: 'reservation-1', bookId: 'book-1', sourceVersionId: 'source-1',
      status: 'released' as const, retryKind: 'none' as const,
    }));
    const host = createBookSourceControlHost({
      service: { begin, complete, requestCleanup, reconcile },
      verifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    });
    const responseFor = (path: string) => host.fetch(new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), {});

    for (const path of [
      '/v1/book-source/books/book-1/upload/begin',
      '/v1/book-source/books/book-1/upload/reservation-1/complete',
      '/v1/book-source/books/book-1/upload/reservation-1/cancel',
      '/v1/book-source/books/book-1/upload/reservation-1/retry',
      '/v1/book-source/books/book-1/upload/reservation-1/reconcile',
    ]) {
      const response = await responseFor(path);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'book_pilot_scope_unavailable' });
    }
    expect(begin).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(requestCleanup).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });
});
