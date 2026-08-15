import { describe, expect, it, vi } from 'vitest';
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
  type BookHomeworkSagaRepository,
} from '../src/upload-worker/book-homework/sagaRepository';
import {
  BookHomeworkAuthorityRepository,
  InMemoryBookHomeworkDocumentStore,
} from '../src/upload-worker/book-homework/repository';
import {
  BookHomeworkCompatibilityRepository,
  InMemoryBookHomeworkCompatibilityDocumentStore,
} from '../src/upload-worker/book-homework/compatibility-repository';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import type { BookDeliveryResolvedEntitlement } from '../../src/services/book-delivery/bookDelivery.entitlement';
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
  manifestVersionId: 'manifest-1',
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
    manifestVersionId: 'manifest-1',
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
    intent: {
      bookId: 'book-1',
      target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1', classId: 'class-1' },
      schedule: { finalDueAt: '2026-08-30T00:00:00.000Z', nodeOverrides: [] },
      policy: {
        intent: 'practice',
        integrityCapture: false,
        integrityOverride: false,
        activityPolicies: [{
          placementId: 'placement-1',
          maxAttempts: 2,
          feedbackRelease: 'immediate',
          lateSubmissionAllowed: false,
        }],
      },
      expectedPublication: { publicationId: 'publication-1', publicationRevision: 4, manifestVersionId: 'manifest-1' },
      presentation: { title: 'Book Homework', description: 'Complete the assigned Book activities.' },
    },
    selectedRecipientIds: ['student-1', 'student-2'],
    createdAt,
    ...overrides,
  };
};

const makeSaga = (
  canonicalState = canonical(),
  hooks?: BookHomeworkSagaDependencies['hooks'],
  resolveCanonical?: BookHomeworkSagaDependencies['resolveCanonical'],
  compatibilityRepository?: BookHomeworkSagaDependencies['compatibilityRepository'],
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
    compatibilityRepository,
    resolveCanonical: resolveCanonical ?? (async () => canonicalState),
    hooks,
  };
  return { saga: new BookHomeworkAssignmentSaga(dependencies), authority, delivery, repository: dependencies.sagaRepository };
};

class OwnerScopedSagaRepository implements BookHomeworkSagaRepository {
  constructor(
    private readonly delegate: BookHomeworkSagaRepository,
    private readonly events: string[],
  ) {}

  async read(assignmentId: string, ownerId?: string) {
    this.events.push(`saga:${ownerId ?? 'missing'}`);
    if (!ownerId) throw new Error('owner-required');
    return this.delegate.read(assignmentId, ownerId);
  }

  create(record: Parameters<BookHomeworkSagaRepository['create']>[0]) {
    return this.delegate.create(record);
  }

  compareAndSet(
    record: Parameters<BookHomeworkSagaRepository['compareAndSet']>[0],
    expectedRevision: Parameters<BookHomeworkSagaRepository['compareAndSet']>[1],
  ) {
    return this.delegate.compareAndSet(record, expectedRevision);
  }
}

class OrderedDeliveryRepository extends InMemoryBookDeliveryRepository {
  constructor(private readonly events: string[]) {
    super();
  }

  override async resolveCurrent(recipientId: string, contextId: string) {
    this.events.push('delivery');
    return super.resolveCurrent(recipientId, contextId);
  }
}

class FixedDeliveryRepository extends InMemoryBookDeliveryRepository {
  constructor(private readonly entitlement: BookDeliveryResolvedEntitlement | null) {
    super();
  }

