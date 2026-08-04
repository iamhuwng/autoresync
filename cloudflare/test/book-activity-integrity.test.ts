import { describe, expect, it } from 'vitest';
import {
  createDefaultBookIntegrityPolicy,
  createTrustedBookIntegrityCaptureService,
} from '../../src/services/book-activity/bookIntegrityCapture.service';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  BOOK_INTEGRITY_SIGNAL_TYPES,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCaptureTarget,
  type BookIntegritySignalRequest,
} from '../../src/services/book-activity/bookIntegrityCapture.types';
import {
  FirebaseRestBookIntegrityRepository,
  InMemoryBookIntegrityRepository,
} from '../src/upload-worker/book-activity-integrity/repository';
import {
  Ticket91RulesEquivalentRtdb,
} from '../src/upload-worker/book-activity-integrity/ticket91-preview-rtdb';
import {
  bookIntegritySignalRouteDescriptor,
} from '../src/upload-worker/book-activity-integrity/route';
import {
  canonicalBookRouteManifest,
} from '../src/upload-worker/book-routes/manifest';
import {
  createBookIntegrityWorkerHandlers,
  createBookIntegritySignalHandler,
} from '../src/upload-worker/book-activity-integrity/worker';
import { createBookRouter } from '../src/upload-worker/book-router';
import fragment from '../src/upload-worker/book-rules/fragments/37A.json';

const target = (): BookIntegrityCaptureTarget => ({
  bookId: 'book-1',
  bindingId: 'binding-1',
  bindingRevision: 2,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 3,
});

const policy = () => ({
  ...createDefaultBookIntegrityPolicy('accountable', {
    policyId: 'policy-1',
    policyRevision: 4,
  }),
  requiredFocusMode: true,
});

const authority = (
  update: Partial<BookIntegrityAttemptAuthority> = {},
): BookIntegrityAttemptAuthority => ({
  ...target(),
  recipientId: 'student-1',
  accountableAttemptId: 'active-attempt-2',
  attemptNumber: 2,
  active: true,
  frozenPolicy: policy(),
  ...update,
});

const request = (
  sequence: number,
  signal: BookIntegritySignalRequest['signal'] = 'paste',
  update: Partial<BookIntegritySignalRequest> = {},
): BookIntegritySignalRequest => ({
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  target: target(),
  policyId: 'policy-1',
  policyRevision: 4,
  clientSessionId: 'session-a-0001',
  sequence,
  signal,
  ...update,
});

const harness = (options: {
  readonly resolved?: BookIntegrityAttemptAuthority | null;
  readonly now?: () => number;
} = {}) => {
  const repository = new InMemoryBookIntegrityRepository();
  const service = createTrustedBookIntegrityCaptureService({
    repository,
    now: options.now ?? (() => Date.parse('2026-08-02T00:00:00.000Z')),
    resolveAttemptAuthority: async () => options.resolved === undefined
      ? authority()
      : options.resolved,
  });
  return { repository, service };
};

