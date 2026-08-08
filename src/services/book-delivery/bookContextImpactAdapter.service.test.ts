import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_CLASS_IMPACT_ADAPTER_DECLARATION,
  createBookClassImpactAdapter,
} from './bookClassImpactAdapter.service';
import {
  BOOK_COURSE_IMPACT_ADAPTER_DECLARATION,
  createBookCourseImpactAdapter,
} from './bookCourseImpactAdapter.service';
import {
  BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION,
  createBookPublicImpactAdapter,
} from './bookPublicImpactAdapter.service';
import { createBookHomeworkImpactAdapter } from './bookHomeworkImpactAdapter.service';
import { createBookSoloImpactAdapter } from './bookSoloImpactAdapter.service';
import type {
  BookImpactContextInput,
  BookImpactCourseContextInput,
  BookImpactClassContextInput,
  BookImpactPublicReferenceContextInput,
  BookImpactDiscoveryAuthorizationResult,
  BookImpactDiscoveryContextKind,
  BookImpactDiscoveryReadPage,
} from './bookImpactDiscovery.types';

const query = { actorId: 'teacher-1', evaluatedAt: '2026-08-05T00:00:00.000Z' };

const classification = () => ({
  primaryEffect: 'display-only' as const,
  effects: ['display-only' as const],
  reasons: ['title'],
  activityDiff: { classification: 'display-only' as const, reasons: [], requiresRedo: false },
  requiresRedo: false,
  requiresRegrade: false,
  requiresExplicitContextResolution: false,
  requiresSuccessor: false,
});

const identity = (kind: 'course' | 'class' | 'public-reference') => {
  if (kind === 'course') return {
    kind, courseId: 'course-1', moduleId: 'module-1', courseMaterialId: 'material-1',
    unitStableKey: 'unit-1', unitVersionId: 'unit-version-1', sourceVersionId: 'source-v1',
    manifestVersionId: 'manifest-v1', bookId: 'book-1', bookRevision: 1,
    publicationId: 'publication-1', publicationRevision: 1, placementRevision: 3,
    bindingId: 'binding-1', bindingRevision: 7,
  } as const;
  if (kind === 'class') return {
    kind, classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
    classCourseMaterialId: 'class-material-1', sourceCourseMaterialId: 'material-1',
    sourcePlacementRevision: 3, unitStableKey: 'unit-1', unitVersionId: 'unit-version-1',
    sourceVersionId: 'source-v1', manifestVersionId: 'manifest-v1', bookId: 'book-1',
    bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1,
    deliveryBindingRevision: 7, bindingId: 'binding-1',
  } as const;
  return {
    kind, referenceKind: 'fork' as const, referenceId: 'reference-1', referenceRevision: 2,
    sourceBookId: 'source-book-1', sourceBookRevision: 5,
    sourcePublicationId: 'source-publication-1', sourcePublicationRevision: 5,
    targetBookId: 'book-1', targetBookRevision: 1,
    targetPublicationId: 'publication-1', targetPublicationRevision: 1,
    targetPlacementId: 'target-placement-1', targetPlacementRevision: 3,
    downstreamOwnerId: 'teacher-1', provenanceId: 'provenance-1', provenanceRevision: 2,
    bindingId: 'binding-1', bindingRevision: 7,
  } as const;
};

const context = (
  kind: 'course' | 'class' | 'public-reference',
  overrides: Partial<BookImpactContextInput> = {},
): BookImpactContextInput => ({
  contextId: `${kind}-context-1`, kind, ownerId: 'teacher-1', recipientId: 'student-1',
  bindingId: 'binding-1', bindingRevision: 7, status: 'active', lifecycle: 'not-started',
  bookId: 'book-1', bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1,
  effectiveWindow: null,
  placements: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1',
    activityVersion: 1, nodeKey: 'unit-1', order: 0, effectiveWindow: null,
    sourceRefs: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', availability: 'available', pages: [1] }],
  }],
  attempts: [],
  sources: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', availability: 'available', pages: [1] }],
  classification: classification(), replacement: [], observedAt: '2026-08-04T00:00:00.000Z',
  identity: identity(kind), ...overrides,
});

const reader = (
  kind: BookImpactDiscoveryContextKind,
  contexts: readonly unknown[],
  options: { readonly authorization?: BookImpactDiscoveryAuthorizationResult; readonly complete?: boolean } = {},
) => {
  const authorize = vi.fn(async (): Promise<BookImpactDiscoveryAuthorizationResult> => (
    options.authorization ?? {
      authorized: true as const, actorId: 'teacher-1', contextKind: kind,
      ownerScope: kind === 'course' ? 'teacher-owned-course' as const
        : kind === 'class' ? 'teacher-owned-class' as const
          : 'downstream-owner-public-reference' as const,
      maxContexts: 100,
    }
  ));
  const readOwnedContexts = vi.fn(async (): Promise<BookImpactDiscoveryReadPage> => ({
    complete: options.complete ?? true,
    contexts,
  } as BookImpactDiscoveryReadPage));
  return { authorize, readOwnedContexts };
};

