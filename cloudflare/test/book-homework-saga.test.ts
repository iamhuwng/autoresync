import { describe, expect, it } from 'vitest';
import {
  BOOK_HOMEWORK_ASSIGNMENT_KIND,
  BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  type BookHomeworkManifest,
} from '../../src/types/homework.types';
import type { BookHomeworkAuthoritySchedule } from '../../src/services/book-homework/bookHomeworkAuthority.types';
import {
  BookHomeworkAssignmentSaga,
  assertBookHomeworkSagaTransition,
  BookHomeworkSagaCrash,
  type BookHomeworkSagaDependencies,
} from '../src/upload-worker/book-homework/saga';
import {
  InMemoryBookHomeworkSagaRepository,
  FirebaseRestBookHomeworkSagaRepository,
  assertValidBookHomeworkSagaRecord,
} from '../src/upload-worker/book-homework/sagaRepository';
import {
  BookHomeworkAuthorityRepository,
  InMemoryBookHomeworkDocumentStore,
} from '../src/upload-worker/book-homework/repository';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import type { BookDeliveryPublishedPublicationReference } from '../../src/services/book-delivery/bookDelivery.publication';
import type { BookHomeworkSagaCanonicalState, BookHomeworkSagaCommand } from '../../src/services/book-homework/bookHomeworkSaga.types';
import fragment from '../src/upload-worker/book-rules/fragments/33C.json';

const createdAt = '2026-07-29T00:00:00.000Z';
const operationId = '00000000-0000-4000-8000-000000000001';

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const publication = (): BookDeliveryPublishedPublicationReference => ({
  bookId: 'book-1',
  bookMode: 'pdf',
  bookRevision: 2,
  publicationId: 'publication-1',
  publicationRevision: 4,
  publicationStatus: 'published',
  ownerId: 'teacher-1',
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
});

const manifest = (): BookHomeworkManifest => ({
  schemaVersion: BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  assignmentKind: BOOK_HOMEWORK_ASSIGNMENT_KIND,
  manifestVersionId: 'manifest-1',
  ownerId: 'teacher-1',
  createdByCommandId: 'manifest-command',
  createdAt,
  bindingRevision: 1,
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 2,
    publicationId: 'publication-1',
    publicationRevision: 4,
    publicationStatus: 'published',
  },
  context: {
    contextId: 'assignment-1',
    recipientId: 'student-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
  scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
  bindings: [{
    bindingId: 'activity-binding-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['group-1'],
    sourceReadiness: 'ready',
    state: 'required',
    activityVersion: 1,
    activityVersionId: 'activity-version-1',
    sourceContext: [{
      sourceKey: 'full',
      sourceVersionId: 'source-1',
      physicalPageNumbers: [1],
    }],
  }],
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: 1,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
});

const schedule: BookHomeworkAuthoritySchedule = {
  schemaVersion: 1,
  resolverVersion: 1,
  finalDueAt: '2026-08-30T00:00:00.000Z',
  scheduleRules: [{ nodeKey: 'unit-1', dueAt: '2026-08-20T00:00:00.000Z' }],
};

const canonical = (): BookHomeworkSagaCanonicalState => {
  const nextManifest = manifest();
  return {
    ownerId: 'teacher-1',
    manifest: nextManifest,
    schedule,
    recipientIds: ['student-1', 'student-2'],
    studentExtensions: {
      'student-2': [{ nodeKey: 'unit-1', dueAt: '2026-08-21T00:00:00.000Z' }],
    },
    publication: {
      bookId: 'book-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      manifestVersionId: 'manifest-1',
      fingerprint: 'publication-fingerprint-1',
    },
    deliveryPublication: publication(),
    sourceReadiness: 'ready',
    exposureApproval: { approved: true, fingerprint: 'exposure-fingerprint-1' },
    capabilities: { canAssignBookHomework: true },
    frozenPolicy: {
      policyId: 'policy-1',
      policyRevision: 1,
      fingerprint: 'policy-fingerprint-1',
      activityPolicies: {
        'placement-1': { lateSubmissionAllowed: false, maxAttempts: 2 },
      },
    },
  };
};

const command = (overrides: Partial<BookHomeworkSagaCommand> = {}): BookHomeworkSagaCommand => {
  const value = canonical();
  return {
    assignmentId: 'assignment-1',
    ownerId: 'teacher-1',
    operationId,
    idempotencyKey: 'idempotency-1',
    manifestVersionId: 'manifest-1',
    selectedRecipientIds: ['student-1', 'student-2'],
    expectedManifestFingerprint: stable(value.manifest),
    expectedPublicationFingerprint: value.publication.fingerprint,
    expectedExposureApprovalFingerprint: value.exposureApproval.fingerprint,
    expectedPolicyFingerprint: value.frozenPolicy.fingerprint,
    createdAt,
    ...overrides,
  };
};

