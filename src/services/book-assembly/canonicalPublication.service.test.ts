import { describe, expect, it } from 'vitest';

import type { EditableActivity } from '../../types/bookActivity.types';
import type {
  BookAssemblyActivityVersionReference,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationAdapterPlan,
} from '../../types/bookAssembly.types';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import {
  createCanonicalActivityVersionFingerprint,
  type CanonicalPublishedActivityVersionRecord,
} from './canonicalActivityVersion.service';
import {
  createCanonicalBookAssemblyPublicationService,
  type CanonicalPublishBookAssemblyInput,
} from './canonicalPublication.service';
import {
  InMemoryCanonicalActivityVersionRepository,
} from './canonicalPublicationRepository';
import {
  bookAssemblyActivityVersionScopeKey,
  type BookAssemblyPublicationResult,
} from './publicationTransaction.service';
import {
  InMemoryBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepository,
  type BookAssemblyPublicationScope,
} from './publicationRepository';

const NOW = '2026-07-30T00:00:00.000Z';
const op = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const sourcePage = {
  sourceKey: 'full',
  sourceVersionId: 'source-1',
  physicalPageNumber: 1,
} as const;

const manifest = (activityKey: string): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-1',
      sourceOrder: 1,
    }],
  },
  nodes: [
    {
      nodeKey: 'root',
      parentNodeKey: null,
      nodeType: 'section',
      order: 1,
    },
    {
      nodeKey: 'unit-1',
      parentNodeKey: 'root',
      nodeType: 'unit',
      order: 1,
    },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey,
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-1'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      activityKeys: [activityKey],
      mode: 'activity',
    }],
  }],
});

const editableActivity = (title: string): EditableActivity => ({
  schemaVersion: 1,
  title,
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose one answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: {
    defaultPoints: 1,
    normalization: 'exact',
    requiredSelectionCount: 1,
  },
  interactions: [{
    prompt: 'Which answer is correct?',
    options: ['A', 'B'],
    acceptedOptionIndexes: [0],
  }],
  scoring: { mode: 'auto-where-possible' },
});

const withFingerprint = (
  record: Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'>,
): CanonicalPublishedActivityVersionRecord => ({
  ...record,
  payloadFingerprint: createCanonicalActivityVersionFingerprint(record),
});

interface PublicationIdentity {
  readonly operationId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly activityId: string;
}

const canonicalRecord = (
  identity: PublicationIdentity,
  title = `Activity for ${identity.publicationId}`,
): CanonicalPublishedActivityVersionRecord => {
  let nextId = 0;
  const activity = normalizeActivity(editableActivity(title), {
    createId: () => `${identity.activityId}-id-${++nextId}`,
  });
  return withFingerprint({
    schemaVersion: 1,
    lifecycle: 'published',
    activityId: identity.activityId,
    activityVersionId: `${identity.publicationId}:${identity.activityId}:v1`,
    activityVersion: 1,
    ownerId: 'teacher-1',
    activity,
    projection: projectStudentActivity(activity),
    placementIds: [`${identity.publicationId}:placement-1`],
    evidenceRefs: [`source:full:page:${sourcePage.physicalPageNumber}`],
    sourceContextFingerprint: null,
    createdByOperationId: identity.operationId,
    publishedAt: NOW,
    provenance: {
      kind: 'initial-book-publication',
      bookId: 'book-1',
      manifestVersionId: `manifest-v${identity.publicationRevision}`,
      publicationId: identity.publicationId,
      publicationRevision: identity.publicationRevision,
      unitKey: 'unit-1',
      activityKey: identity.activityId,
      sourcePages: [sourcePage],
    },
  });
};

const rewriteCanonicalRecord = (
  record: CanonicalPublishedActivityVersionRecord,
  overrides: Partial<Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'>>,
): CanonicalPublishedActivityVersionRecord => {
  const {
    payloadFingerprint: _payloadFingerprint,
    ...withoutFingerprint
  } = record;
  return withFingerprint({ ...withoutFingerprint, ...overrides });
};

