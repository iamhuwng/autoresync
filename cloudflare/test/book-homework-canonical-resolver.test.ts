import { describe, expect, it } from 'vitest';
import type { BookDeliveryPublishedPublicationReference } from '../../src/services/book-delivery/bookDelivery.publication';
import type {
  BookHomeworkSagaCommand,
} from '../../src/services/book-homework/bookHomeworkSaga.types';
import {
  BookHomeworkCanonicalResolverError,
  createBookHomeworkCanonicalResolver,
} from '../src/upload-worker/book-homework/canonical-resolver';

const createdAt = '2026-08-01T00:00:00.000Z';

const publication = (revision = 4): BookDeliveryPublishedPublicationReference => ({
  bookId: 'book-vocab-u1-d43935c735245dc8',
  bookMode: 'pdf',
  bookRevision: 1,
  manifestVersionId: 'manifest-vocab-u1',
  publicationId: 'publication-vocab-u1',
  publicationRevision: revision,
  publicationStatus: 'published',
  ownerId: 'teacher-126',
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Vocabulary U1' }],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-u1',
    activityId: 'activity-u1',
    activityVersionId: 'activity-u1-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['pages-u1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'book-homework-policy', policyRevision: 1, basis: 'immutable-reference' },
});

const fingerprint = (value: unknown): string => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.schemaVersion === 1 && record.assignmentKind === 'book_activity_bundle') return 'manifest';
    if (record.approved === true) return 'exposure';
    if (record.policyId && record.activityPolicies && record.intent) return 'policy';
    if (record.bookMode === 'pdf' && record.placements) return 'publication';
  }
  return JSON.stringify(value);
};

const command = (overrides: Partial<BookHomeworkSagaCommand> = {}): BookHomeworkSagaCommand => ({
  assignmentId: 'assignment-126',
  ownerId: 'teacher-126',
  operationId: '00000000-0000-4000-8000-000000000126',
  idempotencyKey: 'idempotency-126',
  manifestVersionId: 'manifest-vocab-u1',
  selectedRecipientIds: ['student-126'],
  createdAt,
  intent: {
    bookId: 'book-vocab-u1-d43935c735245dc8',
    target: {
      kind: 'unit',
      bookId: 'book-vocab-u1-d43935c735245dc8',
      nodeKey: 'unit-1',
      classId: 'class-126',
    },
    schedule: {
      finalDueAt: '2026-08-20T00:00:00.000Z',
      nodeOverrides: [{ nodeKey: 'unit-1', dueAt: '2026-08-19T00:00:00.000Z' }],
    },
    policy: {
      intent: 'accountable',
      integrityCapture: true,
      integrityOverride: false,
      activityPolicies: [{
        placementId: 'placement-u1',
        maxAttempts: 2,
        feedbackRelease: 'after_completion',
        lateSubmissionAllowed: false,
      }],
    },
    expectedPublication: {
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
      manifestVersionId: 'manifest-vocab-u1',
    },
  },
  ...overrides,
});

const resolverFor = (
  loadTrustedPublication: (input: { command: BookHomeworkSagaCommand }) => Promise<BookDeliveryPublishedPublicationReference>,
) => createBookHomeworkCanonicalResolver({
  classReader: async () => ({
    classId: 'class-126',
    ownerId: 'teacher-126',
    status: 'active',
    students: [{ studentId: 'student-126', status: 'active' }],
  }),
  loadTrustedPublication: async ({ command: input }) => loadTrustedPublication({ command: input }),
  now: () => createdAt,
  fingerprint,
});

describe('Book Homework canonical resolver', () => {
  it('authorizes the #126 class path and builds a trusted one-student canonical state', async () => {
    const canonical = await resolverFor(async () => publication()).resolve(command());

    expect(canonical.ownerId).toBe('teacher-126');
    expect(canonical.recipientIds).toEqual(['student-126']);
    expect(canonical.manifest.book.publicationRevision).toBe(4);
    expect(canonical.manifest.bindings).toMatchObject([{
      placementId: 'placement-u1',
      activityVersionId: 'activity-u1-v1',
      sourceReadiness: 'ready',
      state: 'required',
    }]);
    expect(canonical.deliveryPublication).toEqual(publication());
    expect(canonical.capabilities.canAssignBookHomework).toBe(true);
  });

  it('rejects a recipient outside the active class roster', async () => {
    const resolver = resolverFor(async () => publication());
    await expect(resolver.resolve(command({ selectedRecipientIds: ['student-outside'] })))
      .rejects.toMatchObject({ code: 'unauthorized-recipient' });
  });

  it('rejects a stale published Delivery revision', async () => {
    const resolver = resolverFor(async () => publication(5));
    await expect(resolver.resolve(command())).rejects.toMatchObject({ code: 'stale-publication' });
  });

  it('rejects component PDF publications at the Book Homework authority boundary', async () => {
    const full = publication();
    const componentPublication: BookDeliveryPublishedPublicationReference = {
      ...full,
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [{
          sourceKey: 'component-a',
          sourceVersionId: 'source-v1',
          sourceOrder: 1,
          ownerNodeKey: 'unit-1',
          lifecycle: 'verified-usable',
          localPageScope: { kind: 'pages', pages: [1] },
        }],
      },
      placements: full.placements.map((placement) => ({
        ...placement,
        sourcePageScopes: [{ sourceKey: 'component-a', pages: [1] }],
      })),
    };
    const resolver = resolverFor(async () => componentPublication);
    await expect(resolver.resolve(command())).rejects.toMatchObject({
      code: 'not-ready',
      message: 'Book Homework requires one complete student-safe PDF source.',
    });
  });

  it('requires exactly one policy for every required Placement', async () => {
    const base = command();
    const resolver = resolverFor(async () => publication());
    await expect(resolver.resolve({
      ...base,
      intent: { ...base.intent, policy: { ...base.intent.policy, activityPolicies: [] } },
    })).rejects.toMatchObject({ code: 'stale-policy' });
  });

  it('rejects an extension for a non-selected student', async () => {
    const base = command();
    const resolver = resolverFor(async () => publication());
    await expect(resolver.resolve({
      ...base,
      intent: {
        ...base.intent,
        schedule: {
          ...base.intent.schedule,
          studentExtensions: [{ studentId: 'student-outside', nodeKey: 'unit-1', dueAt: '2026-08-21T00:00:00.000Z' }],
        },
      },
    })).rejects.toMatchObject({ code: 'invalid-extension' });
  });

  it('re-resolves to the same deterministic canonical state', async () => {
    const resolver = resolverFor(async () => publication());
    const first = await resolver.resolve(command());
    const second = await resolver.resolve(command());
    expect(second).toEqual(first);
    expect(second.publication.fingerprint).toBe(first.publication.fingerprint);
    expect(second.frozenPolicy.fingerprint).toBe(first.frozenPolicy.fingerprint);
  });

  it('uses typed resolver errors for stale checks', async () => {
    const resolver = resolverFor(async () => publication(5));
    try {
      await resolver.resolve(command());
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BookHomeworkCanonicalResolverError);
    }
  });
});
