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
import type { BookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import { createBookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import { resolveBookScheduleWindow } from '../../src/services/book-delivery/bookScheduleWindow.service.ts';

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
    manifestVersionId: 'manifest-1',
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

const scheduleAuthority = (
  authorityRevision = 1,
  policyRevision = 1,
): BookRuntimeScheduleAuthority => ({
  ...createBookRuntimeScheduleAuthority(resolveBookScheduleWindow({
    assignmentId: 'context-1',
    recipientId: 'student-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    operation: 'autosave',
    schedule: {
      schemaVersion: 1,
      resolverVersion: 1,
      availableFrom: '2026-07-26T00:00:00.000Z',
      finalDueAt: '2026-07-28T00:00:00.000Z',
      scheduleRules: [],
    },
    outline: binding().outline,
    studentExtensions: {},
    lateSubmissionAllowed: false,
    maxAttempts: 2,
    attemptsUsed: 0,
    policyRevision,
    authorityRevision,
    evaluatedAt: '2026-07-27T00:00:00.000Z',
  })),
});

const resolveTarget = () => true;

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
      soloOnlyBookRuntimeSchedulePolicy,
      '2026-07-27T00:00:00.000Z',
      resolveTarget,
    )).resolves.toMatchObject({
      actorUid: 'student-1',
      operationKind: 'state',
      activityVersion: 1,
    });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      soloOnlyBookRuntimeSchedulePolicy,
      undefined,
      resolveTarget,
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
      soloOnlyBookRuntimeSchedulePolicy,
      undefined,
      resolveTarget,
    )).resolves.toMatchObject({ operationKind: 'state' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      legacy,
      soloOnlyBookRuntimeSchedulePolicy,
    )).rejects.toMatchObject({ code: 'runtime_binding_unsupported' });
  });

  it('returns trusted context for current solo binding and forwards trusted clock to policy', async () => {
    const schedule = {
      authorize: vi.fn(() => ({ outcome: 'allowed' as const })),
    };
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      schedule,
      '2026-07-27T00:00:00.000Z',
      resolveTarget,
    )).resolves.toMatchObject({
      actorUid: 'student-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      now: '2026-07-27T00:00:00.000Z',
    });
    expect(schedule.authorize).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'autosave',
      actorUid: 'student-1',
      target: {
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
      now: '2026-07-27T00:00:00.000Z',
    }));
  });

  it('forwards the exact validated target so one Homework binding can decide Activities independently', async () => {
    const secondPlacement = {
      ...binding().placements[0]!,
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-2-v1',
      nodeKey: 'unit-2',
      order: 2,
    };
    const homework = binding({
      scope: {
        kind: 'placements',
        nodeKeys: [],
        placementIds: ['placement-1', 'placement-2'],
      },
      outline: [
        ...binding().outline,
        { nodeKey: 'unit-2', parentNodeKey: null, nodeType: 'unit', order: 2 },
      ],
      context: {
        ...binding().context,
        kind: 'homework',
        entitlementBasis: 'assignment',
      },
      placements: [...binding().placements, secondPlacement],
      schedulePolicy: {
        policyId: 'homework-policy',
        policyRevision: 1,
        basis: 'immutable-reference',
      },
    });
    const schedule = {
      authorize: vi.fn((input: { readonly target: { readonly placementId: string } }) => (
        input.target.placementId === 'placement-1'
          ? { outcome: 'allowed' as const, authority: scheduleAuthority() }
          : { outcome: 'denied' as const, code: 'runtime_activity_unreleased' }
      )),
      revalidate: vi.fn(() => ({
        outcome: 'allowed' as const,
        authority: scheduleAuthority(),
      })),
    };
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      homework,
      schedule,
      undefined,
      resolveTarget,
    )).resolves.toMatchObject({
      placementId: 'placement-1',
      scheduleAuthority: { authorityRevision: 1 },
    });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      {
        ...command(),
        placementId: 'placement-2',
        activityId: 'activity-2',
      },
      homework,
      schedule,
      undefined,
      resolveTarget,
    )).rejects.toMatchObject({
      code: 'runtime_activity_unreleased',
      status: 403,
    });
    expect(schedule.authorize).toHaveBeenLastCalledWith(expect.objectContaining({
      target: expect.objectContaining({
        placementId: 'placement-2',
        activityId: 'activity-2',
      }),
    }));
  });

  it('enforces schedule policy for draft state reads and preserves current authority on conflicts', async () => {
    const homework = binding({
      context: {
        ...binding().context,
        kind: 'homework',
        entitlementBasis: 'assignment',
      },
      schedulePolicy: {
        policyId: 'homework-policy',
        policyRevision: 1,
        basis: 'immutable-reference',
      },
    });
    const denied = {
      authorize: vi.fn(() => ({
        outcome: 'conflict' as const,
        code: 'runtime_schedule_authority_stale',
        authority: scheduleAuthority(2),
      })),
      revalidate: vi.fn(),
    };
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
      homework,
      denied,
      '2026-07-27T00:00:00.000Z',
      resolveTarget,
    )).rejects.toMatchObject({
      code: 'runtime_schedule_authority_stale',
      status: 409,
      currentScheduleAuthority: { authorityRevision: 2 },
    });
    expect(denied.authorize).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'state',
      target: expect.objectContaining({ placementId: 'placement-1' }),
    }));
  });

  it('rejects an authority decision that is not pinned to the binding policy revision', async () => {
    const homework = binding({
      context: {
        ...binding().context,
        kind: 'homework',
        entitlementBasis: 'assignment',
      },
      schedulePolicy: {
        policyId: 'homework-policy',
        policyRevision: 1,
        basis: 'immutable-reference',
      },
    });
    const stalePolicy = {
      authorize: vi.fn(() => ({
        outcome: 'allowed' as const,
        authority: scheduleAuthority(1, 2),
      })),
      revalidate: vi.fn(),
    };
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      homework,
      stalePolicy,
      undefined,
      resolveTarget,
    )).rejects.toMatchObject({
      code: 'runtime_schedule_policy_stale',
      status: 409,
      currentScheduleAuthority: { policyRevision: 2 },
    });
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
      undefined,
      resolveTarget,
    )).resolves.toMatchObject({ actorUid: 'student-1' });
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding({ context: { ...binding().context, kind: 'homework', entitlementBasis: 'assignment' } }),
      soloOnlyBookRuntimeSchedulePolicy,
      undefined,
      resolveTarget,
    )).rejects.toMatchObject({ code: 'runtime_schedule_policy_missing' });
  });

  it('resolves the exact Interaction before schedule policy evaluation', async () => {
    const schedule = {
      authorize: vi.fn(() => ({ outcome: 'allowed' as const })),
    };
    const resolver = vi.fn(() => false);
    await expect(authorizeRuntimeCommand(
      { uid: 'student-1' },
      command(),
      binding(),
      schedule,
      '2026-07-27T00:00:00.000Z',
      resolver,
    )).rejects.toMatchObject({
      code: 'runtime_interaction_not_found',
      status: 404,
    });
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({
      actorUid: 'student-1',
      target: {
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
    }));
    expect(schedule.authorize).not.toHaveBeenCalled();
  });
});
