import { describe, expect, it } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../book-delivery/bookDelivery.types';
import {
  buildBookHomeworkPreview,
  createDefaultBookHomeworkPolicy,
} from './bookHomeworkPreview.service';
import { createBookHomeworkManifest } from './bookHomeworkManifest.service';

const delivery: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-preview-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  context: { contextId: 'homework-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 4,
    manifestVersionId: 'manifest-v1',
    publicationId: 'publication-4',
    publicationRevision: 2,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['section-1', 'unit-1'], placementIds: ['placement-1', 'placement-2'] },
  outline: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
  ],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full-pdf',
      sourceVersionId: 'source-v4',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  documentRequests: [{
    sourceKey: 'full-pdf',
    sourceVersionId: 'source-v4',
    opaqueRouteKey: 'fixture-route',
    localPageScope: { kind: 'all', pages: [] },
  }],
  activities: [
    {
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
      activityVersionId: 'activity-1-v1',
      nodeKey: 'unit-1',
      order: 1,
      titleSnapshot: 'Activity 1',
      contextMode: 'none',
      sourceContext: { available: false, description: 'No source context required.', pageGroupKeys: [], sourcePageScopes: [] },
    },
    {
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersion: 2,
      activityVersionId: 'activity-2-v2',
      nodeKey: 'unit-1',
      order: 2,
      titleSnapshot: 'Activity 2',
      contextMode: 'required',
      sourceContext: {
        available: true,
        description: 'Full PDF page 4.',
        pageGroupKeys: ['page-group-2'],
        sourcePageScopes: [{ sourceKey: 'full-pdf', pages: [4] }],
      },
    },
  ],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-4',
    publicationRevision: 2,
    bindingId: 'binding-preview-1',
    bindingRevision: 2,
  },
};

const makeSource = (overrides: Partial<Parameters<typeof buildBookHomeworkPreview>[0]['source']> = {}) => ({
  delivery,
  identity: {
    manifestVersionId: 'manifest-v1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 1,
  },
  bookTitle: 'Preview Book',
  ...overrides,
});

const makeManifest = (target: Parameters<typeof createBookHomeworkManifest>[0]['target']) => createBookHomeworkManifest({
  resolution: { delivery },
  target,
  manifestVersionId: 'manifest-v1',
  ownerId: 'teacher-1',
  createdByCommandId: 'command-1',
  createdAt: '2026-07-28T00:00:00.000Z',
  bindingRevision: 1,
});

describe('Book Homework preview policy', () => {
  it('uses frozen Delivery facts and accountable defaults', () => {
    const manifest = makeManifest({ kind: 'book', bookId: 'book-1' });
    const policy = createDefaultBookHomeworkPolicy(manifest);
    const preview = buildBookHomeworkPreview({ source: makeSource(), manifest, policy });

    expect(policy.intent).toBe('accountable');
    expect(policy.integrityCapture).toBe(true);
    expect(policy.activityPolicies).toHaveLength(2);
    expect(preview.manifest.book.publicationId).toBe('publication-4');
    expect(preview.sourceSummary.sources[0]?.sourceVersionId).toBe('source-v4');
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'full-pdf-complete-exposure', severity: 'warning' }),
    ]));
    expect(preview.canConfirm).toBe(true);
  });

  it('turns integrity capture off for practice and warns about prior results', () => {
    const manifest = makeManifest({ kind: 'book', bookId: 'book-1' });
    const policy = createDefaultBookHomeworkPolicy(manifest, 'practice');
    const preview = buildBookHomeworkPreview({
      source: makeSource({ priorResultAccess: true }),
      manifest,
      policy,
    });

    expect(policy.integrityCapture).toBe(false);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'prior-feedback-risk', severity: 'warning' }),
    ]));
  });

  it('warns when component delivery is broader than an Activity target', () => {
    const componentDelivery: BookRuntimeDeliveryProjection = {
      ...delivery,
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [{
          sourceKey: 'component-1',
          sourceVersionId: 'component-v1',
          lifecycle: 'verified-usable',
          sourceOrder: 1,
          ownerNodeKey: 'unit-1',
          localPageScope: { kind: 'pages', pages: [1, 2] },
        }],
      },
      activities: delivery.activities.map((activity) => activity.placementId === 'placement-2'
        ? {
          ...activity,
          sourceContext: {
            ...activity.sourceContext,
            sourcePageScopes: [{ sourceKey: 'component-1', pages: [1] }],
          },
        }
        : activity),
    };
    const source = makeSource({ delivery: componentDelivery });
    const manifest = createBookHomeworkManifest({
      resolution: { delivery: componentDelivery },
      target: { kind: 'activity', bookId: 'book-1', activityId: 'activity-1', placementId: 'placement-1' },
      manifestVersionId: 'manifest-v1',
      ownerId: 'teacher-1',
      createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      bindingRevision: 1,
    });

    const preview = buildBookHomeworkPreview({
      source,
      manifest,
      policy: createDefaultBookHomeworkPolicy(manifest),
    });

    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'component-broader-than-scope' }),
    ]));
  });

  it('blocks excluded Activities that lack safe source support', () => {
    const excludedActivities = [{
      placementId: 'placement-excluded',
      activityId: 'activity-excluded',
      nodeKey: 'unit-1',
      order: 3,
      contextMode: 'required' as const,
      titleSnapshot: 'Unavailable Activity',
      reason: 'missing-source' as const,
    }];
    const manifest = createBookHomeworkManifest({
      resolution: { delivery },
      target: { kind: 'book', bookId: 'book-1' },
      manifestVersionId: 'manifest-v1',
      ownerId: 'teacher-1',
      createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      bindingRevision: 1,
      excludedActivities,
    });

    const preview = buildBookHomeworkPreview({
      source: makeSource({ excludedActivities }),
      manifest,
      policy: createDefaultBookHomeworkPolicy(manifest),
    });

    expect(preview.canConfirm).toBe(false);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-content', severity: 'blocker' }),
    ]));
  });

  it('blocks Activities with unavailable source readiness', () => {
    const manifest = makeManifest({ kind: 'book', bookId: 'book-1' });
    const invalidManifest = {
      ...manifest,
      bindings: manifest.bindings.map((binding) => binding.placementId === 'placement-2'
        ? { ...binding, contextMode: 'optional' as const, sourceReadiness: 'unavailable' as const }
        : binding),
    };

    const preview = buildBookHomeworkPreview({
      source: makeSource(),
      manifest: invalidManifest,
      policy: createDefaultBookHomeworkPolicy(invalidManifest),
    });

    expect(preview.canConfirm).toBe(false);
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-source-readiness', severity: 'blocker' }),
    ]));
  });
});
