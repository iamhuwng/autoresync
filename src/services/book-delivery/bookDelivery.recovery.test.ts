import { describe, expect, it } from 'vitest';
import { createBookDeliveryBinding } from './bookDelivery.entitlementFactory';
import {
  createBookDeliveryRecoveryAdapter,
  InMemoryBookDeliveryRecoveryProjectionStore,
  rebuildBookDeliveryRecoveryProjections,
  validateBookDeliveryRecoveryRecord,
} from './bookDelivery.recovery';
import type { BookSourceRecoveryAuthority } from '../book-source-delivery/sourceRecovery.adapter';

const now = '2026-08-11T00:00:00.000Z';
const recoveryContext = { recoveryOperationId: 'recovery-122', phase: 'rebuilding' as const };

const binding = createBookDeliveryBinding({
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: {
    kind: 'solo',
    contextId: 'solo-binding-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
  publication: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
    ownerId: 'teacher-1',
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
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
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      nodeKey: 'unit-1',
      order: 1,
      contextMode: 'required',
      pageGroupKeys: ['group-1'],
      sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
    }],
    schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
  },
  createdAt: now,
});

const record = {
  binding,
  recordRevision: 1,
  status: 'active' as const,
  createdAt: now,
  updatedAt: now,
};

const current = {
  bindingId: 'binding-1',
  bindingRevision: 1,
  recipientId: 'student-1',
  contextId: 'solo-binding-1',
  contextKind: 'solo' as const,
  status: 'active' as const,
  updatedAt: now,
};

const scopes = {
  'student-1': {
    'solo-binding-1': {
      current,
      records: { 'binding-1': record },
    },
  },
};

const bindingIndexes = {
  'binding-1': { recipientId: 'student-1', contextId: 'solo-binding-1' },
};

const authority = (available = true): BookSourceRecoveryAuthority => ({
  accountId: 'account-1',
  reservationId: 'reservation-1',
  bookId: 'book-1',
  sourceVersionId: 'source-1',
  sourceKey: 'full',
  ownerId: 'teacher-1',
  operationKind: 'initial',
  storage: {
    bookId: 'book-1',
    sourceVersionId: 'source-1',
    storageLocationId: 'location-1',
    providerKind: 'b2',
    privateBucketId: 'bucket-1',
    providerObjectKey: 'private/book-1/source-1.pdf',
    providerFileId: 'file-1',
    providerFileVersionId: 'version-1',
    checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    byteSize: 10,
  },
  available,
});

const mapFor = (value: BookSourceRecoveryAuthority | undefined) => {
  const result = new Map<string, BookSourceRecoveryAuthority>();
  if (value) result.set(value.sourceVersionId, value);
  return result;
};

