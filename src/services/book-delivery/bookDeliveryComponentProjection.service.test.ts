import { describe, expect, it } from 'vitest';
import type { BookRuntimeDeliveryProjection } from './bookDelivery.types';
import {
  createBookDeliveryComponentProjection,
  validateBookDeliveryComponentProjection,
} from './bookDeliveryComponentProjection.service';

const source = (
  sourceKey: string,
  sourceVersionId: string,
  sourceOrder: number,
  ownerNodeKey: string,
) => ({
  sourceKey,
  sourceVersionId,
  sourceOrder,
  ownerNodeKey,
  lifecycle: 'verified-usable' as const,
  localPageScope: { kind: 'pages' as const, pages: [sourceOrder] },
});

const request = (sourceKey: string, sourceVersionId: string) => ({
  sourceKey,
  sourceVersionId,
  opaqueRouteKey: `opaque-${sourceKey}`,
  localPageScope: { kind: 'pages' as const, pages: [1] },
});

const activity = (
  placementId: string,
  activityId: string,
  order: number,
  sourceKeys: readonly string[],
) => ({
  placementId,
  activityId,
  activityVersion: 1,
  nodeKey: `node-${order}`,
  order,
  contextMode: 'required' as const,
  sourceContext: {
    available: true,
    description: `Source ${sourceKeys.join(', ')}`,
    sourcePageScopes: sourceKeys.map((sourceKey) => ({ sourceKey, pages: [1] })),
  },
});

const projection = (overrides: Partial<BookRuntimeDeliveryProjection> = {}): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 1,
  recipientId: 'student-1',
  context: { contextId: 'context-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['node-1', 'node-2'], placementIds: ['placement-1', 'placement-2'] },
  sourceSet: {
    strategy: 'component_pdfs',
    sources: [
      source('component-a', 'source-a-v1', 1, 'section-a'),
      source('component-b', 'source-b-v1', 2, 'section-b'),
    ],
  },
  documentRequests: [
    request('component-b', 'source-b-v1'),
    request('component-a', 'source-a-v1'),
  ],
  activities: [
    activity('placement-1', 'activity-1', 1, ['component-a']),
    activity('placement-2', 'activity-2', 2, ['component-b']),
  ],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-1',
    publicationRevision: 1,
    bindingId: 'binding-1',
    bindingRevision: 1,
  },
  ...overrides,
});

describe('Book Delivery component projection', () => {
  it('normalizes component_pdfs by sourceOrder despite reordered input', () => {
    const result = createBookDeliveryComponentProjection(projection());

    expect(result.components.map((component) => [component.componentId, component.sourceOrder])).toEqual([
      ['component-a', 1],
      ['component-b', 2],
    ]);
  });

  it('preserves mixed ownerNodeKey values in normalized order', () => {
    const result = createBookDeliveryComponentProjection(projection({
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [
          source('component-a', 'source-a-v1', 1, 'section-a'),
          source('component-b', 'source-b-v1', 2, 'unit-b'),
          source('component-c', 'source-c-v1', 3, 'chapter-c'),
        ],
      },
      documentRequests: [
        request('component-b', 'source-b-v1'),
        request('component-c', 'source-c-v1'),
        request('component-a', 'source-a-v1'),
      ],
      activities: [
        activity('placement-1', 'activity-1', 1, ['component-a']),
        activity('placement-2', 'activity-2', 2, ['component-b']),
        activity('placement-3', 'activity-3', 3, ['component-c']),
      ],
    }));

    expect(result.components.map((component) => [component.componentId, component.ownerNodeKey])).toEqual([
      ['component-a', 'section-a'],
      ['component-b', 'unit-b'],
      ['component-c', 'chapter-c'],
    ]);
  });

  it('projects only the authorized component subset', () => {
    const result = createBookDeliveryComponentProjection(projection({
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [source('component-b', 'source-b-v1', 1, 'section-b')],
      },
      documentRequests: [request('component-b', 'source-b-v1')],
      activities: [activity('placement-2', 'activity-2', 2, ['component-b'])],
    }));

    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      componentId: 'component-b',
      sourceKey: 'component-b',
      sourceVersionId: 'source-b-v1',
      placementIds: ['placement-2'],
      activityIds: ['activity-2'],
    });
  });

  it.each([
    ['duplicate document requests', [request('component-a', 'source-a-v1'), request('component-a', 'source-a-v1')]],
    ['missing document request', [request('component-a', 'source-a-v1')]],
  ])('rejects %s', (_name, documentRequests) => {
    const candidate = projection({ documentRequests });

    expect(validateBookDeliveryComponentProjection(candidate).valid).toBe(false);
    expect(() => createBookDeliveryComponentProjection(candidate)).toThrow();
  });

  it('rejects source-version mismatch', () => {
    const candidate = projection({
      documentRequests: [request('component-a', 'source-a-v2'), request('component-b', 'source-b-v1')],
    });

    expect(validateBookDeliveryComponentProjection(candidate).errors).toContainEqual(expect.objectContaining({
      path: 'sourceSet.sources[0].sourceVersionId',
    }));
  });

  it('accepts reordered source input but rejects unauthorized placement source references', () => {
    const reordered = projection({
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [
          source('component-a', 'source-a-v1', 2, 'section-a'),
          source('component-b', 'source-b-v1', 1, 'section-b'),
        ],
      },
    });
    const unauthorizedPlacement = projection({
      activities: [activity('placement-1', 'activity-1', 1, ['component-secret']), activity('placement-2', 'activity-2', 2, ['component-b'])],
    });

    expect(validateBookDeliveryComponentProjection(reordered).valid).toBe(true);
    expect(createBookDeliveryComponentProjection(reordered).components.map((component) => component.componentId)).toEqual([
      'component-b',
      'component-a',
    ]);
    expect(validateBookDeliveryComponentProjection(unauthorizedPlacement).errors).toContainEqual(expect.objectContaining({
      path: 'activities[0].sourceContext.sourcePageScopes[0]',
    }));
  });

  it('keeps full_pdf behavior as one request with no component descriptors', () => {
    const fullPdf = projection({
      sourceSet: {
        strategy: 'full_pdf',
        sources: [source('full', 'full-v1', 1, 'book-root')],
      },
      documentRequests: [request('full', 'full-v1')],
      activities: [],
    });

    expect(createBookDeliveryComponentProjection(fullPdf)).toEqual({
      strategy: 'full_pdf',
      components: [],
      fullPdfRequest: fullPdf.documentRequests[0],
    });
  });

  it('keeps provider and storage fields out of opaque component descriptors', () => {
    const candidate = projection({
      sourceSet: {
        strategy: 'component_pdfs',
        sources: [{
          ...source('component-a', 'source-a-v1', 1, 'section-a'),
          provider: 'b2',
          bucket: 'private-bucket',
          objectKey: 'private/object.pdf',
          providerFileId: 'provider-file-id',
          providerFileVersionId: 'provider-file-version-id',
        } as never],
      },
      documentRequests: [request('component-a', 'source-a-v1')],
      activities: [activity('placement-1', 'activity-1', 1, ['component-a'])],
    });

    const descriptor = createBookDeliveryComponentProjection(candidate).components[0];
    expect(descriptor).not.toHaveProperty('provider');
    expect(descriptor).not.toHaveProperty('bucket');
    expect(descriptor).not.toHaveProperty('objectKey');
    expect(descriptor).not.toHaveProperty('providerFileId');
    expect(descriptor).not.toHaveProperty('providerFileVersionId');
    expect(JSON.stringify(descriptor)).not.toMatch(/provider|bucket|objectKey|storage|credential/iu);
  });
});