describe('canonical Course/Class/public Book impact adapters', () => {
  it('ties required producer identity to the static context discriminator', () => {
    const course: BookImpactCourseContextInput = context('course') as BookImpactCourseContextInput;
    const classRecord: BookImpactClassContextInput = context('class') as BookImpactClassContextInput;
    const publicRecord: BookImpactPublicReferenceContextInput = (
      context('public-reference') as BookImpactPublicReferenceContextInput
    );
    expect([course.identity.kind, classRecord.identity.kind, publicRecord.identity.kind]).toEqual([
      'course', 'class', 'public-reference',
    ]);

    // @ts-expect-error A Course context cannot use a Class producer identity.
    const wrongCourseIdentity: BookImpactCourseContextInput = {
      ...course,
      identity: identity('class'),
    };
    // @ts-expect-error A public-reference context cannot omit its identity.
    const missingPublicIdentity: BookImpactPublicReferenceContextInput = {
      ...publicRecord,
      identity: undefined,
    };
    void wrongCourseIdentity;
    void missingPublicIdentity;
  });

  it.each([
    ['course', createBookCourseImpactAdapter, BOOK_COURSE_IMPACT_ADAPTER_DECLARATION],
    ['class', createBookClassImpactAdapter, BOOK_CLASS_IMPACT_ADAPTER_DECLARATION],
    ['public-reference', createBookPublicImpactAdapter, BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION],
  ] as const)('authorizes before reading bounded immutable %s contexts', async (kind, create, declaration) => {
    const source = reader(kind, [context(kind)]);
    const result = await create({ reader: source }).discover(query);
    expect(source.authorize).toHaveBeenCalledBefore(source.readOwnedContexts);
    expect(result).toMatchObject({ status: 'ok', contextKind: kind, impacts: [{ identity: { kind } }] });
    expect(declaration.conformance.status).toBe('verified');
    expect(declaration.sourceReplacement.automaticUpdate).toBe(false);
    if (result.status === 'ok') expect(Object.isFrozen(result.impacts[0]?.identity)).toBe(true);
  });

  it('fails closed before reads when authorization is denied or has the wrong public owner scope', async () => {
    const denied = reader('course', [context('course')], {
      authorization: { authorized: false, code: 'unauthorized' },
    });
    await expect(createBookCourseImpactAdapter({ reader: denied }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'unauthorized' });
    expect(denied.readOwnedContexts).not.toHaveBeenCalled();

    const wrongScope = reader('public-reference', [context('public-reference')], {
      authorization: {
        authorized: true, actorId: 'teacher-1', contextKind: 'public-reference',
        ownerScope: 'teacher-owned-course', maxContexts: 100,
      },
    });
    await expect(createBookPublicImpactAdapter({ reader: wrongScope }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'unauthorized' });
    expect(wrongScope.readOwnedContexts).not.toHaveBeenCalled();
  });

  it('rejects exact identity/binding mismatches, opaque class pin substitution, and source-owner public authorization', async () => {
    const course = context('course', { identity: { ...identity('course'), publicationId: 'publication-2' } });
    await expect(createBookCourseImpactAdapter({ reader: reader('course', [course]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });

    const classRecord = context('class', {
      identity: { ...identity('class'), deliveryBindingRevision: identity('class').sourcePlacementRevision },
    });
    await expect(createBookClassImpactAdapter({ reader: reader('class', [classRecord]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });

    const publicRecord = context('public-reference', {
      identity: { ...identity('public-reference'), downstreamOwnerId: 'teacher-2' },
    });
    await expect(createBookPublicImpactAdapter({ reader: reader('public-reference', [publicRecord]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it.each([
    ['course', 'class', createBookCourseImpactAdapter],
    ['class', 'public-reference', createBookClassImpactAdapter],
    ['public-reference', 'course', createBookPublicImpactAdapter],
  ] as const)('rejects a %s context with a valid %s identity at runtime', async (kind, identityKind, create) => {
    const mismatched = {
      ...context(kind),
      identity: identity(identityKind),
    };
    await expect(create({ reader: reader(kind, [mismatched]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('rejects identity absence for new kinds and identity presence for Solo/Homework records', async () => {
    const missing = { ...context('course') } as { identity?: unknown } & Record<string, unknown>;
    delete missing.identity;
    await expect(createBookCourseImpactAdapter({ reader: reader('course', [missing]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });

    const soloWithIdentity = {
      ...context('course'), kind: 'solo' as const, recipientId: 'teacher-1',
    };
    await expect(createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const, actorId: 'teacher-1', contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const, maxContexts: 1,
        }),
        readOwnedContexts: async () => ({ complete: true as const, contexts: [soloWithIdentity] }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });

    const homeworkWithIdentity = { ...context('course'), kind: 'homework' as const };
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const, actorId: 'teacher-1', contextKind: 'homework' as const,
          ownerScope: 'uploader-owned-homework' as const, maxContexts: 1,
        }),
        readOwnedContexts: async () => ({ complete: true as const, contexts: [homeworkWithIdentity] }),
      },
    }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('rejects equal timestamps, incomplete reads, duplicate bindings, forbidden fields, and cyclic records', async () => {
    const equal = context('course', { observedAt: query.evaluatedAt });
    await expect(createBookCourseImpactAdapter({ reader: reader('course', [equal]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'stale' });
    await expect(createBookClassImpactAdapter({ reader: reader('class', [], { complete: false }) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'unbounded' });
    const first = context('public-reference');
    await expect(createBookPublicImpactAdapter({ reader: reader('public-reference', [first, {
      ...first, contextId: 'public-reference-context-2',
    }]) }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'ambiguous' });
    const forbidden = context('course') as BookImpactContextInput & { readonly answerKey: string };
    Object.assign(forbidden, { answerKey: 'never' });
    await expect(createBookCourseImpactAdapter({ reader: reader('course', [forbidden]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
    const cyclic = context('class') as BookImpactContextInput & { self?: unknown };
    cyclic.self = cyclic;
    await expect(createBookClassImpactAdapter({ reader: reader('class', [cyclic]) }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });
});