describe('Book Activity bounded integrity capture', () => {
  it('records every configured signal only against the exact trusted active attempt', async () => {
    for (const signal of BOOK_INTEGRITY_SIGNAL_TYPES) {
      const { service } = harness();
      if (signal === 'concurrent_attempt') {
        await service.capture({
          actorUid: 'student-1',
          routeBookId: 'book-1',
          request: request(1, 'focus_loss'),
        });
      }
      const result = await service.capture({
        actorUid: 'student-1',
        routeBookId: 'book-1',
        request: request(2, signal, {
          clientSessionId: signal === 'concurrent_attempt'
            ? 'session-b-0002'
            : 'session-a-0001',
        }),
      });
      expect(result.status, signal).toBe('recorded');
    }
  });

  it('uses trusted time and deterministic deduplication without retaining sensitive content', async () => {
    const { repository, service } = harness();
    const first = await service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1),
    });
    const replay = await service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1),
    });

    expect(first).toMatchObject({
      status: 'recorded',
      signal: 'paste',
      recordedAt: '2026-08-02T00:00:00.000Z',
    });
    expect(replay).toMatchObject({
      status: 'deduplicated',
      eventId: 'eventId' in first ? first.eventId : '',
    });
    const serialized = JSON.stringify(repository.snapshot());
    expect(serialized).not.toMatch(
      /answer|response|prompt|pdfBytes|clipboardContents|secret|credential|privateObjectKey/iu,
    );
    expect(serialized).not.toMatch(/autoSubmit|autoLock|zero|consumeAttempt/iu);
  });

  it('separates the CAS ledger from append-only canonical event writes', async () => {
    const rtdb = new Ticket91RulesEquivalentRtdb();
    const repository = new FirebaseRestBookIntegrityRepository({
      env: {
        FIREBASE_DB_URL: 'https://ticket91.invalid',
        BOOK_INTEGRITY_SERVICE_IDENTITY: 'ticket91-integrity@example.invalid',
      },
      fetchImpl: rtdb.fetch,
      getAccessToken: async () => 'ticket91-service-token',
    });
    const service = createTrustedBookIntegrityCaptureService({
      repository,
      resolveAttemptAuthority: async () => authority(),
      now: () => Date.parse('2026-08-02T00:00:00.000Z'),
    });
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1),
    })).resolves.toMatchObject({ status: 'recorded' });
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(2),
    })).resolves.toMatchObject({ status: 'recorded' });
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1),
    })).resolves.toMatchObject({ status: 'deduplicated' });

    expect(rtdb.metrics()).toMatchObject({
      ledgerWrites: 2,
      immutableEventWrites: 2,
      immutableEventConflicts: 1,
      deniedParentWrites: 0,
    });
    expect(Object.keys(rtdb.snapshot().events)).toHaveLength(2);
    await expect(rtdb.proveParentReplacementDenied()).resolves.toBe(true);
    expect(rtdb.metrics().deniedParentWrites).toBe(1);
  });

  it('fails silent before repository access for policy-off, practice, inactive, and mismatched attempts', async () => {
    const practice = createDefaultBookIntegrityPolicy('practice', {
      policyId: 'policy-1',
      policyRevision: 4,
    });
    expect(practice.enabled).toBe(false);
    const cases: readonly BookIntegrityAttemptAuthority[] = [
      authority({ frozenPolicy: { ...policy(), enabled: false } }),
      authority({ frozenPolicy: practice }),
      authority({ active: false }),
      authority({ activityVersion: 99 }),
    ];
    for (const resolved of cases) {
      const { repository, service } = harness({ resolved });
      const result = await service.capture({
        actorUid: 'student-1',
        routeBookId: 'book-1',
        request: request(1),
      });
      expect(result).toMatchObject({ status: 'ignored' });
      expect(repository.metrics().appendCalls).toBe(0);
    }
  });

  it('enforces a finite rate window and an absolute immutable event cap', async () => {
    let now = Date.parse('2026-08-02T00:00:00.000Z');
    const { service } = harness({ now: () => now });
    for (let sequence = 1; sequence <= 8; sequence += 1) {
      await expect(service.capture({
        actorUid: 'student-1',
        routeBookId: 'book-1',
        request: request(sequence),
      })).resolves.toMatchObject({ status: 'recorded' });
    }
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(9),
    })).resolves.toMatchObject({ status: 'rate_limited', recordedEventCount: 8 });

    for (let sequence = 9; sequence <= 64; sequence += 1) {
      now += 60_001;
      await service.capture({
        actorUid: 'student-1',
        routeBookId: 'book-1',
        request: request(sequence),
      });
    }
    now += 60_001;
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(65),
    })).resolves.toEqual({
      status: 'ignored',
      signal: 'paste',
      reason: 'event_limit',
      recordedEventCount: 64,
    });
  });

  it('detects bounded concurrent sessions without inventing a signal for the first session', async () => {
    const { repository, service } = harness();
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1, 'concurrent_attempt'),
    })).resolves.toMatchObject({ status: 'ignored', reason: 'not_concurrent' });
    await expect(service.capture({
      actorUid: 'student-1',
      routeBookId: 'book-1',
      request: request(1, 'concurrent_attempt', { clientSessionId: 'session-b-0002' }),
    })).resolves.toMatchObject({ status: 'recorded', signal: 'concurrent_attempt' });
    const scopes = Object.values(repository.snapshot().scopes);
    expect(Object.keys(scopes[0]!.sessions)).toHaveLength(2);
  });

  it('exposes only the fixed POST seam and keeps rollback independent from completion/submission', async () => {
    expect(bookIntegritySignalRouteDescriptor).toMatchObject({
      handler: 'futureSeam.integritySignal',
      pathTemplate: '/book-integrity/books/:bookId/signals',
      gateDefault: 'disabled',
      identityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
    });
    expect(canonicalBookRouteManifest.find((entry) => entry.id === 'book.integrity.signal'))
      .toMatchObject({
        handler: 'futureSeam.integritySignal',
        requestBodyBytes: 4 * 1024,
        responseLimitBytes: 8 * 1024,
        identityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
        credentialEnv: 'BOOK_INTEGRITY_GOOGLE_SA_KEY',
    });
    const repository = new InMemoryBookIntegrityRepository();
    const handlerOptions = {
      createRepository: () => repository,
      resolveAttemptAuthority: async () => authority(),
      now: () => Date.parse('2026-08-02T00:00:00.000Z'),
    };
    const futureHandlers = createBookIntegrityWorkerHandlers(handlerOptions);
    expect(Object.keys(futureHandlers)).toEqual(['futureSeam.integritySignal']);
    const router = createBookRouter({
      handlers: futureHandlers,
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'student-1' }),
      },
    });
    const response = await router.fetch(
      new Request('https://worker.test/book-integrity/books/book-1/signals', {
        method: 'POST',
        headers: {
          authorization: 'Bearer student-token',
          'content-type': 'application/json',
          origin: 'http://localhost:5174',
        },
        body: JSON.stringify(request(1)),
      }),
      {
        BOOK_INTEGRITY_ROUTES_ENABLED: 'enabled',
        BOOK_INTEGRITY_SERVICE_IDENTITY: 'ticket91-integrity@example.invalid',
        BOOK_INTEGRITY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'ticket91-integrity@example.invalid',
          private_key: 'preview-only',
        }),
        BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(200);

    const handler = createBookIntegritySignalHandler(handlerOptions);
    const disabled = await handler({
      request: new Request('https://worker.test/book-integrity/books/book-1/signals', {
        method: 'POST',
      }),
      env: { BOOK_INTEGRITY_ROUTES_ENABLED: 'disabled' },
      uid: 'student-1',
      params: { bookId: 'book-1' },
      descriptor: bookIntegritySignalRouteDescriptor,
    }) as Response;
    await expect(disabled.json()).resolves.toMatchObject({
      capture: 'disabled',
      completionAvailable: true,
      submissionAvailable: true,
      recordedSignals: 'preserved',
    });
  });

  it('declares service-only immutable canonical logs and browser/cross-student denials', () => {
    expect(fragment.ticketId).toBe('37A');
    const operations = fragment.operations as Array<{
      path: string;
      rule: string;
      expression: string;
    }>;
    const rootRead = operations.find((entry) => (
      entry.path === 'book_activity_integrity' && entry.rule === '.read'
    ));
    const rootWrite = operations.find((entry) => (
      entry.path === 'book_activity_integrity' && entry.rule === '.write'
    ));
    const scopeRead = operations.find((entry) => entry.path.endsWith('$attemptId')
      && entry.rule === '.read');
    const scopeWrite = operations.find((entry) => entry.path.endsWith('$attemptId')
      && entry.rule === '.write');
    const ledgerWrite = operations.find((entry) => entry.path.endsWith('$attemptId/ledger')
      && entry.rule === '.write');
    const canonicalEventWrite = operations.find((entry) => (
      entry.path.endsWith('$attemptId/events/$eventId') && entry.rule === '.write'
    ));
    const eventValidation = operations.find((entry) => (
      entry.path.endsWith('$attemptId/events/$eventId') && entry.rule === '.validate'
    ));
    expect(rootRead?.expression).toBe('false');
    expect(rootWrite?.expression).toBe('false');
    expect(scopeRead?.expression).toContain('book_integrity_service == true');
    expect(scopeRead?.expression).toContain('book_integrity_recipientId == $recipientId');
    expect(scopeWrite?.expression).toBe('false');
    expect(ledgerWrite?.expression).toContain('book_integrity_service == true');
    expect(canonicalEventWrite?.expression).toContain('!data.exists()');
    expect(canonicalEventWrite?.expression).toContain('newData.exists()');
    expect(eventValidation?.expression).toContain("newData.child('recordedAt').isString()");
    expect(eventValidation?.expression).toContain("newData.child('target').numChildren() == 8");
    expect(eventValidation?.expression).not.toContain('auth.uid == $recipientId');
  });
});