  override async resolveCurrent(_recipientId: string, _contextId: string) {
    return this.entitlement;
  }
}

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
    const studentTwo = await saga.resolveStudentProjection('assignment-1', 'student-2');
    expect(studentTwo?.authority?.studentExtensions['unit-1']?.dueAt).toBe('2026-08-21T00:00:00.000Z');
    expect(studentTwo?.completionAuthority).toMatchObject({
      assignmentId: 'assignment-1',
      manifest: {
        ownerId: 'teacher-1',
        bindingRevision: 1,
        context: { contextId: 'assignment-1', recipientId: 'student-2' },
      },
    });
    const teacherRows = await saga.resolveTeacherProjections('assignment-1', 'teacher-1');
    expect(teacherRows?.map((row) => row.studentId)).toEqual(['student-1', 'student-2']);
    await expect(saga.resolveTeacherProjections('assignment-1', 'other-teacher')).resolves.toBeNull();
    const firstAuthorityId = result.record.recipients[0]?.authorityId;
    expect((await authority.read({
      authorityId: firstAuthorityId as string,
      assignmentId: 'assignment-1',
      ownerId: 'teacher-1',
    }))?.activityPolicies).toEqual({
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

  it('resolves the student projection from the Delivery owner before exposing authorities', async () => {
    const events: string[] = [];
    const baseRepository = new InMemoryBookHomeworkSagaRepository();
    const sagaRepository = new OwnerScopedSagaRepository(baseRepository, events);
    const authority = new BookHomeworkAuthorityRepository(new InMemoryBookHomeworkDocumentStore(), {
      resolveAffectedStudentStates: async () => ['not-started'],
      resolveCommittedRoot: async (record) => {
        const root = await baseRepository.read(record.saga.sagaId);
        return root?.state === 'committed'
          && root.visibility === 'committed'
          && root.recipients.some((entry) => entry.authorityId === record.assignmentId
            && entry.recipientId === record.bookManifest.context.recipientId
            && entry.state === 'committed');
      },
    });
    const delivery = new OrderedDeliveryRepository(events);
    const saga = new BookHomeworkAssignmentSaga({
      sagaRepository,
      authorityRepository: authority,
      deliveryRepository: delivery,
      resolveCanonical: async () => canonical(),
    });
    const committed = await saga.execute(command());
    expect(committed.status).toBe('committed');

    events.length = 0;
    const validDelivery = await delivery.resolveCurrent('student-1', 'assignment-1');
    expect(validDelivery).not.toBeNull();
    events.length = 0;
    const originalAuthorityRead = authority.read.bind(authority);
    const authorityRead = vi.spyOn(authority, 'read').mockImplementation(async (scope) => {
      events.push('authority');
      return originalAuthorityRead(scope);
    });
    const studentProjectionRead = vi.spyOn(authority, 'readStudentProjection');
    await expect(saga.resolveStudentProjection('assignment-1', 'student-1')).resolves.not.toBeNull();
    expect(events).toEqual(['delivery', 'saga:teacher-1', 'authority', 'authority']);
    expect(authorityRead).toHaveBeenCalledWith({
      authorityId: 'assignment-1--student-1--authority',
      assignmentId: 'assignment-1',
      ownerId: 'teacher-1',
    });

    if (!validDelivery) throw new Error('expected active Delivery');
    const binding = validDelivery.record.binding;
    const malformed = [
      {
        label: 'wrong issuer owner',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, issuer: { ...binding.issuer, ownerId: 'other-owner' } } },
        },
      },
      {
        label: 'missing issuer owner',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, issuer: { ...binding.issuer, ownerId: '' } } },
        },
      },
      {
        label: 'wrong context owner',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, context: { ...binding.context, ownerId: 'other-owner' } } },
        },
      },
      {
        label: 'missing context owner',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, context: { ...binding.context, ownerId: '' } } },
        },
      },
      {
        label: 'wrong context',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, context: { ...binding.context, contextId: 'other-assignment' } } },
        },
      },
      {
        label: 'wrong recipient',
        entitlement: {
          ...validDelivery,
          record: { ...validDelivery.record, binding: { ...binding, recipient: { ...binding.recipient, recipientId: 'other-student' } } },
        },
      },
    ] satisfies readonly { label: string; entitlement: BookDeliveryResolvedEntitlement }[];
    for (const candidate of malformed) {
      events.length = 0;
      authorityRead.mockClear();
      studentProjectionRead.mockClear();
      const malformedSaga = new BookHomeworkAssignmentSaga({
        sagaRepository,
        authorityRepository: authority,
        deliveryRepository: new FixedDeliveryRepository(candidate.entitlement),
        resolveCanonical: async () => canonical(),
      });
      await expect(malformedSaga.resolveStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();
      expect(authorityRead, candidate.label).not.toHaveBeenCalled();
      expect(studentProjectionRead, candidate.label).not.toHaveBeenCalled();
      expect(events, candidate.label).toEqual([]);
    }

    const teacherProjectionSaga = new BookHomeworkAssignmentSaga({
      sagaRepository,
      authorityRepository: authority,
      deliveryRepository: new FixedDeliveryRepository({
        ...validDelivery,
        record: {
          ...validDelivery.record,
          binding: { ...binding, issuer: { ...binding.issuer, ownerId: 'other-owner' } },
        },
      }),
      resolveCanonical: async () => canonical(),
    });
    await expect(teacherProjectionSaga.resolveTeacherProjections('assignment-1', 'teacher-1')).resolves.toBeNull();
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
    await expect(authority.readStudentProjection({
      authorityId: firstAuthorityId as string,
      assignmentId: 'assignment-1',
      ownerId: 'teacher-1',
    }, 'student-1')).resolves.toBeNull();
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

  it('commits the root before projection, reports pending, and repairs terminal replay without canonical reads', async () => {
    const projectionRepository = new BookHomeworkCompatibilityRepository(
      new InMemoryBookHomeworkCompatibilityDocumentStore(),
    );
    let failProjection = true;
    let canonicalReads = 0;
    const compatibilityRepository: NonNullable<BookHomeworkSagaDependencies['compatibilityRepository']> = {
      ensureCommittedProjection: async (input) => {
        if (failProjection) throw new Error('projection-unavailable');
        return projectionRepository.ensureCommittedProjection(input);
      },
      read: (assignmentId, ownerId) => projectionRepository.read(assignmentId, ownerId),
    };
    const { saga, repository } = makeSaga(
      canonical(),
      undefined,
      async () => {
        canonicalReads += 1;
        return canonical();
      },
      compatibilityRepository,
    );

    const pending = await saga.execute(command());
    expect(pending.status).toBe('committed_projection_pending');
    expect(pending.projectionDiagnostic).toEqual({
      stage: 'unknown',
      errorClass: 'unknown-projection-failure',
    });
    expect(pending.record.state).toBe('committed');
    expect(pending.record.visibility).toBe('committed');
    expect((await repository.read('assignment-1'))?.state).toBe('committed');
    await expect(projectionRepository.read('assignment-1', 'teacher-1')).resolves.toBeNull();

    failProjection = false;
    const replay = await saga.execute(command());
    expect(replay.status).toBe('committed');
    expect(canonicalReads).toBe(2);
    await expect(projectionRepository.read('assignment-1', 'teacher-1')).resolves.toMatchObject({
      assignmentKind: 'book_homework_compatibility',
      title: 'Book Homework',
      description: 'Complete the assigned Book activities.',
      bookHomeworkCompatibility: {
        assignmentId: 'assignment-1',
        sourceSagaRevision: pending.record.revision,
        sourceFingerprint: pending.record.fingerprint,
      },
    });
  });

  it('bounds the root fingerprint for oversized canonical input and detects drift while preserving replay', async () => {
    const oversized = {
      ...canonical(),
      studentExtensions: {
        'student-1': Array.from({ length: 200 }, () => ({
          nodeKey: 'unit-1',
          dueAt: '2026-08-21T00:00:00.000Z',
        })),
        'student-2': Array.from({ length: 200 }, () => ({
          nodeKey: 'unit-1',
          dueAt: '2026-08-21T00:00:00.000Z',
        })),
      },
    };
    let current = oversized;
    let crash = true;
    const { saga, repository } = makeSaga(current, {
      beforeStep: (step) => {
        if (crash && step === 'delivery-prepare') throw new BookHomeworkSagaCrash(step);
      },
    }, async () => current);

    await expect(saga.execute(command())).rejects.toBeInstanceOf(BookHomeworkSagaCrash);
    const prepared = await repository.read('assignment-1');
    expect(prepared?.fingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/u);
    expect(prepared?.fingerprint.length).toBeLessThanOrEqual(8192);
    expect(prepared?.requestFingerprint.length).toBeGreaterThan(0);

    current = {
      ...oversized,
      studentExtensions: {
        ...oversized.studentExtensions,
        'student-2': [
          ...oversized.studentExtensions['student-2'].slice(0, -1),
          { nodeKey: 'unit-1', dueAt: '2026-08-22T00:00:00.000Z' },
        ],
      },
    };
    const driftHarness = makeSaga(current, {
      beforeStep: (step) => {
        if (step === 'delivery-prepare') throw new BookHomeworkSagaCrash(step);
      },
    }, async () => current);
    await expect(driftHarness.saga.execute(command())).rejects.toBeInstanceOf(BookHomeworkSagaCrash);
    expect((await driftHarness.repository.read('assignment-1'))?.fingerprint)
      .not.toBe(prepared?.fingerprint);

    crash = false;
    await expect(saga.execute(command())).rejects.toMatchObject({ code: 'idempotency-conflict' });

    current = oversized;
    await expect(saga.execute(command())).resolves.toMatchObject({ status: 'committed' });
    await expect(saga.execute(command())).resolves.toMatchObject({ status: 'committed' });
    expect((await repository.read('assignment-1'))?.fingerprint).toBe(prepared?.fingerprint);
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
    await expect(saga.execute(command({ idempotencyKey: 'policy-conflict' })))
      .rejects.toMatchObject({ code: 'idempotency-conflict' });
    expect(calls).toBe(2);
    expect((await repository.read('assignment-1'))?.state).toBe('committed');

    let changedCalls = 0;
    const assignmentTwo = {
      ...first,
      manifest: {
        ...first.manifest,
        context: { ...first.manifest.context, contextId: 'assignment-2' },
      },
    };
    const assignmentTwoResolver: BookHomeworkSagaDependencies['resolveCanonical'] = async () => {
      changedCalls += 1;
      return changedCalls === 1 ? assignmentTwo : {
        ...assignmentTwo,
        frozenPolicy: {
          ...assignmentTwo.frozenPolicy,
          fingerprint: 'policy-changed-during-fanout',
        },
      };
    };
    const blocked = makeSaga(assignmentTwo, undefined, assignmentTwoResolver);
    const failed = await blocked.saga.execute(command({
      assignmentId: 'assignment-2',
    }));
    expect(failed.status).toBe('compensated');
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
    })).toThrow('missing_book_homework_google_sa_key');
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
      presentation: { title: 'Book Homework' },
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
    const unapproved = {
      ...canonical(),
      exposureApproval: { approved: false, fingerprint: 'exposure-fingerprint-1' },
    };
    const blocked = makeSaga(unapproved);
    await expect(blocked.saga.execute(command())).rejects.toMatchObject({ code: 'not-ready' });
    expect(await repository.read('assignment-1')).toBeNull();
  });

  it('compensates invisible prepared state including any already-committed child', async () => {
    const { saga, repository, delivery } = makeSaga(undefined, {
      beforeStep: (step, recipientId) => {
        if (step === 'delivery-activate' && recipientId === 'student-2') throw new Error('simulated delivery failure');
      },
    });
    const result = await saga.execute(command());
    expect(result.status).toBe('compensated');
    expect(result.record.visibility).toBe('hidden');
    expect(result.record.recipients.map((entry) => entry.state)).toEqual(['compensated', 'compensated']);
    await expect(saga.resolveStudentProjection('assignment-1', 'student-1')).resolves.toBeNull();
    expect((await repository.read('assignment-1'))?.state).toBe('compensated');
    expect((await delivery.readBinding('assignment-1--student-1--delivery'))?.status).toBe('revoked');
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
      presentation: { title: 'Book Homework' },
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
    expect(expressions).toContain("newData.child('contextId').val() == $assignmentId");
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
      presentation: { title: 'Book Homework' },
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