const makeSaga = (
  canonicalState = canonical(),
  hooks?: BookHomeworkSagaDependencies['hooks'],
  resolveCanonical?: BookHomeworkSagaDependencies['resolveCanonical'],
) => {
  const sagaRepository = new InMemoryBookHomeworkSagaRepository();
  const authority = new BookHomeworkAuthorityRepository(new InMemoryBookHomeworkDocumentStore(), {
    resolveAffectedStudentStates: async () => ['not-started'],
    resolveCommittedRoot: async (record) => {
      const root = await sagaRepository.read(record.saga.sagaId);
      return root?.state === 'committed'
        && root.visibility === 'committed'
        && root.recipients.some((entry) => entry.authorityId === record.assignmentId
          && entry.recipientId === record.bookManifest.context.recipientId
          && entry.state === 'committed');
    },
  });
  const delivery = new InMemoryBookDeliveryRepository();
  const dependencies: BookHomeworkSagaDependencies = {
    sagaRepository,
    authorityRepository: authority,
    deliveryRepository: delivery,
    resolveCanonical: resolveCanonical ?? (async () => canonicalState),
    hooks,
  };
  return { saga: new BookHomeworkAssignmentSaga(dependencies), authority, delivery, repository: dependencies.sagaRepository };
};

const makeFirebase = () => {
  const values = new Map<string, unknown>();
  const versions = new Map<string, number>();
  const requests: Array<{ url: URL; headers: Headers }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init?.headers) });
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return new Response(JSON.stringify(values.get(path) ?? null), {
        status: 200,
        headers: { etag: `"${versions.get(path) ?? 0}"` },
      });
    }
    const expected = new Headers(init?.headers).get('if-match');
    if (expected !== `"${versions.get(path) ?? 0}"`) return new Response('', { status: 412 });
    values.set(path, JSON.parse(String(init?.body)));
    versions.set(path, (versions.get(path) ?? 0) + 1);
    return new Response('{}', { status: 200 });
  };
  return { values, requests, fetchImpl };
};

