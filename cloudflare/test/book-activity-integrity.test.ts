import { afterEach, describe, expect, it, vi } from 'vitest';
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
import {
  isCompleteTerminalForTarget,
  resolveBookIntegrityCaptureLaunch,
} from '../src/upload-worker/book-activity-integrity/production-composition';
import { FirebaseRestBookDeliveryRepository } from '../src/upload-worker/book-delivery/repository';
import { FirebaseRestBookHomeworkDocumentStore } from '../src/upload-worker/book-homework/repository';
import { FirebaseRestBookHomeworkSagaRepository } from '../src/upload-worker/book-homework/sagaRepository';
import {
  FirebaseRestBookRuntimeRepository,
  type BookRuntimeTerminalTuple,
} from '../src/upload-worker/book-runtime/repository';
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
  captureSlotId: 'capture-slot-2',
  captureAttemptNumber: 2,
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
  captureSlotId: 'capture-slot-2',
  captureAttemptNumber: 2,
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

const productionFixture = () => {
  const binding = {
    bindingId: 'binding-1',
    revision: 2,
    status: 'active',
    recipient: { recipientId: 'student-1', recipientKind: 'student' },
    issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
    book: {
      bookId: 'book-1', bookMode: 'pdf', bookRevision: 1, manifestVersionId: 'manifest-1',
      publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published',
    },
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    context: {
      kind: 'homework', contextId: 'homework-1', ownerId: 'teacher-1',
      recipientId: 'student-1', entitlementBasis: 'assignment',
    },
    sourceSet: { strategy: 'full_pdf', sources: [] },
    placements: [{
      placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-3',
      activityVersion: 3, nodeKey: 'unit-1', order: 1, contextMode: 'required',
      pageGroupKeys: ['page-group-1'], sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
    }],
    schedulePolicy: { policyId: 'policy-1', policyRevision: 4, basis: 'immutable-reference' },
    createdAt: '2026-09-01T00:00:00.000Z',
  };
  const authorityId = 'homework-1--student-1--authority';
  const authorityRecord = {
    assignmentId: authorityId,
    assignmentKind: 'book_activity_bundle',
    schemaVersion: 1,
    ownerId: 'teacher-1',
    bookManifest: {
      schemaVersion: 1, assignmentKind: 'book_activity_bundle', manifestVersionId: 'manifest-1',
      ownerId: 'teacher-1', createdByCommandId: 'command-1', createdAt: '2026-09-01T00:00:00.000Z',
      bindingRevision: 2, book: binding.book,
      context: { contextId: 'homework-1', recipientId: 'student-1', kind: 'homework', entitlementBasis: 'assignment' },
      selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
      outline: binding.outline, scheduleRules: [], bindings: [{
        bindingId: 'placement-1', placementId: 'placement-1', activityId: 'activity-1',
        activityVersionId: 'activity-version-3', activityVersion: 3, nodeKey: 'unit-1', order: 1,
        contextMode: 'required', pageGroupKeys: ['page-group-1'], sourceReadiness: 'ready',
        sourceContext: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumbers: [1] }], state: 'required',
      }],
      completion: { aggregation: 'required-activities-submitted-over-required-activities', requiredBindingCount: 1, excludedBindingCount: 0, legacyScoreFields: 'untouched' },
    },
    schedule: { schemaVersion: 1, resolverVersion: 1, finalDueAt: '2026-09-30T00:00:00.000Z', scheduleRules: [] },
    activityPolicies: { 'placement-1': {
      schemaVersion: 1, policyId: 'policy-1', policyRevision: 4, placementId: 'placement-1',
      activityId: 'activity-1', activityVersionId: 'activity-version-3', activityVersion: 3,
      lateSubmissionAllowed: false, maxAttempts: null,
    } },
    frozenPolicy: { intent: 'accountable', integrityDefault: true, integrityOverride: true, integrityEffective: true },
    studentExtensions: {},
    saga: { sagaId: 'homework-1', state: 'committed', lastCommandId: 'command-1' },
    visibility: { status: 'committed', pointerId: 'manifest-1', manifestVersionId: 'manifest-1', revision: 2 },
    revision: 2, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const saga = {
    assignmentId: 'homework-1', contextId: 'homework-1', ownerId: 'teacher-1',
    state: 'committed', visibility: 'committed',
    recipients: [{ recipientId: 'student-1', authorityId, bindingId: 'binding-1', bindingRevision: 2, state: 'committed' }],
  };
  return { binding, authorityId, authorityRecord, saga };
};

const terminal = (update: Record<string, unknown> = {}): BookRuntimeTerminalTuple => {
  const attempt = {
    recipientId: 'student-1', contextId: 'homework-1', bindingId: 'binding-previous', bindingRevision: 1,
    placementId: 'placement-1', activityId: 'activity-1', activityVersion: 3,
    activityVersionId: 'activity-version-3', attemptId: 'attempt-1', attemptNumber: 1, ...update,
  };
  return {
    attempt,
    result: { ...attempt, resultId: `${attempt.attemptId}:result`, status: 'submitted' },
    completion: { ...attempt, completionId: `${attempt.attemptId}:completion`, resultId: `${attempt.attemptId}:result`, status: 'completed' },
    index: { ...attempt, resultId: `${attempt.attemptId}:result` },
  } as unknown as BookRuntimeTerminalTuple;
};

