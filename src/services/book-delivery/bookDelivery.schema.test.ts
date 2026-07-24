import { describe, expect, it } from 'vitest';
import { createBookDeliveryBinding } from './bookDelivery.entitlementFactory';
import {
  BookDeliveryPublicationError,
  createBookDeliveryPublicationReference,
} from './bookDelivery.publication';
import {
  isRunnableBookDeliveryBinding,
  validateBookDeliveryBinding,
} from './bookDelivery.schema';
import { readLegacyBookDeliveryV1 } from './bookDelivery.v1.adapter';

const publication = (strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf') => ({
  bookId: 'book-pdf-1',
  bookMode: 'pdf' as const,
  bookRevision: 3,
  publicationId: 'publication-1',
  publicationRevision: 4,
  publicationStatus: 'published' as const,
  ownerId: 'teacher-1',
  scope: {
    kind: 'subtree' as const,
    nodeKeys: ['unit-1'],
    placementIds: [],
  },
  sourceSet: {
    strategy,
    sources: strategy === 'full_pdf'
      ? [{
        sourceKey: 'full',
        sourceVersionId: 'source-v1',
        lifecycle: 'verified-usable' as const,
        localPageScope: { kind: 'all' as const, pages: [] },
      }]
      : [
        {
          sourceKey: 'component-a',
          sourceVersionId: 'source-v1',
          lifecycle: 'verified-usable' as const,
          ownerNodeKey: 'unit-1',
          localPageScope: { kind: 'pages' as const, pages: [1, 2] },
        },
        {
          sourceKey: 'component-b',
          sourceVersionId: 'source-v2',
          lifecycle: 'verified-usable' as const,
          ownerNodeKey: 'unit-2',
          localPageScope: { kind: 'pages' as const, pages: [1] },
        },
      ],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 2,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required' as const,
    sourcePageScopes: [{ sourceKey: strategy === 'full_pdf' ? 'full' : 'component-a', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' as const },
});

const binding = (overrides: Record<string, unknown> = {}) => createBookDeliveryBinding({
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: { kind: 'solo', contextId: 'solo-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'solo' },
  publication: publication(),
  createdAt: '2026-07-25T00:00:00.000Z',
  ...overrides,
} as Parameters<typeof createBookDeliveryBinding>[0]);

describe('Book Delivery binding schema', () => {
  it('covers all runnable context discriminants and both source strategies', () => {
    for (const [kind, basis] of [
      ['solo', 'solo'],
      ['preview', 'preview'],
      ['homework', 'assignment'],
      ['course', 'enrollment'],
      ['class', 'membership'],
    ] as const) {
      const value = binding({
        context: { kind, contextId: `${kind}-1`, recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: basis },
      });
      expect(validateBookDeliveryBinding(value).valid).toBe(true);
      expect(isRunnableBookDeliveryBinding(value)).toBe(true);
    }
    expect(validateBookDeliveryBinding(binding({ publication: publication('component_pdfs') })).valid).toBe(true);
  });

  it('requires recipient-specific scope and rejects public metadata grants', () => {
    const value = binding({
      context: { kind: 'preview', contextId: 'public-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'preview' },
    });
    expect(validateBookDeliveryBinding(value).valid).toBe(true);
    expect(validateBookDeliveryBinding({
      ...value,
      context: { kind: 'public-reference', contextId: 'public-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'preview' },
    }).errors.some((item) => item.code === 'unsupported-context')).toBe(true);
  });

  it('rejects unknown/private fields, duplicate IDs, bad pages, and contradictory scope', () => {
    const value = binding();
    const duplicate = structuredClone(value) as any;
    duplicate.placements.push({ ...duplicate.placements[0], placementId: 'placement-1', order: 2 });
    expect(validateBookDeliveryBinding(duplicate).valid).toBe(false);
    expect(validateBookDeliveryBinding({ ...value, providerObjectKey: 'private/secret' }).errors.some((item) => item.code === 'forbidden-field')).toBe(true);
    expect(validateBookDeliveryBinding({
      ...value,
      scope: { kind: 'placements', nodeKeys: [], placementIds: [] },
    }).errors.some((item) => item.code === 'contradictory-scope')).toBe(true);
    const badPages = structuredClone(value) as any;
    badPages.sourceSet.sources[0].localPageScope = { kind: 'pages', pages: [2, 1] };
    expect(validateBookDeliveryBinding(badPages).valid).toBe(false);
  });

  it('rejects cross-identity and cross-source authority confusion', () => {
    const value = binding();
    expect(validateBookDeliveryBinding({
      ...value,
      context: { ...value.context, ownerId: 'other-owner' },
    }).errors.some((item) => item.code === 'invalid-value')).toBe(true);
    const unknownSource = structuredClone(value) as any;
    unknownSource.placements[0].sourcePageScopes[0].sourceKey = 'unbound';
    expect(validateBookDeliveryBinding(unknownSource).errors.some((item) => item.code === 'source-scope-mismatch')).toBe(true);
    const outOfScopePage = structuredClone(value) as any;
    outOfScopePage.sourceSet.sources[0].localPageScope = { kind: 'pages', pages: [2] };
    expect(validateBookDeliveryBinding(outOfScopePage).errors.some((item) => item.code === 'source-scope-mismatch')).toBe(true);
  });

  it('fails closed for malformed nested records and hidden array authority', () => {
    const malformed = validateBookDeliveryBinding({
      ...binding(),
      recipient: null,
      scope: { kind: 'placements', nodeKeys: null, placementIds: null },
      sourceSet: { strategy: 'full_pdf', sources: [{}] },
    });
    expect(malformed.valid).toBe(false);
    expect(isRunnableBookDeliveryBinding({
      ...binding(),
      recipient: null,
    })).toBe(false);
    const hidden = structuredClone(binding()) as any;
    Object.defineProperty(hidden.placements, 'privateToken', {
      value: 'hidden',
      enumerable: false,
    });
    expect(validateBookDeliveryBinding(hidden).valid).toBe(false);
    const hiddenPages = structuredClone(binding()) as any;
    Object.defineProperty(hiddenPages.sourceSet.sources[0].localPageScope.pages, 'privateToken', {
      value: 'hidden',
      enumerable: false,
    });
    expect(validateBookDeliveryBinding(hiddenPages).valid).toBe(false);
    const accessor = structuredClone(binding()) as any;
    Object.defineProperty(accessor.recipient, 'recipientId', {
      enumerable: true,
      get: () => 'student-1',
    });
    expect(validateBookDeliveryBinding(accessor).valid).toBe(false);
  });

  it('requires complete full PDF scope and exact placement scope', () => {
    const partialFullPdf = structuredClone(binding()) as any;
    partialFullPdf.sourceSet.sources[0].localPageScope = { kind: 'pages', pages: [1] };
    expect(validateBookDeliveryBinding(partialFullPdf).errors.some((item) => item.code === 'source-scope-mismatch')).toBe(true);

    const placements = structuredClone(binding()) as any;
    placements.scope = { kind: 'placements', nodeKeys: [], placementIds: ['placement-1', 'extra-placement'] };
    expect(validateBookDeliveryBinding(placements).errors.some((item) => item.code === 'contradictory-scope')).toBe(true);
    placements.scope = { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1'] };
    expect(validateBookDeliveryBinding(placements).errors.some((item) => item.code === 'contradictory-scope')).toBe(true);
  });

  it('strictly validates and deep-clones publication references', () => {
    const input = publication() as any;
    const reference = createBookDeliveryPublicationReference(input);
    expect(Object.isFrozen(reference.sourceSet.sources)).toBe(true);
    expect(Object.isFrozen(input.sourceSet.sources)).toBe(false);
    input.sourceSet.sources[0].sourceKey = 'mutated';
    expect(reference.sourceSet.sources[0]?.sourceKey).toBe('full');

    expect(() => createBookDeliveryPublicationReference({
      ...publication(),
      sourceSet: {
        ...publication().sourceSet,
        privateBucketId: 'private',
      },
    })).toThrow(BookDeliveryPublicationError);
    const nonEnumerable = publication() as any;
    Object.defineProperty(nonEnumerable, 'ownerId', {
      value: 'teacher-1',
      enumerable: false,
      configurable: true,
    });
    expect(() => createBookDeliveryPublicationReference(nonEnumerable)).toThrow('enumerable data field');
  });

  it('rejects factory owner mismatch and malformed V1 dates', () => {
    expect(() => binding({
      issuer: { ownerId: 'other-owner', authorityBoundary: 'book-owner' },
    })).toThrow('must match published publication owner');
    expect(readLegacyBookDeliveryV1({
      schemaVersion: 1,
      bindingId: 'legacy-1',
      bookId: 'book-legacy',
      recipientId: 'student-1',
      sourceVersionId: 'legacy-source',
      createdAt: '9999-99-99T99:99:99.999Z',
    })).toBeNull();
  });

  it('does not freeze or retain caller-owned factory identity objects', () => {
    const recipient = { recipientId: 'student-1', recipientKind: 'student' as const };
    const issuer = { ownerId: 'teacher-1', authorityBoundary: 'book-owner' as const };
    const context = { kind: 'solo' as const, contextId: 'solo-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'solo' as const };
    const value = binding({ recipient, issuer, context });
    expect(Object.isFrozen(recipient)).toBe(false);
    expect(Object.isFrozen(issuer)).toBe(false);
    expect(Object.isFrozen(context)).toBe(false);
    recipient.recipientId = 'mutated';
    expect(value.recipient.recipientId).toBe('student-1');
  });

  it('accepts future_live only as draft preview input and never as runnable', () => {
    const future = binding({
      status: 'draft',
      recipient: { recipientId: 'preview-1', recipientKind: 'preview-user' },
      context: { kind: 'future_live', contextId: 'future-1', recipientId: 'preview-1', ownerId: 'teacher-1', entitlementBasis: 'reserved' },
    });
    expect(validateBookDeliveryBinding(future).valid).toBe(true);
    expect(isRunnableBookDeliveryBinding(future)).toBe(false);
    expect(validateBookDeliveryBinding({ ...future, status: 'active' }).errors.some((item) => item.code === 'unrunnable-future-live')).toBe(true);
  });

  it('keeps legacy V1 records read-only and separate from Mode 2', () => {
    const legacy = {
      schemaVersion: 1,
      bindingId: 'legacy-1',
      bookId: 'book-legacy',
      recipientId: 'student-1',
      sourceVersionId: 'legacy-source',
      createdAt: '2026-07-25T00:00:00.000Z',
    };
    expect(readLegacyBookDeliveryV1(legacy)).toMatchObject({ version: 1, readOnly: true });
    expect(readLegacyBookDeliveryV1({ ...legacy, bookMode: 'materials' })).toBeNull();
    expect(readLegacyBookDeliveryV1({ ...legacy, schemaVersion: 2 })).toBeNull();
    const accessor = { ...legacy } as any;
    Object.defineProperty(accessor, 'recipientId', {
      enumerable: true,
      get: () => 'student-1',
    });
    expect(readLegacyBookDeliveryV1(accessor)).toBeNull();
  });
});