interface PlanOptions extends PublicationIdentity {
  readonly canonical: CanonicalPublishedActivityVersionRecord;
  readonly mode: 'fresh' | 'reference';
  readonly referenceOverrides?: Partial<BookAssemblyActivityVersionReference>;
  readonly includeReferenceFingerprint?: boolean;
}

const plan = (options: PlanOptions): BookAssemblyPublicationAdapterPlan => {
  const body = manifest(options.activityId);
  const activityVersionId = options.canonical.activityVersionId;
  const placementId = `${options.publicationId}:placement-1`;
  const projectionId = `${options.publicationId}:${options.activityId}:safe`;
  const unitProjectionId = `${options.publicationId}:unit-1`;
  const reference: BookAssemblyActivityVersionReference = {
    activityVersionId,
    activityId: options.canonical.activityId,
    activityVersion: options.canonical.activityVersion,
    ...(options.includeReferenceFingerprint === false
      ? {}
      : { canonicalPayloadFingerprint: options.canonical.payloadFingerprint }),
    ...options.referenceOverrides,
  };
  return {
    strategy: 'full_pdf',
    planId: `plan-${options.publicationId}`,
    adapterTicket: 'fixture',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    candidateId: `candidate-${options.publicationRevision}`,
    candidateRevision: options.publicationRevision,
    bookRevision: options.publicationRevision + 3,
    sourceSetRevision: 2,
    sourceSet: body.sourceSet,
    manifest: body,
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: 'book-1',
      publicationId: options.publicationId,
      publicationRevision: options.publicationRevision,
      sourceStrategy: 'full_pdf',
      sourceSet: body.sourceSet,
      units: body.units,
    },
    atomicWrites: {
      activityVersions: options.mode === 'fresh' ? [{
        schemaVersion: 1,
        activityId: options.canonical.activityId,
        activityVersionId,
        activityVersion: options.canonical.activityVersion,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        manifestVersionId: `manifest-v${options.publicationRevision}`,
        publicationId: options.publicationId,
        publicationRevision: options.publicationRevision,
        unitKey: 'unit-1',
        activityKey: options.activityId,
        createdByCommandId: options.operationId,
        createdAt: NOW,
        sourcePages: [sourcePage],
        canonicalPayloadFingerprint: options.canonical.payloadFingerprint,
        payloadFingerprint: `mapping-${options.publicationId}`,
      }] : [],
      ...(options.mode === 'reference'
        ? { activityVersionRefs: [reference] }
        : {}),
      activitySafeProjections: [{
        schemaVersion: 1,
        projectionId,
        activityId: options.canonical.activityId,
        activityVersionId,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        manifestVersionId: `manifest-v${options.publicationRevision}`,
        publicationId: options.publicationId,
        publicationRevision: options.publicationRevision,
        placementIds: [placementId],
        sourcePages: [sourcePage],
        payloadFingerprint: `safe-${options.publicationId}`,
      }],
      placements: [{
        schemaVersion: 1,
        placementId,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        manifestVersionId: `manifest-v${options.publicationRevision}`,
        publicationId: options.publicationId,
        publicationRevision: options.publicationRevision,
        unitKey: 'unit-1',
        nodeKey: 'unit-1',
        activityKey: options.activityId,
        activityId: options.canonical.activityId,
        activityVersionId,
        order: 1,
        pageGroupKeys: ['pages-1'],
        sourcePages: [sourcePage],
      }],
      unitProjections: [{
        schemaVersion: 1,
        unitProjectionId,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        manifestVersionId: `manifest-v${options.publicationRevision}`,
        publicationId: options.publicationId,
        publicationRevision: options.publicationRevision,
        unitKey: 'unit-1',
        placementIds: [placementId],
        sourcePages: [sourcePage],
        createdByCommandId: options.operationId,
        createdAt: NOW,
      }],
      deliveryPlans: [{
        schemaVersion: 1,
        deliveryPlanId: `${options.publicationId}:delivery`,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        manifestVersionId: `manifest-v${options.publicationRevision}`,
        publicationId: options.publicationId,
        publicationRevision: options.publicationRevision,
        sourceStrategy: 'full_pdf',
        sourceSet: body.sourceSet,
        placementIds: [placementId],
        unitProjectionIds: [unitProjectionId],
        createdByCommandId: options.operationId,
        createdAt: NOW,
      }],
    },
  };
};

