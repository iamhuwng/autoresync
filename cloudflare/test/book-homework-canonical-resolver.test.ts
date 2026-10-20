import { describe, expect, it, vi } from 'vitest';
import type { BookDeliveryPublishedPublicationReference } from '../../src/services/book-delivery/bookDelivery.publication';
import type {
  BookHomeworkSagaCommand,
} from '../../src/services/book-homework/bookHomeworkSaga.types';
import type { BookHomeworkAssignmentPreviewSource } from '../../src/services/book-homework/bookHomeworkAssignmentIntent';
import {
  BookHomeworkCanonicalResolverError,
  createBookHomeworkCanonicalResolver,
  resolveCombinedDocument,
} from '../src/upload-worker/book-homework/canonical-resolver';
import { makeBookAssemblyPublicationScope } from './book-delivery.fixture';
import { fingerprintComponentPdfActivationValue } from '../../src/services/book-assembly/componentPdfActivation.service';

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

const multiComponentPublication = (): BookDeliveryPublishedPublicationReference => {
  const full = publication();
  return {
    ...full,
    sourceSet: {
      strategy: 'component_pdfs',
      sources: [
        {
          sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1,
          ownerNodeKey: 'unit-1', lifecycle: 'verified-usable', localPageScope: { kind: 'pages', pages: [1] },
        },
        {
          sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2,
          ownerNodeKey: 'unit-1', lifecycle: 'verified-usable', localPageScope: { kind: 'pages', pages: [1] },
        },
      ],
    },
    placements: full.placements.map((placement) => ({
      ...placement,
      sourcePageScopes: [
        { sourceKey: 'component-a', pages: [1] },
        { sourceKey: 'component-b', pages: [1] },
      ],
    })),
  };
};

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

  it('rejects component PDF delivery until one complete student document is ready', async () => {
    await expect(resolverFor(async () => multiComponentPublication()).resolve(command()))
      .rejects.toMatchObject({
        code: 'not-ready',
        message: 'Book Homework requires one complete student-safe PDF.',
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

  it('rejects confirm when the trusted student document or exact preview fingerprint drifted', async () => {
    const resolver = resolverFor(async () => publication());
    const first = await resolver.resolve(command());
    const base = command();
    await expect(resolver.resolve({
      ...base,
      intent: {
        ...base.intent,
        expectedStudentDocument: { ...first.manifest.studentDocument!, sha256Hex: 'b'.repeat(64) },
        expectedPreviewFingerprint: first.manifest.targetPreview!.fingerprint,
      },
    })).rejects.toMatchObject({ code: 'invalid-command' });
    await expect(resolver.resolve({
      ...base,
      intent: {
        ...base.intent,
        expectedStudentDocument: first.manifest.studentDocument,
        expectedPreviewFingerprint: 'stale-preview-fingerprint',
      },
    })).rejects.toMatchObject({ code: 'stale-input' });
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

  const previewOptions = (scope = makeBookAssemblyPublicationScope()) => {
    const readClass = vi.fn(async () => ({
      classId: 'class-1',
      ownerId: 'teacher-1',
      status: 'active',
      students: [{ studentId: 'student-1', status: 'active' }],
    }));
    return {
      readClass,
      options: createBookHomeworkCanonicalResolver({
        classReader: readClass,
        readPublicationScope: async () => scope,
      }),
    };
  };

  const componentScope = () => {
    const scope = makeBookAssemblyPublicationScope() as any;
    const sources = [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ];
    scope.versions['manifest-1'].strategy = 'component_pdfs';
    scope.versions['manifest-1'].manifest.sourceSet = { sourceStrategy: 'component_pdfs', sources };
    scope.versions['manifest-1'].studentSafeProjection.sourceStrategy = 'component_pdfs';
    scope.versions['manifest-1'].studentSafeProjection.sourceSet = { sourceStrategy: 'component_pdfs', sources };
    scope.versions['manifest-1'].manifest.units[0].pageGroups[0].sourceKey = 'component-a';
    scope.versions['manifest-1'].studentSafeProjection.units[0].pageGroups[0].sourceKey = 'component-a';
    const secondGroup = { pageGroupKey: 'group-2', sourceKey: 'component-b', pages: [1], activityKeys: ['activity-key-1'], mode: 'activity' };
    scope.versions['manifest-1'].manifest.units[0].pageGroups.push(secondGroup);
    scope.versions['manifest-1'].manifest.units[0].activitySlots[0].pageGroupKeys.push('group-2');
    scope.versions['manifest-1'].studentSafeProjection.units[0].pageGroups.push(secondGroup);
    scope.versions['manifest-1'].studentSafeProjection.units[0].activitySlots[0].pageGroupKeys.push('group-2');
    scope.placements['placement-1'].pageGroupKeys.push('group-2');
    scope.deliveryPlans['delivery-plan-1'].sourceStrategy = 'component_pdfs';
    scope.deliveryPlans['delivery-plan-1'].sourceSet = { sourceStrategy: 'component_pdfs', sources };
    const pages = [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', physicalPageNumber: 1 },
    ];
    scope.placements['placement-1'].sourcePages = pages;
    scope.activityVersions['activity-1-v1'].sourcePages = pages;
    scope.activitySafeProjections['projection-1'].sourcePages = pages;
    scope.studentDocuments = {
      'student-document-v1': {
        schemaVersion: 1, logicalSourceKey: 'student-document', sourceVersionId: 'student-document-v1',
        descriptorRevision: 3, descriptorCasOwner: 'assembly-publication', sha256Hex: 'a'.repeat(64),
        byteSize: 100, physicalPageCount: 2, studentSafeStatus: 'ready', compositionFingerprint: 'composition-1',
        components: [
          { ...sources[0], localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
          { ...sources[1], localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
        ],
      },
    };
    scope.versions['manifest-1'].studentDocument = {
      sourceVersionId: 'student-document-v1', descriptorRevision: 3, sha256Hex: 'a'.repeat(64),
      descriptorFingerprint: fingerprintComponentPdfActivationValue(scope.studentDocuments['student-document-v1']),
    };
    return scope;
  };

  it('resolves the exact combined document pin and refuses missing or mismatched history', () => {
    const scope = componentScope();
    const descriptor = scope.studentDocuments['student-document-v1'];
    scope.studentDocuments['another-document'] = { ...descriptor, sourceVersionId: 'another-document' };
    expect(resolveCombinedDocument(scope, 'manifest-1')).toEqual(descriptor);
    descriptor.components[0].ownerNodeKey = 'tampered-unit';
    expect(() => resolveCombinedDocument(scope, 'manifest-1')).toThrow();
    descriptor.components[0].ownerNodeKey = 'unit-1';
    scope.versions['manifest-1'].studentDocument.sha256Hex = 'b'.repeat(64);
    expect(() => resolveCombinedDocument(scope, 'manifest-1')).toThrow();
    delete scope.versions['manifest-1'].studentDocument;
    expect(() => resolveCombinedDocument(scope, 'manifest-1')).toThrow();
  });

  const componentCommand = (preview: BookHomeworkAssignmentPreviewSource) => ({
    ...command(),
    assignmentId: 'assignment-component',
    ownerId: 'teacher-1',
    manifestVersionId: 'manifest-1',
    selectedRecipientIds: ['student-1'],
    intent: {
      ...command().intent,
      bookId: 'book-pdf-1',
      target: { kind: 'unit' as const, bookId: 'book-pdf-1', nodeKey: 'unit-1', classId: 'class-1' },
      policy: { ...command().intent.policy, activityPolicies: [{ placementId: 'placement-1', maxAttempts: 2, feedbackRelease: 'after_completion' as const, lateSubmissionAllowed: false }] },
      expectedPublication: { publicationId: 'publication-1', publicationRevision: 4, manifestVersionId: 'manifest-1' },
      // Exclusion previews may omit the document because nothing is launchable;
      // the command still carries the canonical publication-pinned receipt so
      // the resolver can classify the exclusion as an invalid target.
      expectedStudentDocument: preview.studentDocument
        ? {
          sourceVersionId: preview.studentDocument.sourceVersionId,
          descriptorRevision: preview.studentDocument.descriptorRevision,
          sha256Hex: preview.studentDocument.sha256Hex,
        }
        : { sourceVersionId: 'student-document-v1', descriptorRevision: 3, sha256Hex: 'a'.repeat(64) },
      expectedPreviewFingerprint: preview.targetPreview.fingerprint,
    },
  });

  it('requires real component document and preview receipts and rejects omitted, synthetic, or crossed confirmation facts', async () => {
    const scope = componentScope();
    const { options: resolver } = previewOptions(scope);
    const preview = await resolver.resolvePreviewSource({
      ownerId: 'teacher-1', bookId: 'book-pdf-1', unitKey: 'unit-1', classId: 'class-1',
      selectedRecipientIds: ['student-1'], contextId: 'preview-component', createdAt,
    });
    const valid = componentCommand(preview);
    await expect(resolver.resolve(valid)).resolves.toMatchObject({
      manifest: { studentDocument: valid.intent.expectedStudentDocument },
    });
    for (const intent of [
      { ...valid.intent, expectedStudentDocument: undefined, expectedPreviewFingerprint: undefined },
      { ...valid.intent, expectedStudentDocument: { sourceVersionId: 'student-document-v1', descriptorRevision: 0, sha256Hex: '0'.repeat(64) } },
      { ...valid.intent, expectedPreviewFingerprint: 'crossed-preview' },
    ]) await expect(resolver.resolve({ ...valid, intent })).rejects.toMatchObject({ code: 'stale-input' });
  });

  it.each([
    ['not-published', (placement: any) => ({ ...placement, placementId: 'excluded-1', publicationRevision: 3 })],
    ['unsupported-activity', (placement: any) => ({ ...placement, placementId: 'excluded-1', activityId: 'unsupported-activity' })],
    ['missing-source', (placement: any) => ({ ...placement, placementId: 'excluded-1', sourcePages: [] })],
    ['unresolved-mapping', (placement: any) => ({ ...placement, placementId: 'excluded-1', activityKey: 'missing-slot' })],
    ['duplicate-placement', (placement: any) => ({ ...placement })],
  ])('persists and blocks the authoritative %s exclusion', async (reason, mutate) => {
    const scope = makeBookAssemblyPublicationScope() as any;
    scope.placements['excluded-record'] = mutate(scope.placements['placement-1']);
    const { options } = previewOptions(scope);
    const preview = await options.resolvePreviewSource({
      ownerId: 'teacher-1', bookId: 'book-pdf-1', unitKey: 'unit-1', classId: 'class-1',
      selectedRecipientIds: ['student-1'], contextId: `preview-${reason}`, createdAt,
    });
    expect(preview.targetPreview.excludedReasonCounts).toMatchObject({ [reason]: 1 });
    expect(preview.excludedActivities).toEqual(expect.arrayContaining([expect.objectContaining({ reason })]));
    await expect(options.resolve(componentCommand(preview))).rejects.toMatchObject({ code: 'invalid-target' });
  });

  it('returns a read-only, publication-pinned Unit preview source for selected recipients', async () => {
    const scope = makeBookAssemblyPublicationScope();
    const before = structuredClone(scope);
    const { options } = previewOptions(scope);
    const source = await options.resolvePreviewSource({
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      unitKey: 'unit-1',
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      contextId: 'preview-1',
      createdAt,
      title: ' Unit 1 Preview ',
    });

    expect(source).toMatchObject({
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      bookTitle: 'Unit 1 Preview',
      initialTarget: { kind: 'unit', bookId: 'book-pdf-1', nodeKey: 'unit-1' },
      delivery: {
        context: { contextId: 'preview-1', kind: 'homework' },
        book: { publicationId: 'publication-1', publicationStatus: 'published' },
        sourceSet: { strategy: 'full_pdf', sources: [{ sourceVersionId: 'source-v1' }] },
      },
      identity: { manifestVersionId: 'manifest-1', ownerId: 'teacher-1' },
    });
    expect(JSON.stringify(source)).not.toMatch(/answerKey|sourceBytes|privateKey|credentials/iu);
    expect(scope).toEqual(before);
  });

  it.each([
    ['a non-owner', { ownerId: 'teacher-other' }, 'class-forbidden'],
    ['a non-member', { selectedRecipientIds: ['student-other'] }, 'unauthorized-recipient'],
  ])('rejects %s before publication reads', async (_label, input, code) => {
    const readPublicationScope = vi.fn(async () => makeBookAssemblyPublicationScope());
    const resolver = createBookHomeworkCanonicalResolver({
      classReader: async () => ({
        classId: 'class-1', ownerId: 'teacher-1', status: 'active',
        students: [{ studentId: 'student-1', status: 'active' }],
      }),
      readPublicationScope,
    });
    await expect(resolver.resolvePreviewSource({
      ownerId: 'teacher-1', bookId: 'book-pdf-1', unitKey: 'unit-1', classId: 'class-1',
      selectedRecipientIds: ['student-1'], contextId: 'preview-1', createdAt,
      ...input,
    })).rejects.toMatchObject({ code: code === 'class-forbidden' ? 'class-forbidden' : 'unauthorized-recipient' });
    expect(readPublicationScope).not.toHaveBeenCalled();
  });

  it('keeps a selected Unit scope from exposing a sibling Unit', async () => {
    const scope = makeBookAssemblyPublicationScope();
    (scope.versions!['manifest-1']!.manifest.nodes as unknown as Array<Record<string, unknown>>).push({
      nodeKey: 'unit-2', parentNodeKey: null, nodeType: 'unit', order: 2,
    });
    const unit2 = structuredClone(scope.versions!['manifest-1']!.manifest.units[0]!);
    (unit2 as any).unitKey = 'unit-2';
    (scope.versions!['manifest-1']!.manifest.units as any[]).push(unit2);
    scope.placements!['placement-2'] = {
      ...scope.placements!['placement-1']!, placementId: 'placement-2', unitKey: 'unit-2', nodeKey: 'unit-2',
    };
    scope.activitySafeProjections!['projection-2'] = {
      ...scope.activitySafeProjections!['projection-1']!, projectionId: 'projection-2', placementIds: ['placement-2'],
    };
    const { options } = previewOptions(scope);
    const source = await options.resolvePreviewSource({
      ownerId: 'teacher-1', bookId: 'book-pdf-1', unitKey: 'unit-1', classId: 'class-1',
      selectedRecipientIds: ['student-1'], contextId: 'preview-1', createdAt,
    });
    expect(source.delivery.outline.map((node) => node.nodeKey)).toEqual(['unit-1']);
    expect(source.targetPreview.excludedReasonCounts['outside-selected-target']).toBe(1);
    expect(source.excludedActivities ?? []).toEqual([]);
  });

  it.each([
    ['unknown structural target', { kind: 'unit', bookId: 'book-pdf-1', nodeKey: 'missing-unit' }],
    ['malformed target', { kind: 'unit', bookId: 'other-book', nodeKey: 'unit-1' }],
    ['unknown activity target', { kind: 'activity', bookId: 'book-pdf-1', activityId: 'missing-activity' }],
  ])('rejects an %s before producing a confirmation receipt', async (_label, target) => {
    const { options } = previewOptions();
    await expect(options.resolvePreviewSource({
      ownerId: 'teacher-1', bookId: 'book-pdf-1', target: target as any, classId: 'class-1',
      selectedRecipientIds: ['student-1'], contextId: 'preview-invalid', createdAt,
    })).rejects.toMatchObject({ code: 'invalid-target' });
  });
});
