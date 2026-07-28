import { describe, expect, it } from 'vitest';
import { createBookDeliveryBinding } from './bookDelivery.entitlementFactory';
import { BookDeliveryEntitlementLifecycle, BookDeliveryLifecycleError } from './bookDelivery.entitlementLifecycle';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';

const binding = (id = 'binding-1', revision = 1) => createBookDeliveryBinding({
  bindingId: id,
  revision,
  status: 'draft',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: {
    kind: 'solo',
    contextId: `solo-${id}`,
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
  publication: {
    bookId: 'book-pdf-1',
    bookMode: 'pdf',
    bookRevision: 3,
    publicationId: 'publication-1',
    publicationRevision: 4,
    publicationStatus: 'published',
    ownerId: 'teacher-1',
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
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
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v2',
      activityVersion: 2,
      nodeKey: 'unit-1',
      order: 1,
      contextMode: 'required',
      pageGroupKeys: ['group-1'],
      sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
    }],
    schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
  },
  createdAt: '2026-07-25T00:00:00.000Z',
});

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('Book Delivery entitlement lifecycle', () => {
  it('creates, activates, resolves, and rejects recipient-wide reads', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const lifecycle = new BookDeliveryEntitlementLifecycle({
      repository,
      authorizeIssuer: (value) => value.issuer.ownerId === 'teacher-1',
      authorizeRecipient: (recipientId) => recipientId === 'student-1',
    });
    const draft = await lifecycle.createDraft(binding(), operation(1), '2026-07-25T00:00:00.000Z');
    expect(draft.status).toBe('created');
    const active = await lifecycle.activate('binding-1', 0, operation(2), '2026-07-25T00:01:00.000Z');
    expect(active.status).toBe('activated');
    expect((await lifecycle.resolve('student-1', 'solo-binding-1'))?.record.status).toBe('active');
    await expect(lifecycle.resolve('other-student', 'solo-binding-1')).rejects.toMatchObject({ code: 'recipient-forbidden' });
  });

  it('uses immutable current-pointer CAS for supersession and revoke', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const lifecycle = new BookDeliveryEntitlementLifecycle({
      repository,
      authorizeIssuer: () => true,
    });
    await lifecycle.createDraft(binding(), operation(3), '2026-07-25T00:00:00.000Z');
    await lifecycle.activate('binding-1', 0, operation(4), '2026-07-25T00:01:00.000Z');
    const next = { ...binding('binding-2', 1), context: { ...binding('binding-2', 1).context, contextId: 'solo-binding-1' } };
    const superseded = await lifecycle.supersede(next, 'binding-1', operation(5), '2026-07-25T00:02:00.000Z');
    expect(superseded.status).toBe('superseded');
    expect((await repository.readBinding('binding-1'))?.status).toBe('revoked');
    expect((await repository.readCurrent('student-1', 'solo-binding-1'))?.bindingId).toBe('binding-2');
    const stale = await lifecycle.revoke('binding-1', 1, 'binding-1', operation(6), '2026-07-25T00:03:00.000Z');
    expect(stale.status).toBe('conflict');
  });

  it('rejects future-live and unsupported context activation', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const lifecycle = new BookDeliveryEntitlementLifecycle({ repository, authorizeIssuer: () => true });
    const future = binding();
    const invalid = { ...future, context: { ...future.context, kind: 'future_live', entitlementBasis: 'reserved' } } as never;
    await expect(lifecycle.createDraft(invalid, operation(7), '2026-07-25T00:00:00.000Z'))
      .rejects.toBeInstanceOf(BookDeliveryLifecycleError);
  });

  it('replays the same operation and rejects a conflicting replay', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const lifecycle = new BookDeliveryEntitlementLifecycle({ repository, authorizeIssuer: () => true });
    const value = binding();
    expect((await lifecycle.createDraft(value, operation(8), '2026-07-25T00:00:00.000Z')).status).toBe('created');
    expect((await lifecycle.createDraft(value, operation(8), '2026-07-25T00:00:00.000Z')).status).toBe('replayed');
    expect((await lifecycle.createDraft({ ...value, bindingId: 'other' }, operation(8), '2026-07-25T00:00:00.000Z')).status)
      .toBe('idempotency-conflict');
  });

  it('rejects malformed persisted input, binding collisions, and concurrent duplicate creates', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const lifecycle = new BookDeliveryEntitlementLifecycle({ repository, authorizeIssuer: () => true });
    const value = binding();
    const malformed = { ...value, context: { ...value.context, recipientId: 'other-student' } } as never;
    await expect(lifecycle.createDraft(malformed, operation(9), '2026-07-25T00:00:00.000Z'))
      .rejects.toMatchObject({ code: 'recipient-context-mismatch' });
    const results = await Promise.all([
      lifecycle.createDraft(value, operation(10), '2026-07-25T00:00:00.000Z'),
      lifecycle.createDraft(value, operation(11), '2026-07-25T00:00:00.000Z'),
    ]);
    expect(results.map((item) => item.status).sort()).toEqual(['conflict', 'created']);
    expect((await lifecycle.createDraft(value, operation(12), '2026-07-25T00:00:00.000Z')).status)
      .toBe('conflict');
  });
});
