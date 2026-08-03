import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION,
  createBookHomeworkImpactAdapter,
} from './bookHomeworkImpactAdapter.service';
import type { BookImpactContextInput } from './bookImpactDiscovery.types';

const classification = () => ({
  primaryEffect: 'redo-required' as const,
  effects: ['redo-required' as const],
  reasons: ['activity-structure-changed'],
  activityDiff: {
    classification: 'redo-required' as const,
    reasons: ['activity-structure-changed'],
    requiresRedo: true,
  },
  requiresRedo: true,
  requiresRegrade: false,
  requiresExplicitContextResolution: false,
  requiresSuccessor: false,
});

const context = (overrides: Partial<BookImpactContextInput> = {}): BookImpactContextInput => ({
  contextId: 'assignment-1--student-1',
  kind: 'homework',
  ownerId: 'teacher-1',
  recipientId: 'student-1',
  bindingId: 'assignment-1--student-1--delivery',
  bindingRevision: 2,
  status: 'active',
  lifecycle: 'in-progress',
  bookId: 'book-1',
  bookRevision: 3,
  publicationId: 'publication-1',
  publicationRevision: 4,
  effectiveWindow: {
    availableFrom: '2026-08-01T00:00:00.000Z',
    dueAt: '2026-08-02T00:00:00.000Z',
    extensionDueAt: null,
    winner: 'assignment',
    policyRevision: 2,
    authorityRevision: 3,
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-1-v3',
    activityVersion: 3,
    nodeKey: 'unit-1',
    order: 0,
    sourceRefs: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-1-v2',
      availability: 'available',
      pages: [1, 2, 3],
    }],
  }],
  attempts: [{
    attemptId: 'attempt-1',
    attemptNumber: 1,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-1-v3',
    lifecycle: 'in-progress',
    createdAt: '2026-08-01T01:00:00.000Z',
    completedAt: null,
  }],
  sources: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-1-v2',
    availability: 'available',
    pages: [1, 2, 3],
  }],
  classification: classification(),
  replacement: [{
    sourceKey: 'source-1',
    fromSourceVersionId: 'source-1-v2',
    toSourceVersionId: 'source-1-v3',
    placementIds: ['placement-1'],
    mode: 'owner-adopts-replacement',
    ownerChoice: 'owner-adopts-replacement',
  }],
  observedAt: '2026-08-01T02:00:00.000Z',
  ...overrides,
});

const query = {
  actorId: 'teacher-1',
  evaluatedAt: '2026-08-01T03:00:00.000Z',
};

const authority = async () => ({
  authorized: true as const,
  actorId: 'teacher-1',
  contextKind: 'homework' as const,
  ownerScope: 'uploader-owned-homework' as const,
  maxContexts: 20,
});

describe('39B uploader-owned Homework impact adapter', () => {
  it('registers only the versioned 39A declaration', () => {
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.contextKind).toBe('homework');
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.output.fields).toEqual(['impact-summary']);
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.sourceReplacement.automaticUpdate).toBe(false);
  });

  it('authorizes first, returns complete active recipient bindings, and groups replacement scope', async () => {
    const authorize = vi.fn(authority);
    const readOwnedContexts = vi.fn(async () => ({
      contexts: [
        context(),
        context({
          contextId: 'closed-assignment--student-1',
          bindingId: 'closed-assignment--student-1--delivery',
          status: 'closed',
        }),
      ],
      complete: true as const,
    }));
    const result = await createBookHomeworkImpactAdapter({ reader: { authorize, readOwnedContexts } }).discover(query);
    expect(authorize).toHaveBeenCalledBefore(readOwnedContexts);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.impacts).toHaveLength(1);
      expect(result.impacts[0]).toMatchObject({
        contextId: 'assignment-1--student-1',
        recipientId: 'student-1',
        effectiveWindow: { dueAt: '2026-08-02T00:00:00.000Z' },
        attempts: [{ activityVersionId: 'activity-1-v3' }],
      });
      expect(result.replacementScopes).toEqual([expect.objectContaining({
        contextIds: ['assignment-1--student-1'],
        ownerIds: ['teacher-1'],
        placementIds: ['placement-1'],
        automaticUpdate: false,
      })]);
      expect(Object.isFrozen(result.impacts[0])).toBe(true);
    }
  });

  it('fails closed for cross-owner, stale, and ambiguous records', async () => {
    const reader = {
      authorize: authority,
      readOwnedContexts: async () => ({ contexts: [context({ ownerId: 'teacher-2' })], complete: true as const }),
    };
    await expect(createBookHomeworkImpactAdapter({ reader }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'cross-owner' });
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
        readOwnedContexts: async () => ({
          contexts: [context({ observedAt: '2026-08-01T04:00:00.000Z' })],
          complete: true as const,
        }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'stale' });
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
        readOwnedContexts: async () => ({
          contexts: [
            context(),
            context({ contextId: 'other-context', bindingId: 'assignment-1--student-1--delivery' }),
          ],
          complete: true as const,
        }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'ambiguous' });
  });

  it('does not read after denied authorization and rejects sensitive payloads', async () => {
    const readOwnedContexts = vi.fn(async () => ({ contexts: [context()], complete: true as const }));
    const denied = await createBookHomeworkImpactAdapter({
      reader: {
        authorize: async () => ({ authorized: false as const, code: 'unauthorized' as const }),
        readOwnedContexts,
      },
    }).discover(query);
    expect(denied).toMatchObject({ status: 'blocked', code: 'unauthorized' });
    expect(readOwnedContexts).not.toHaveBeenCalled();
    const sensitive = structuredClone(context()) as any;
    sensitive.sources[0].privateObjectKey = 'never-expose';
    await expect(createBookHomeworkImpactAdapter({
      reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [sensitive], complete: true as const }) },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('fails closed when a bounded owner page is marked incomplete', async () => {
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
        readOwnedContexts: async () => ({ contexts: [], complete: false } as never),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'unbounded' });
  });
});
