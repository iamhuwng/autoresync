import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_SOLO_IMPACT_ADAPTER_DECLARATION,
  createBookSoloImpactAdapter,
} from './bookSoloImpactAdapter.service';
import type { BookImpactContextInput } from './bookImpactDiscovery.types';

type SoloContext = Extract<BookImpactContextInput, { readonly kind: 'solo' }>;

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

const context = (overrides: Partial<SoloContext> = {}): SoloContext => ({
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
    effectiveWindow: null,
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

type MatrixClassification = BookImpactContextInput['classification'];
type MatrixEffect = MatrixClassification['effects'][number];
type MatrixActivityDiff = MatrixClassification['activityDiff']['classification'];

const matrixClassification = (
  activityDiff: MatrixActivityDiff,
  effects: readonly MatrixEffect[],
  primaryEffect: MatrixEffect,
): MatrixClassification => {
  const requiresRedo = activityDiff === 'redo-required'
    || activityDiff === 'reordered'
    || activityDiff === 'unsupported'
    || effects.includes('unsupported');
  return {
    primaryEffect,
    effects,
    reasons: [`matrix-${primaryEffect}`],
    activityDiff: {
      classification: activityDiff,
      reasons: [`matrix-${activityDiff}`],
      requiresRedo: activityDiff === 'redo-required'
        || activityDiff === 'reordered'
        || activityDiff === 'unsupported',
    },
    requiresRedo,
    requiresRegrade: effects.includes('regrade'),
    requiresExplicitContextResolution: effects.includes('mapping-source-context')
      || effects.includes('invalidation'),
    requiresSuccessor: effects.includes('successor'),
  };
};

const classificationMatrix = [
  ['unchanged', matrixClassification('unchanged', ['unchanged'], 'unchanged')],
  ['display-only', matrixClassification('display-only', ['display-only'], 'display-only')],
  ['regrade', matrixClassification('regrade', ['regrade'], 'regrade')],
  ['redo-required', matrixClassification('redo-required', ['redo-required'], 'redo-required')],
  ['added', matrixClassification('added', ['added'], 'added')],
  ['removed', matrixClassification('removed', ['removed'], 'removed')],
  ['reordered', matrixClassification('reordered', ['reordered'], 'reordered')],
  ['presentation-context', matrixClassification(
    'presentation-context', ['mapping-source-context'], 'mapping-source-context',
  )],
  ['unsupported', matrixClassification('unsupported', ['unsupported'], 'unsupported')],
  ['moved', matrixClassification('unchanged', ['unchanged', 'moved'], 'moved')],
  ['successor', matrixClassification('unchanged', ['unchanged', 'successor'], 'successor')],
  ['invalidation', matrixClassification(
    'unchanged', ['unchanged', 'invalidation'], 'invalidation',
  )],
] as const;

const matrixContext = (
  base: BookImpactContextInput,
  label: string,
  nextClassification: MatrixClassification,
): BookImpactContextInput => {
  if (label !== 'invalidation') return { ...base, classification: nextClassification };
  const source = base.sources[0];
  const placement = base.placements[0];
  const sourceRef = placement?.sourceRefs[0];
  if (!source || !placement || !sourceRef) throw new Error('matrix fixture source missing');
  const invalidatedSource = { ...source, availability: 'invalidated' as const };
  const invalidatedSourceRef = { ...sourceRef, availability: 'invalidated' as const };
  return {
    ...base,
    classification: nextClassification,
    sources: [invalidatedSource],
    placements: [{
      ...placement,
      sourceRefs: [invalidatedSourceRef],
    }],
    replacement: [{
      sourceKey: invalidatedSource.sourceKey,
      fromSourceVersionId: invalidatedSource.sourceVersionId,
      toSourceVersionId: null,
      placementIds: [placement.placementId],
      mode: 'invalidation-only',
      ownerChoice: 'invalidate-context',
    }],
  };
};

describe('39B Solo impact adapter', () => {
  it('registers the read-only 39A declaration shape', () => {
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.contextKind).toBe('solo');
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.sourceReplacement.automaticUpdate).toBe(false);
    expect(BOOK_SOLO_IMPACT_ADAPTER_DECLARATION.output.fields).toEqual(['impact-summary']);
  });

  it.each(classificationMatrix)('projects valid 39A %s classification invariants', async (
    label,
    nextClassification,
  ) => {
    const candidate = matrixContext(context(), label, nextClassification);
    const result = await createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts: async () => ({ contexts: [candidate], complete: true as const }),
      },
    }).discover(query);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.impacts[0]?.classification.primaryEffect).toBe(nextClassification.primaryEffect);
      expect(result.impacts[0]?.classification.effects).toEqual(nextClassification.effects);
      expect(Object.isFrozen(result.impacts[0]?.classification)).toBe(true);
    }
  });

  it.each([
    ['primary effect', (base: MatrixClassification) => ({
      ...base,
      primaryEffect: 'redo-required' as const,
    })],
    ['activity effect', (base: MatrixClassification) => ({
      ...base,
      effects: ['moved' as const],
    })],
    ['redo flag', (base: MatrixClassification) => ({
      ...base,
      requiresRedo: true,
    })],
    ['invalidation source', () => matrixClassification(
      'unchanged', ['unchanged', 'invalidation'], 'invalidation',
    )],
  ])('fails closed for contradictory 39A %s classification', async (_label, mutate) => {
    const base = context();
    const candidate = {
      ...base,
      classification: mutate(matrixClassification('unchanged', ['unchanged'], 'unchanged')),
    };
    await expect(createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts: async () => ({ contexts: [candidate], complete: true as const }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
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

  it.each([
    ['not-started', 'active', []],
    ['in-progress', 'active', [{
      attemptId: 'attempt-1',
      attemptNumber: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      lifecycle: 'in-progress' as const,
      createdAt: '2026-08-01T00:30:00.000Z',
      completedAt: null,
    }]],
    ['submitted', 'active', [{
      attemptId: 'attempt-1',
      attemptNumber: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      lifecycle: 'submitted' as const,
      createdAt: '2026-08-01T00:30:00.000Z',
      completedAt: null,
    }]],
    ['completed', 'active', [{
      attemptId: 'attempt-1',
      attemptNumber: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      lifecycle: 'completed' as const,
      createdAt: '2026-08-01T00:30:00.000Z',
      completedAt: '2026-08-01T00:45:00.000Z',
    }]],
    ['in-progress', 'closed', [{
      attemptId: 'attempt-1',
      attemptNumber: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      lifecycle: 'in-progress' as const,
      createdAt: '2026-08-01T00:30:00.000Z',
      completedAt: null,
    }]],
    ['in-progress', 'archived', [{
      attemptId: 'attempt-1',
      attemptNumber: 1,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      lifecycle: 'in-progress' as const,
      createdAt: '2026-08-01T00:30:00.000Z',
      completedAt: null,
    }]],
  ])('accepts Solo lifecycle %s and status %s only with matching attempt state', async (lifecycle, status, attempts) => {
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
          contexts: [context({
            lifecycle: lifecycle as BookImpactContextInput['lifecycle'],
            status: status as BookImpactContextInput['status'],
            attempts,
          })],
          complete: true as const,
        }),
      },
    }).discover(query);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.impacts).toHaveLength(status === 'active' ? 1 : 0);
    }
  });

  it.each([
    ['false subset', ['placement-1']],
    ['false superset', ['placement-1', 'placement-3']],
    ['repeated placement', ['placement-1', 'placement-1']],
  ])('rejects Solo %s replacement placement set', async (_label, placementIds) => {
    const base = context();
    const first = base.placements[0];
    const second = {
      ...first,
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-2-v1',
      order: 1,
      sourceRefs: first.sourceRefs,
    };
    const invalid = {
      ...base,
      placements: [first, second],
      replacement: [{
        sourceKey: 'source-1',
        fromSourceVersionId: 'source-1-v1',
        toSourceVersionId: 'source-1-v2',
        placementIds,
        mode: 'owner-adopts-replacement' as const,
        ownerChoice: 'owner-adopts-replacement' as const,
      }],
    };
    await expect(createBookSoloImpactAdapter({
      reader: {
        authorize: async () => ({
          authorized: true as const,
          actorId: 'student-1',
          contextKind: 'solo' as const,
          ownerScope: 'actor-owned-solo' as const,
          maxContexts: 10,
        }),
        readOwnedContexts: async () => ({ contexts: [invalid], complete: true as const }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });
});