interface FreshInputOptions extends PublicationIdentity {
  readonly expectedCurrentPublicationId: string | null;
  readonly title?: string;
}

const freshInput = (
  options: FreshInputOptions,
): CanonicalPublishBookAssemblyInput => {
  const canonical = canonicalRecord(options, options.title);
  return {
    operationId: options.operationId,
    expectedCurrentPublicationId: options.expectedCurrentPublicationId,
    manifestVersionId: `manifest-v${options.publicationRevision}`,
    publicationId: options.publicationId,
    publicationRevision: options.publicationRevision,
    plan: plan({ ...options, canonical, mode: 'fresh' }),
    canonicalActivityVersions: [canonical],
    now: NOW,
  };
};

interface ReferenceInputOptions {
  readonly operationId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly expectedCurrentPublicationId: string;
  readonly referenceOverrides?: Partial<BookAssemblyActivityVersionReference>;
  readonly includeReferenceFingerprint?: boolean;
}

const referenceInput = (
  canonical: CanonicalPublishedActivityVersionRecord,
  options: ReferenceInputOptions,
): CanonicalPublishBookAssemblyInput => {
  const identity = {
    operationId: options.operationId,
    publicationId: options.publicationId,
    publicationRevision: options.publicationRevision,
    activityId: canonical.activityId,
  };
  return {
    operationId: options.operationId,
    expectedCurrentPublicationId: options.expectedCurrentPublicationId,
    manifestVersionId: `manifest-v${options.publicationRevision}`,
    publicationId: options.publicationId,
    publicationRevision: options.publicationRevision,
    plan: plan({
      ...identity,
      canonical,
      mode: 'reference',
      referenceOverrides: options.referenceOverrides,
      includeReferenceFingerprint: options.includeReferenceFingerprint,
    }),
    canonicalActivityVersions: [],
    now: NOW,
  };
};

const referenceOf = (
  record: CanonicalPublishedActivityVersionRecord,
): BookAssemblyActivityVersionReference => ({
  activityId: record.activityId,
  activityVersionId: record.activityVersionId,
  activityVersion: record.activityVersion,
  canonicalPayloadFingerprint: record.payloadFingerprint,
});

class FailFirstTransactionRepository
implements BookAssemblyPublicationRepository<BookAssemblyPublicationResult> {
  private failNext = true;

  constructor(
    private readonly inner:
    InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>,
  ) {}

  readScope(
    bookId: string,
  ): Promise<BookAssemblyPublicationScope<BookAssemblyPublicationResult>> {
    return this.inner.readScope(bookId);
  }

  async transaction<T>(
    bookId: string,
    mutate: (
      current: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
    ) => {
      readonly outcome: T;
      readonly next?: BookAssemblyPublicationScope<BookAssemblyPublicationResult>;
      readonly write: boolean;
    },
  ): Promise<T> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated-book-transaction-unavailable');
    }
    return this.inner.transaction(bookId, mutate);
  }
}

const firstPublication = (): CanonicalPublishBookAssemblyInput => freshInput({
  operationId: op('1'),
  publicationId: 'publication-1',
  publicationRevision: 1,
  activityId: 'activity-1',
  expectedCurrentPublicationId: null,
});