describe('Book Homework assignment saga', () => {
  it('fans out exact recipients, persists extensions, and commits one visibility gate', async () => {
    const { saga, authority, repository } = makeSaga();
    const result = await saga.execute(command());
    expect(result.status).toBe('committed');
    expect(result.record.visibility).toBe('committed');
    expect(result.record.recipients.map((entry) => entry.recipientId)).toEqual(['student-1', 'student-2']);
    expect((await saga.resolveStudentProjection('assignment-1', 'student-1'))?.delivery.record.status).toBe('active');
    expect((await saga.resolveStudentProjection('assignment-1', 'student-2'))?.authority?.studentExtensions['unit-1']?.dueAt).toBe('2026-08-21T00:00:00.000Z');
    const firstAuthorityId = result.record.recipients[0]?.authorityId;
    expect((await authority.read(firstAuthorityId as string))?.activityPolicies).toEqual({
      'placement-1': {
        schemaVersion: 1,
        policyId: 'policy-1',
        policyRevision: 1,
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
        activityVersion: 1,
        lateSubmissionAllowed: false,
        maxAttempts: 2,
      },
    });
    expect((await repository.read('assignment-1'))?.recipients.every((entry) => entry.state === 'committed')).toBe(true);
  });

  it('fails before fan-out when the frozen policy body is incomplete', async () => {
    const current = canonical();
    const { saga, repository } = makeSaga({
      ...current,
      frozenPolicy: { ...current.frozenPolicy, activityPolicies: {} },
    });
    await expect(saga.execute(command())).rejects.toMatchObject({ code: 'stale-policy' });
    await expect(repository.read('assignment-1')).resolves.toBeNull();
  });

  it('fails before fan-out when Delivery references a different frozen policy', async () => {
    const current = canonical();
    const { saga, repository } = makeSaga({
      ...current,
      deliveryPublication: {
        ...current.deliveryPublication,
        schedulePolicy: {
          ...current.deliveryPublication.schedulePolicy,
          policyRevision: current.frozenPolicy.policyRevision + 1,
        },
      },
    });
    await expect(saga.execute(command())).rejects.toMatchObject({ code: 'stale-publication' });
    await expect(repository.read('assignment-1')).resolves.toBeNull();
  });

  it('keeps all readers hidden during a crash and resumes missing fan-out work', async () => {
    let crashing = true;
    const { saga, authority, repository } = makeSaga(undefined, {
      beforeStep: (step, recipientId) => {
        if (crashing && step === 'delivery-prepare' && recipientId === 'student-2') {
          throw new BookHomeworkSagaCrash(step);
        }
      },
    });
    await expect(saga.execute(command())).rejects.toBeInstanceOf(BookHomeworkSagaCrash);
    expect((await repository.read('assignment-1'))?.state).toBe('fanout_pending');
    await expect(saga.resolveStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();
    const preparedRoot = await repository.read('assignment-1');
    const firstAuthorityId = preparedRoot?.recipients[0]?.authorityId;
    expect(firstAuthorityId).toBeDefined();
    await expect(authority.readStudentProjection(firstAuthorityId as string, 'student-1')).resolves.toBeNull();
    crashing = false;
    const resumed = await saga.execute(command());
    expect(resumed.status).toBe('committed');
    await expect(saga.resolveStudentProjection('assignment-1', 'student-2')).resolves.not.toBeNull();
  });

  it('serializes concurrent resumes and replays without duplicate records', async () => {
    const { saga, repository } = makeSaga();
    const results = await Promise.all([saga.execute(command()), saga.execute(command())]);
    expect(results[0].status).toBe('committed');
    expect(results[1].status).toBe('committed');
    expect((await repository.read('assignment-1'))?.recipients).toHaveLength(2);
  });

  it('revalidates canonical state before the root commit and replays terminal state after drift', async () => {
    const first = canonical();
    let current = first;
    let calls = 0;
    const resolveCanonical: BookHomeworkSagaDependencies['resolveCanonical'] = async () => {
      calls += 1;
      return current;
    };
    const { saga, repository } = makeSaga(first, undefined, resolveCanonical);
    const committed = await saga.execute(command());
    expect(committed.status).toBe('committed');
    current = {
      ...first,
      frozenPolicy: { ...first.frozenPolicy, fingerprint: 'policy-drifted' },
    };
    await expect(saga.execute(command())).resolves.toMatchObject({ status: 'committed' });
    await expect(saga.execute(command({ expectedPolicyFingerprint: 'policy-conflict' })))
      .rejects.toMatchObject({ code: 'idempotency-conflict' });
    expect(calls).toBe(2);
    expect((await repository.read('assignment-1'))?.state).toBe('committed');

    let changedCalls = 0;
    const changedResolver: BookHomeworkSagaDependencies['resolveCanonical'] = async () => {
      changedCalls += 1;
      return changedCalls === 1 ? first : {
        ...first,
        frozenPolicy: { ...first.frozenPolicy, fingerprint: 'policy-changed-during-fanout' },
      };
    };
    const blocked = makeSaga(first, undefined, changedResolver);
    const failed = await blocked.saga.execute(command({ assignmentId: 'assignment-2' }));
    expect(failed.status).toBe('failed_terminal');
    expect(failed.record.visibility).toBe('hidden');
  });

  it('uses Firebase RTDB ETag CAS and rejects scoped identity mismatch', async () => {
    const firebase = makeFirebase();
    expect(() => new FirebaseRestBookHomeworkSagaRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.iam.gserviceaccount.com',
      },
      fetchImpl: firebase.fetchImpl,
    })).toThrow('scoped_access_token');
    const repository = new FirebaseRestBookHomeworkSagaRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.iam.gserviceaccount.com',
      },
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    const record = {
      schemaVersion: 1 as const,
      assignmentId: 'assignment-firebase',
      operationId,
      idempotencyKey: 'idempotency-firebase',
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      contextId: 'assignment-firebase',
      fingerprint: 'fingerprint-firebase',
      requestFingerprint: 'request-fingerprint-firebase',
      state: 'prepared' as const,
      visibility: 'hidden' as const,
      recipients: [{ recipientId: 'student-1', authorityId: 'assignment-firebase--student-1--authority', bindingId: 'assignment-firebase--student-1--delivery', state: 'pending' as const }],
      recipientCount: 1,
      committedRecipientCount: 0,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    };
    await expect(repository.create(record)).resolves.toBe(true);
    expect(firebase.requests[0]?.url.searchParams.get('auth')).toBe('test-token');
    expect(firebase.requests[0]?.headers.has('authorization')).toBe(false);
    expect((firebase.values.get('book_homework/operations/assignment-firebase') as {
      recipients: Record<string, unknown>;
    }).recipients).toHaveProperty('student-1');
    await expect(repository.read(record.assignmentId)).resolves.toEqual(record);
    await expect(repository.create(record)).resolves.toBe(false);
    const next = { ...record, state: 'fanout_pending' as const, revision: 2 };
    await expect(repository.compareAndSet(next, 1)).resolves.toBe(true);
    await expect(repository.compareAndSet({ ...next, revision: 3 }, 1)).resolves.toBe(false);
    expect(() => new FirebaseRestBookHomeworkSagaRepository({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'expected@example.iam.gserviceaccount.com',
        BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'wrong@example.iam.gserviceaccount.com' }),
      },
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'test-token',
    })).toThrow('service_identity_mismatch');
  });

  it('rejects zero, duplicate, stale, unapproved, and unavailable commands before writes', async () => {
    const { saga, repository } = makeSaga();
    await expect(saga.execute(command({ selectedRecipientIds: [] }))).rejects.toMatchObject({ code: 'invalid-command' });
    await expect(saga.execute(command({ selectedRecipientIds: ['student-1', 'student-1'] }))).rejects.toMatchObject({ code: 'invalid-command' });
    await expect(saga.execute(command({ expectedPolicyFingerprint: 'changed' }))).rejects.toMatchObject({ code: 'stale-input' });
    const unapproved = {
      ...canonical(),
      exposureApproval: { approved: false, fingerprint: 'exposure-fingerprint-1' },
    };
    const blocked = makeSaga(unapproved);
    await expect(blocked.saga.execute(command())).rejects.toMatchObject({ code: 'not-ready' });
    expect(await repository.read('assignment-1')).toBeNull();
  });

  it('compensates invisible prepared state and retains any already-committed child', async () => {
    const { saga, repository, delivery } = makeSaga(undefined, {
      beforeStep: (step, recipientId) => {
        if (step === 'delivery-activate' && recipientId === 'student-2') throw new Error('simulated delivery failure');
      },
    });
    const result = await saga.execute(command());
    expect(result.status).toBe('failed_terminal');
    expect(result.record.visibility).toBe('hidden');
    expect(result.record.recipients.map((entry) => entry.state)).toEqual(['retained', 'compensated']);
    await expect(saga.resolveStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();
    expect((await repository.read('assignment-1'))?.state).toBe('failed_terminal');
    expect((await delivery.readBinding('assignment-1--student-2--delivery'))?.status).toBe('draft');
    expect(result.record.recipients[1].tombstonedAt).toBe(createdAt);
  });

  it('rejects malformed terminal visibility and keeps the 33C fragment service-only', () => {
    expect(() => assertBookHomeworkSagaTransition('committed', 'fanout_pending')).toThrow('committed cannot transition');
    expect(() => assertBookHomeworkSagaTransition('compensating', 'committed')).toThrow('compensating cannot transition');
    expect(() => assertValidBookHomeworkSagaRecord({
      schemaVersion: 1,
      assignmentId: 'assignment-1',
      operationId,
      idempotencyKey: 'idempotency-1',
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      contextId: 'assignment-1',
      fingerprint: 'fingerprint',
      requestFingerprint: 'request-fingerprint',
      state: 'committed',
      visibility: 'hidden',
       recipients: [{ recipientId: 'student-1', authorityId: 'assignment-1--student-1--authority', bindingId: 'assignment-1--student-1--delivery', state: 'committed' }],
      recipientCount: 1,
      committedRecipientCount: 1,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    })).toThrow('visibility');
    expect([...fragment.owner.generatedRuleLocations].sort()).toEqual(
      fragment.operations.map((operation) => `${operation.path}/${operation.rule}`).sort(),
    );
    const expressions = (fragment as { operations: readonly { expression: string }[] }).operations.map((operation) => operation.expression).join('\n');
    for (const operation of fragment.operations) {
      expect(operation.expression.match(/\(/g)?.length ?? 0)
        .toBe(operation.expression.match(/\)/g)?.length ?? 0);
    }
    expect(fragment.operations[0].expression).toBe('false');
    expect(fragment.operations[1].expression).toBe('false');
    expect(expressions).toContain('auth.token.book_homework_service == true');
    expect(expressions).toContain('auth.token.book_homework_ownerId');
    expect(expressions).toContain('!data.exists()');
    expect(expressions).toContain("newData.child('requestFingerprint').isString()");
    expect(expressions).not.toContain('numChildren');
    expect(expressions).toContain("newData.child('authorityId').val() == ($assignmentId + '--' + $recipientId + '--authority')");
    expect(expressions).toContain("newData.parent().parent().child('state').val() != 'committed'");
    expect(expressions).toContain('!newData.child(\'pdfBytes\').exists()');
    expect(expressions).toContain('!newData.child(\'privateObjectKey\').exists()');
    expect(expressions).toContain('false');
    expect(() => assertValidBookHomeworkSagaRecord({
      schemaVersion: 1,
      assignmentId: 'assignment-1',
      operationId,
      idempotencyKey: 'idempotency-1',
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      contextId: 'assignment-1',
      fingerprint: 'fingerprint',
      requestFingerprint: 'request-fingerprint',
      state: 'prepared',
      visibility: 'hidden',
      recipients: [{
        recipientId: 'student-1',
        authorityId: 'wrong-authority',
        bindingId: 'assignment-1--student-1--delivery',
        state: 'pending',
      }],
      recipientCount: 1,
      committedRecipientCount: 0,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    })).toThrow('deterministic_id');
  });
});
