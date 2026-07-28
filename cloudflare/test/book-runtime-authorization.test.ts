import { describe, expect, it, vi } from 'vitest';
import {
  authorizeRuntimeDraftRead,
  authorizeRuntimeCommand,
  soloOnlyBookRuntimeSchedulePolicy,
} from '../src/upload-worker/book-runtime/authorization.ts';
import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryBinding,
} from '../../src/services/book-delivery/bookDelivery.types.ts';

const binding = (overrides: Partial<BookDeliveryBinding> = {}): BookDeliveryBinding => ({
  schemaVersion: BOOK_DELIVERY_SCHEMA_VERSION,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    kind: 'solo',
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
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
    activityVersionId: 'activity-1-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'solo', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-27T00:00:00.000Z',
  ...overrides,
});

const command = () => ({
  operationId: '00000000-0000-4000-8000-000000000074',
  commandKind: 'autosave' as const,
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 0,
  response: { text: 'draft' },
});

describe('Ticket 28A runtime authorization and schedule policy', () => {
  it('accepts current schema-v3 bindings for draft reads and commands', async () => {
    await expect(authorizeRuntimeDraftRead(
      { uid: 'student-1' },
      {
        bindingId: 'binding-1',
        bindingRevision: 1,
        contextId: 'context-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
      binding(),
      '2026-07-27T00:00:00.000Z',
    )).resolves.toMatchObject({
      actorUid: 'student-1',
      operationKind: 'document',
      activityVersion: 1,
    });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      soloOnlyBookRuntimeSchedulePolicy,
    )).resolves.toMatchObject({ actorUid: 'student-1' });
  });

  it('keeps schema-v2 draft reads compatible but denies schema-v2 mutations', async () => {
    const legacy = { ...binding(), schemaVersion: 2 } as unknown as BookDeliveryBinding;
    await expect(authorizeRuntimeDraftRead(
      { uid: 'student-1' },
      {
        bindingId: 'binding-1',
        bindingRevision: 1,
        contextId: 'context-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
      legacy,
    )).resolves.toMatchObject({ operationKind: 'document' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      legacy,
      soloOnlyBookRuntimeSchedulePolicy,
    )).rejects.toMatchObject({ code: 'runtime_binding_unsupported' });
  });

  it('returns trusted context for current solo binding and forwards trusted clock to policy', async () => {
    const schedule = {
      authorize: vi.fn(() => ({ allowed: true })),
    };
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      schedule,
      '2026-07-27T00:00:00.000Z',
    )).resolves.toMatchObject({
      actorUid: 'student-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      now: '2026-07-27T00:00:00.000Z',
    });
    expect(schedule.authorize).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'autosave',
      now: '2026-07-27T00:00:00.000Z',
    }));
  });

  it('fails closed for preview, stale, revoked, future, cross-user, and forged placement bindings', async () => {
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding({ context: { ...binding().context, kind: 'preview', entitlementBasis: 'preview' } }),
    )).rejects.toMatchObject({ code: 'runtime_preview_read_only' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      { ...command(), bindingRevision: 99 },
      binding(),
    )).rejects.toMatchObject({ code: 'runtime_binding_stale' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding({ status: 'revoked' }),
    )).rejects.toMatchObject({ code: 'runtime_binding_not_active' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding({ context: { ...binding().context, kind: 'future_live', entitlementBasis: 'reserved' } }),
    )).rejects.toMatchObject({ code: 'runtime_future_live_denied' });
    await expect(authorizeRuntimeCommand(
      { uid: 'other-student' },
      command(),
      binding(),
    )).rejects.toMatchObject({ code: 'runtime_recipient_forbidden' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      { ...command(), placementId: 'placement-forged' },
      binding(),
    )).rejects.toMatchObject({ code: 'runtime_placement_not_found' });
  });

  it('makes unscheduled Solo explicit and Homework fail closed without registered policy', async () => {
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      soloOnlyBookRuntimeSchedulePolicy,
    )).resolves.toMatchObject({ actorUid: 'student-1' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding({ context: { ...binding().context, kind: 'homework', entitlementBasis: 'assignment' } }),
      soloOnlyBookRuntimeSchedulePolicy,
    )).rejects.toMatchObject({ code: 'runtime_schedule_policy_missing' });
  });
});