const productionEnv = {
  BOOK_INTEGRITY_ROUTES_ENABLED: 'enabled',
  FIREBASE_DB_URL: 'https://test.invalid',
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_WEB_API_KEY: 'test-api-key',
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@test.invalid',
  BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'delivery@test.invalid', private_key: 'test' }),
  BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@test.invalid',
  BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'runtime@test.invalid', private_key: 'test' }),
  BOOK_HOMEWORK_SERVICE_IDENTITY: 'homework@test.invalid',
  BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'homework@test.invalid', private_key: 'test' }),
} as const;

const stubProduction = (update: {
  binding?: Record<string, unknown>;
  authority?: Record<string, unknown>;
  saga?: Record<string, unknown>;
  rows?: readonly BookRuntimeTerminalTuple[];
} = {}) => {
  const fixture = productionFixture();
  const resolveCurrent = vi.spyOn(FirebaseRestBookDeliveryRepository.prototype, 'resolveCurrent').mockResolvedValue({
    record: { binding: update.binding ?? fixture.binding }, pointer: {},
  } as never);
  const readAuthority = vi.spyOn(FirebaseRestBookHomeworkDocumentStore.prototype, 'read').mockResolvedValue({
    value: update.authority ?? fixture.authorityRecord,
  } as never);
  const readSaga = vi.spyOn(FirebaseRestBookHomeworkSagaRepository.prototype, 'read').mockResolvedValue(
    (update.saga ?? fixture.saga) as never,
  );
  const listTerminalTuples = vi.spyOn(FirebaseRestBookRuntimeRepository.prototype, 'listTerminalTuples').mockResolvedValue(update.rows ?? []);
  return { ...fixture, resolveCurrent, readAuthority, readSaga, listTerminalTuples };
};

afterEach(() => vi.restoreAllMocks());

describe('Book Activity bounded integrity capture', () => {
  it('accepts a complete historical terminal from a prior binding when numbering the current successor', () => {
    const attempt = {
      recipientId: 'student-1',
      contextId: 'homework-1',
      bindingId: 'binding-previous',
      bindingRevision: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 3,
      activityVersionId: 'activity-version-3',
      attemptId: 'attempt-1',
      attemptNumber: 1,
    };
    const row = {
      attempt,
      result: {
        ...attempt,
        resultId: 'attempt-1:result',
        status: 'submitted',
      },
      completion: {
        ...attempt,
        completionId: 'attempt-1:completion',
        resultId: 'attempt-1:result',
        status: 'completed',
      },
      index: {
        ...attempt,
        resultId: 'attempt-1:result',
      },
    } as unknown as BookRuntimeTerminalTuple;

    expect(isCompleteTerminalForTarget(row, target(), 'student-1')).toBe(true);
  });

  it('resolves capture only from the live active binding and counts a terminal from its revoked predecessor', async () => {
    const fixture = stubProduction({ rows: [terminal()] });

    const resolved = await resolveBookIntegrityCaptureLaunch({
      env: productionEnv,
      target: target(),
      recipientId: 'student-1',
    });
    expect(fixture.resolveCurrent).toHaveBeenCalledOnce();
    expect(fixture.readAuthority).toHaveBeenCalledOnce();
    expect(fixture.readSaga).toHaveBeenCalledOnce();
    expect(fixture.listTerminalTuples).toHaveBeenCalledOnce();
    expect(resolved).toMatchObject({ enabled: true, captureAttemptNumber: 2 });

    vi.restoreAllMocks();
    const nextFixture = productionFixture();
    stubProduction({ binding: { ...nextFixture.binding, bindingId: 'different-live-binding' } });
    await expect(resolveBookIntegrityCaptureLaunch({
      env: productionEnv,
      target: target(),
      recipientId: 'student-1',
    })).resolves.toBeUndefined();
  });

  it('fails closed for pending recipient and stale publication or manifest authority', async () => {
    const fixture = productionFixture();
    const cases = [
      { saga: { ...fixture.saga, recipients: [{ ...fixture.saga.recipients[0], state: 'prepared' }] } },
      { authority: { ...fixture.authorityRecord, bookManifest: { ...fixture.authorityRecord.bookManifest, manifestVersionId: 'stale-manifest' } } },
      { authority: { ...fixture.authorityRecord, bookManifest: { ...fixture.authorityRecord.bookManifest, book: { ...fixture.binding.book, publicationRevision: 0 } } } },
    ];
    for (const update of cases) {
      stubProduction(update);
      await expect(resolveBookIntegrityCaptureLaunch({
        env: productionEnv, target: target(), recipientId: 'student-1',
      })).resolves.toBeUndefined();
      vi.restoreAllMocks();
    }
  });

  it('fails closed when a terminal tuple carries crossed internal provenance', async () => {
    for (const row of [
      (() => {
        const value = terminal();
        return { ...value, result: { ...value.result, resultId: 'crossed-result' } };
      })(),
      (() => {
        const value = terminal();
        return { ...value, result: { ...value.result, bindingId: 'crossed-binding' } };
      })(),
      (() => {
        const value = terminal();
        return { ...value, completion: { ...value.completion, activityVersionId: 'crossed-version' } };
      })(),
      (() => {
        const value = terminal();
        return { ...value, index: { ...value.index, attemptId: 'crossed-attempt' } };
      })(),
    ]) {
      stubProduction({ rows: [row] });
      await expect(resolveBookIntegrityCaptureLaunch({
        env: productionEnv, target: target(), recipientId: 'student-1',
      })).resolves.toBeUndefined();
      vi.restoreAllMocks();
    }
  });

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
