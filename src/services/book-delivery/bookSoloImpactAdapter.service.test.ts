import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_SOLO_IMPACT_ADAPTER_DECLARATION,
  createBookSoloImpactAdapter,
} from './bookSoloImpactAdapter.service';
import type { BookImpactContextInput } from './bookImpactDiscovery.types';

const classification = () => ({
  primaryEffect: 'mapping-source-context' as const,
  effects: ['mapping-source-context' as const, 'display-only' as const],
  reasons: ['mapping-or-source-context'],
  activityDiff: {
    classification: 'display-only' as const,
    reasons: [],
    requiresRedo: false,
  },
  requiresRedo: false,
  requiresRegrade: false,
  requiresExplicitContextResolution: true,
  requiresSuccessor: false,
});

const context = (overrides: Partial<BookImpactContextInput> = {}): BookImpactContextInput => ({
  contextId: 'solo-context-1',
  kind: 'solo',
  ownerId: 'student-1',
  recipientId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  status: 'active',
  lifecycle: 'not-started',
  bookId: 'book-1',
  bookRevision: 1,
  publicationId: 'publication-1',
  publicationRevision: 1,
  effectiveWindow: null,
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-1-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 0,
    sourceRefs: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-1-v1',
      availability: 'available',
      pages: [1, 2],
    }],
  }],
  attempts: [],
  sources: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-1-v1',
    availability: 'available',
    pages: [1, 2],
  }],
  classification: classification(),
  replacement: [],
  observedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const query = {
  actorId: 'student-1',
  evaluatedAt: '2026-08-01T01:00:00.000Z',
};

describe('39B Solo impact adapter', () => {
  it('registers the read-only 39A declaration shape', () => {
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.contextKind).toBe('solo');
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.sourceReplacement.automaticUpdate).toBe(false);
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.output.fields).toEqual(['impact-summary']);
  });

  it('authorizes before reading and returns only active actor-owned contexts', async () => {
    const authorize = vi.fn(async () => ({
      authorized: true as const,
      actorId: 'student-1',
      contextKind: 'solo' as const,
      ownerScope: 'actor-owned-solo' as const,
      maxContexts: 10,
    }));
    const readOwnedContexts = vi.fn(async () => ({
      contexts: [
        context(),
        context({
          contextId: 'closed-context',
          bindingId: 'closed-context-binding-1',
          status: 'closed',
        }),
      ],
      complete: true as const,
    }));
    const result = await createBookSoloImpactAdapter({ reader: { authorize, readOwnedContexts } }).discover(query);
    expect(authorize).toHaveBeenCalledBefore(readOwnedContexts);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.impacts.map((impact) => impact.contextId)).toEqual(['solo-context-1']);
      expect(result.impacts.every((impact) => impact.status === 'active')).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.impacts[0])).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/answer|pdf|credential|privateObjectKey/iu);
    }
  });

  it('fails closed without materializing another owner', async () => {
    const readOwnedContexts = vi.fn(async () => ({
      contexts: [context({ ownerId: 'student-2' })],
      complete: true as const,
    }));
    const result = await createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts,
      },
    }).discover(query);
    expect(result).toMatchObject({ status: 'blocked', code: 'cross-owner' });
  });

  it('fails closed when two records reuse one immutable binding', async () => {
    const result = await createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts: async () => ({
          contexts: [
            context(),
            context({ contextId: 'solo-context-2' }),
          ],
          complete: true as const,
        }),
      },
    }).discover(query);
    expect(result).toMatchObject({ status: 'blocked', code: 'ambiguous' });
  });

  it('denies before the repository read when authorization is uncertain', async () => {
    const readOwnedContexts = vi.fn(async () => ({
      contexts: [context()],
      complete: true as const,
    }));
    const result = await createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({ authorized: false as const, code: 'uncertain' as const }),
        readOwnedContexts,
      },
    }).discover(query);
    expect(result).toMatchObject({ status: 'blocked', code: 'uncertain' });
    expect(readOwnedContexts).not.toHaveBeenCalled();
  });

  it('fails closed when the bounded owner page does not prove completeness', async () => {
    const result = await createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts: async () => ({ contexts: [], complete: false } as never),
      },
    }).discover(query);
    expect(result).toMatchObject({ status: 'blocked', code: 'unbounded' });
  });

  it('rejects sensitive payloads and unbounded reads', async () => {
    const baseReader = {
      authorize: async () => ({
        authorized: true as const,
        actorId: 'student-1',
        contextKind: 'solo' as const,
        ownerScope: 'actor-owned-solo' as const,
        maxContexts: 10,
      }),
      readOwnedContexts: async () => ({
        contexts: [context({
          sources: [{
            sourceKey: 'source-1',
            sourceVersionId: 'source-1-v1',
            availability: 'available',
            pages: [1, 2],
            answerKey: 'must-not-cross-boundary',
          } as never],
        })],
        complete: true as const,
      }),
    };
    await expect(createBookSoloImpactAdapter({ reader: baseReader }).discover({ ...query, limit: 101 }))
      .resolves.toMatchObject({ status: 'blocked', code: 'unbounded' });
    await expect(createBookSoloImpactAdapter({ reader: baseReader }).discover(query))
      .resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });
});