describe('Book Delivery recovery projection', () => {
  it('rebuilds an unavailable, read-denied projection without URL or entitlement fields', () => {
    const result = rebuildBookDeliveryRecoveryProjections({
      scopes,
      bindingIndexes,
      sourceAuthorities: mapFor(authority()),
      recoveryContext,
    });

    expect(result.report).toMatchObject({ rebuilt: 1, externallyMissing: 0, invalid: 0 });
    expect(result.projections[0]).toMatchObject({
      deliveryState: 'unavailable',
      readDenied: true,
      activation: 'held-for-reconciliation',
      recoveryOperationId: 'recovery-122',
    });
    expect(result.projections[0]).not.toHaveProperty('url');
    expect(result.projections[0]).not.toHaveProperty('viewerLink');
    expect(result.projections[0]).not.toHaveProperty('entitlement');
  });

  it('stages unavailable for missing or deleted Source authority and rejects owner/current mismatches', () => {
    const missing = rebuildBookDeliveryRecoveryProjections({
      scopes,
      bindingIndexes,
      sourceAuthorities: new Map(),
      recoveryContext,
    });
    expect(missing.report).toMatchObject({ rebuilt: 1, externallyMissing: 1 });
    expect(missing.projections[0]?.sourceStatuses[0]).toMatchObject({ available: false, reason: 'missing' });

    const deleted = validateBookDeliveryRecoveryRecord({
      record,
      current,
      sourceAuthorities: mapFor(authority(false)),
      recoveryContext,
    });
    expect(deleted.projection).toMatchObject({ deliveryState: 'unavailable', readDenied: true });
    expect(deleted.sourceAvailable).toBe(false);
    expect(deleted.projection?.sourceStatuses[0]).toMatchObject({ available: false, reason: 'deleted' });

    const wrongOwner = validateBookDeliveryRecoveryRecord({
      record,
      current,
      sourceAuthorities: mapFor({ ...authority(), ownerId: 'other-teacher' }),
      recoveryContext,
      expectedOwnerId: 'other-teacher',
    });
    expect(wrongOwner.projection).toBeNull();
    expect(wrongOwner.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized-owner' }),
    ]));

    const mismatchedSource = validateBookDeliveryRecoveryRecord({
      record,
      current,
      sourceAuthorities: mapFor({ ...authority(), bookId: 'other-book' }),
      recoveryContext,
    });
    expect(mismatchedSource.projection).toBeNull();
    expect(mismatchedSource.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-binding-mismatch' }),
    ]));

    const unpublished = {
      ...record,
      binding: {
        ...binding,
        book: { ...binding.book, publicationStatus: 'unpublished' },
      },
    } as never;
    const unpublishedResult = validateBookDeliveryRecoveryRecord({
      record: unpublished,
      current,
      sourceAuthorities: mapFor(authority()),
      recoveryContext,
    });
    expect(unpublishedResult.projection).toBeNull();
    expect(unpublishedResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-record' }),
    ]));

    const wrongCurrent = validateBookDeliveryRecoveryRecord({
      record,
      current: { ...current, bindingId: 'other-binding' },
      sourceAuthorities: mapFor(authority()),
      recoveryContext,
    });
    expect(wrongCurrent.projection).toBeNull();
    expect(wrongCurrent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'current-binding-mismatch' }),
    ]));

    const orphanCurrent = rebuildBookDeliveryRecoveryProjections({
      scopes: {
        'student-1': {
          'solo-binding-1': { current },
        },
      },
      bindingIndexes: {},
      sourceAuthorities: mapFor(authority()),
      recoveryContext,
    });
    expect(orphanCurrent.projections).toEqual([]);
    expect(orphanCurrent.report.invalid).toBeGreaterThan(0);
    expect(orphanCurrent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'current-binding-mismatch' }),
      expect.objectContaining({ code: 'source-binding-mismatch' }),
    ]));
  });

  it('uses durable projection keys for replay and conflicts, and gates the adapter phase', async () => {
    const store = new InMemoryBookDeliveryRecoveryProjectionStore();
    const adapter = createBookDeliveryRecoveryAdapter({ context: recoveryContext, store });
    const input = {
      scopes,
      bindingIndexes,
      sourceAuthorities: mapFor(authority()),
      expectedOwnerId: 'teacher-1',
    };
    expect((await adapter.rebuild(input)).report.rebuilt).toBe(1);
    expect((await adapter.rebuild(input)).report.skippedIdempotent).toBe(1);
    const projectionKey = 'recovery-122-binding-1-1';
    expect(store.read(projectionKey)).toMatchObject({ readDenied: true, deliveryState: 'unavailable' });
    await expect(store.readHold({ recipientId: 'student-1', contextId: 'solo-binding-1' }))
      .resolves.toMatchObject({ recoveryOperationId: 'recovery-122', readDenied: true });
    await expect(store.putIfAbsent({
      projectionKey,
      projection: { ...store.read(projectionKey)!, recordRevision: 2 },
    })).resolves.toBe('conflict');
    await expect(createBookDeliveryRecoveryAdapter({
      context: { ...recoveryContext, phase: 'reconciling' },
      store,
    }).rebuild(input)).rejects.toThrow('phase_denied');
  });
});