describe('canonical Book Assembly publication service', () => {
  it('prepares a valid canonical Activity Version and commits the Book publication', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    const input = firstPublication();
    const record = input.canonicalActivityVersions[0]!;

    await expect(service.publish(input)).resolves.toMatchObject({
      status: 'published',
      pointer: {
        publicationId: 'publication-1',
        manifestVersionId: 'manifest-v1',
      },
    });

    await expect(canonical.readPrepared(referenceOf(record))).resolves.toEqual(record);
    const scope = await books.readScope('book-1');
    expect(scope.current?.publicationId).toBe('publication-1');
    expect(scope.activityVersions?.[
      bookAssemblyActivityVersionScopeKey('manifest-v1', record.activityVersionId)
    ])
      .toMatchObject({
        activityVersionId: record.activityVersionId,
        canonicalPayloadFingerprint: record.payloadFingerprint,
      });
  });

  it('keeps the canonical record prepared while a stale Book CAS leaves the pointer unchanged', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    await service.publish(firstPublication());
    const stale = freshInput({
      operationId: op('2'),
      publicationId: 'publication-2',
      publicationRevision: 2,
      activityId: 'activity-2',
      expectedCurrentPublicationId: null,
    });
    const prepared = stale.canonicalActivityVersions[0]!;

    await expect(service.publish(stale)).resolves.toEqual({
      status: 'conflict',
      failureCode: 'stale-current-pointer',
    });

    await expect(canonical.readPrepared(referenceOf(prepared)))
      .resolves.toEqual(prepared);
    const scope = await books.readScope('book-1');
    expect(scope.current?.publicationId).toBe('publication-1');
    expect(scope.versions).not.toHaveProperty('manifest-v2');
    expect(scope.activityVersions).not.toHaveProperty(prepared.activityVersionId);
  });

  it('retries the same command after canonical preparation is replayed', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const failingBooks = new FailFirstTransactionRepository(books);
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(
      failingBooks,
      canonical,
    );
    const input = firstPublication();
    const record = input.canonicalActivityVersions[0]!;

    await expect(service.publish(input))
      .rejects.toThrow('simulated-book-transaction-unavailable');
    const prepared = await canonical.readPrepared(referenceOf(record));
    expect(prepared).not.toBeNull();
    await expect(canonical.prepare(prepared!))
      .resolves.toEqual({ status: 'replayed' });
    await expect(books.readScope('book-1')).resolves.toEqual({});

    await expect(service.publish(input)).resolves.toMatchObject({
      status: 'published',
      pointer: { publicationId: 'publication-1' },
    });
    await expect(canonical.readPrepared(referenceOf(record))).resolves.toEqual(record);
  });

  it('rejects a different canonical payload under the same immutable identity', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    const original = firstPublication();
    await service.publish(original);
    const before = await books.readScope('book-1');
    const conflicting = freshInput({
      operationId: op('1'),
      publicationId: 'publication-1',
      publicationRevision: 1,
      activityId: 'activity-1',
      expectedCurrentPublicationId: null,
      title: 'Changed payload under the same immutable ID',
    });

    await expect(service.publish(conflicting)).resolves.toEqual({
      status: 'conflict',
      failureCode: 'duplicate-version',
    });

    await expect(books.readScope('book-1')).resolves.toEqual(before);
    await expect(canonical.readPrepared(referenceOf(
      original.canonicalActivityVersions[0]!,
    ))).resolves.toEqual(original.canonicalActivityVersions[0]);
  });

  it('rejects missing or mismatched canonical records before Book mutation', async () => {
    const valid = firstPublication();
    const validRecord = valid.canonicalActivityVersions[0]!;
    const mismatched = rewriteCanonicalRecord(validRecord, {
      ownerId: 'teacher-2',
    });
    const cases: readonly CanonicalPublishedActivityVersionRecord[][] = [
      [],
      [mismatched],
    ];

    for (const canonicalActivityVersions of cases) {
      const books =
        new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
      const canonical = new InMemoryCanonicalActivityVersionRepository();
      const service = createCanonicalBookAssemblyPublicationService(books, canonical);

      await expect(service.publish({
        ...valid,
        canonicalActivityVersions,
      })).resolves.toEqual({
        status: 'invalid',
        failureCode: 'invalid-publication-plan',
      });
      await expect(books.readScope('book-1')).resolves.toEqual({});
      await expect(canonical.readPrepared(referenceOf(
        canonicalActivityVersions[0] ?? validRecord,
      ))).resolves.toBeNull();
    }
  });

  it('accepts an exact reusable canonical reference', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    const initial = firstPublication();
    await service.publish(initial);
    const record = initial.canonicalActivityVersions[0]!;
    const reuse = referenceInput(record, {
      operationId: op('2'),
      publicationId: 'publication-2',
      publicationRevision: 2,
      expectedCurrentPublicationId: 'publication-1',
    });

    await expect(service.publish(reuse)).resolves.toMatchObject({
      status: 'published',
      pointer: {
        publicationId: 'publication-2',
        manifestVersionId: 'manifest-v2',
      },
    });

    const scope = await books.readScope('book-1');
    expect(Object.keys(scope.activityVersions ?? {})).toEqual([
      bookAssemblyActivityVersionScopeKey('manifest-v1', record.activityVersionId),
      bookAssemblyActivityVersionScopeKey('manifest-v2', record.activityVersionId),
    ]);
    await expect(canonical.readPrepared(referenceOf(record))).resolves.toEqual(record);
  });

  it.each([
    'missing canonical record',
    'missing reference fingerprint',
    'wrong canonical owner',
    'wrong canonical version',
  ] as const)('denies a reusable reference with %s before Book mutation', async (scenario) => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const seedCanonical = new InMemoryCanonicalActivityVersionRepository();
    const seedService = createCanonicalBookAssemblyPublicationService(
      books,
      seedCanonical,
    );
    const initial = firstPublication();
    await seedService.publish(initial);
    const record = initial.canonicalActivityVersions[0]!;
    const before = await books.readScope('book-1');
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    let referenceOverrides:
    Partial<BookAssemblyActivityVersionReference> | undefined;
    let includeReferenceFingerprint = true;

    if (scenario === 'missing reference fingerprint') {
      await canonical.prepare(record);
      includeReferenceFingerprint = false;
    } else if (scenario === 'wrong canonical owner') {
      await canonical.prepare(rewriteCanonicalRecord(record, {
        ownerId: 'teacher-2',
      }));
      includeReferenceFingerprint = false;
    } else if (scenario === 'wrong canonical version') {
      await canonical.prepare(record);
      referenceOverrides = { activityVersion: 2 };
      includeReferenceFingerprint = false;
    }

    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    const reuse = referenceInput(record, {
      operationId: op('2'),
      publicationId: 'publication-2',
      publicationRevision: 2,
      expectedCurrentPublicationId: 'publication-1',
      referenceOverrides,
      includeReferenceFingerprint,
    });

    await expect(service.publish(reuse)).resolves.toEqual({
      status: 'invalid',
      failureCode: 'invalid-publication-plan',
    });
    await expect(books.readScope('book-1')).resolves.toEqual(before);
  });

  it('delegates rollback without rewriting or deleting canonical versions', async () => {
    const books =
      new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const canonical = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(books, canonical);
    const first = firstPublication();
    const second = freshInput({
      operationId: op('2'),
      publicationId: 'publication-2',
      publicationRevision: 2,
      activityId: 'activity-2',
      expectedCurrentPublicationId: 'publication-1',
    });
    await service.publish(first);
    await service.publish(second);
    const firstRecord = first.canonicalActivityVersions[0]!;
    const secondRecord = second.canonicalActivityVersions[0]!;

    const result = await service.rollback({
      operationId: op('3'),
      ownerId: 'teacher-1',
      bookId: 'book-1',
      expectedCurrentPublicationId: 'publication-2',
      targetPublicationId: 'publication-1',
      now: NOW,
    });

    expect(result).toMatchObject({
      status: 'rolled-back',
      pointer: {
        publicationId: 'publication-1',
        manifestVersionId: 'manifest-v1',
      },
    });
    await expect(canonical.readPrepared(referenceOf(firstRecord)))
      .resolves.toEqual(firstRecord);
    await expect(canonical.readPrepared(referenceOf(secondRecord)))
      .resolves.toEqual(secondRecord);
    const scope = await books.readScope('book-1');
    expect(scope.current?.publicationId).toBe('publication-1');
    expect(Object.keys(scope.versions ?? {}).sort())
      .toEqual(['manifest-v1', 'manifest-v2']);
    expect(Object.keys(scope.activityVersions ?? {}).sort())
      .toEqual([
        bookAssemblyActivityVersionScopeKey('manifest-v1', firstRecord.activityVersionId),
        bookAssemblyActivityVersionScopeKey('manifest-v2', secondRecord.activityVersionId),
      ].sort());
  });
});
