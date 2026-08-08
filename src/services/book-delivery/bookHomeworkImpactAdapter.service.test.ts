import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION,
  createBookHomeworkImpactAdapter,
} from './bookHomeworkImpactAdapter.service';
import type { BookImpactContextInput } from './bookImpactDiscovery.types';

type HomeworkContext = Extract<BookImpactContextInput, { readonly kind: 'homework' }>;

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

const context = (overrides: Partial<HomeworkContext> = {}): HomeworkContext => ({
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
    release: {
      source: 'assignment',
      nodeKey: null,
      at: '2026-08-01T00:00:00.000Z',
    },
    deadline: {
      source: 'assignment',
      nodeKey: null,
      at: '2026-08-02T00:00:00.000Z',
    },
    extensionRevision: null,
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
    effectiveWindow: {
      availableFrom: '2026-08-01T00:00:00.000Z',
      dueAt: '2026-08-02T00:00:00.000Z',
      extensionDueAt: null,
      winner: 'assignment',
      release: {
        source: 'assignment',
        nodeKey: null,
        at: '2026-08-01T00:00:00.000Z',
      },
      deadline: {
        source: 'assignment',
        nodeKey: null,
        at: '2026-08-02T00:00:00.000Z',
      },
      extensionRevision: null,
      policyRevision: 2,
      authorityRevision: 3,
    },
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

describe('39B uploader-owned Homework impact adapter', () => {
  it('registers only the versioned 39A declaration', () => {
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.contextKind).toBe('homework');
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.output.fields).toEqual(['impact-summary']);
    expect(BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION.sourceReplacement.automaticUpdate).toBe(false);
  });

  it.each(classificationMatrix)('projects valid 39A %s classification invariants', async (
    label,
    nextClassification,
  ) => {
    const candidate = matrixContext(context(), label, nextClassification);
    const result = await createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
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
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
        readOwnedContexts: async () => ({ contexts: [candidate], complete: true as const }),
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
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

  it('preserves distinct inherited, final-assignment, and recipient-extension windows', async () => {
    const assignmentWindow = context().placements[0].effectiveWindow;
    if (assignmentWindow === null) throw new Error('fixture window missing');
    const ancestorWindow = {
      ...assignmentWindow,
      availableFrom: '2026-08-01T01:00:00.000Z',
      winner: 'node' as const,
      release: {
        source: 'ancestor' as const,
        nodeKey: 'unit-ancestor',
        at: '2026-08-01T01:00:00.000Z',
      },
      deadline: {
        source: 'ancestor' as const,
        nodeKey: 'unit-ancestor',
        at: '2026-08-02T00:00:00.000Z',
      },
    };
    const extensionWindow = {
      ...assignmentWindow,
      dueAt: '2026-08-03T00:00:00.000Z',
      extensionDueAt: '2026-08-03T00:00:00.000Z',
      winner: 'student-extension' as const,
      deadline: {
        source: 'student-extension' as const,
        nodeKey: 'unit-child',
        at: '2026-08-03T00:00:00.000Z',
      },
      extensionRevision: 4,
    };
    const first = context().placements[0];
    const records = {
      ...context(),
      placements: [
        { ...first, effectiveWindow: assignmentWindow },
        {
          ...first,
          placementId: 'placement-2',
          activityId: 'activity-2',
          activityVersionId: 'activity-2-v3',
          nodeKey: 'unit-ancestor',
          order: 1,
          effectiveWindow: ancestorWindow,
          sourceRefs: [{
            sourceKey: 'source-2',
            sourceVersionId: 'source-2-v1',
            availability: 'available' as const,
            pages: [4, 5],
          }],
        },
        {
          ...first,
          placementId: 'placement-3',
          activityId: 'activity-3',
          activityVersionId: 'activity-3-v3',
          nodeKey: 'unit-child',
          order: 2,
          effectiveWindow: extensionWindow,
          sourceRefs: [{
            sourceKey: 'source-3',
            sourceVersionId: 'source-3-v1',
            availability: 'available' as const,
            pages: [6],
          }],
        },
      ],
      sources: [
        context().sources[0],
        { sourceKey: 'source-2', sourceVersionId: 'source-2-v1', availability: 'available' as const, pages: [4, 5] },
        { sourceKey: 'source-3', sourceVersionId: 'source-3-v1', availability: 'available' as const, pages: [6] },
      ],
      replacement: [],
    };
    const result = await createBookHomeworkImpactAdapter({
      reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [records], complete: true as const }) },
    }).discover(query);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.impacts[0]?.placements.map((placement) => placement.effectiveWindow?.deadline.source))
        .toEqual(['assignment', 'ancestor', 'student-extension']);
      expect(result.impacts[0]?.placements[2]?.effectiveWindow?.extensionRevision).toBe(4);
    }
  });

  it.each([
    ['winner', (window: NonNullable<BookImpactContextInput['effectiveWindow']>) => ({
      ...window,
      winner: 'node' as const,
    })],
    ['deadline authority time', (window: NonNullable<BookImpactContextInput['effectiveWindow']>) => ({
      ...window,
      deadline: { ...window.deadline, at: '2026-08-04T00:00:00.000Z' },
    })],
    ['extension due time', (window: NonNullable<BookImpactContextInput['effectiveWindow']>) => ({
      ...window,
      extensionDueAt: '2026-08-03T00:00:00.000Z',
    })],
    ['extension revision', (window: NonNullable<BookImpactContextInput['effectiveWindow']>) => ({
      ...window,
      extensionRevision: 4,
    })],
  ])('rejects noncanonical %s schedule authority on context and placement', async (_label, mutate) => {
    const base = context();
    const window = base.effectiveWindow;
    const first = base.placements[0];
    if (window === null || first === undefined) throw new Error('fixture window missing');
    const invalidWindow = mutate(window);
    for (const candidate of [
      { ...base, effectiveWindow: invalidWindow },
      { ...base, placements: [{ ...first, effectiveWindow: invalidWindow }] },
    ]) {
      await expect(createBookHomeworkImpactAdapter({
        reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [candidate], complete: true as const }) },
      }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
    }
  });

  it.each([
    ['false subset', ['placement-1']],
    ['false superset', ['placement-1', 'placement-3']],
    ['repeated placement', ['placement-1', 'placement-1']],
  ])('rejects %s replacement scope before projection', async (_label, placementIds) => {
    const base = context();
    const first = base.placements[0];
    const second = {
      ...first,
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-2-v3',
      order: 1,
      sourceRefs: first.sourceRefs.map((source) => ({ ...source, pages: [...source.pages] })),
    };
    const invalid = {
      ...base,
      placements: [first, second],
      replacement: [{ ...base.replacement[0], placementIds }],
    };
    await expect(createBookHomeworkImpactAdapter({
      reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [invalid], complete: true as const }) },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('requires a complete source breadth for repeated placements', async () => {
    const base = context();
    const first = base.placements[0];
    const second = {
      ...first,
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-2-v3',
      order: 1,
      sourceRefs: first.sourceRefs.map((source) => ({ ...source, pages: [...source.pages] })),
    };
    const valid = {
      ...base,
      placements: [first, second],
      replacement: [{ ...base.replacement[0], placementIds: ['placement-1', 'placement-2'] }],
    };
    const result = await createBookHomeworkImpactAdapter({
      reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [valid], complete: true as const }) },
    }).discover(query);
    expect(result).toMatchObject({
      status: 'ok',
      replacementScopes: [{ placementIds: ['placement-1', 'placement-2'] }],
    });
  });

  it('keeps broad source replacement scopes exact per source version', async () => {
    const base = context();
    const first = base.placements[0];
    const second = {
      ...first,
      placementId: 'placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-2-v3',
      order: 1,
      sourceRefs: first.sourceRefs.map((source) => ({ ...source, pages: [...source.pages] })),
    };
    const third = {
      ...first,
      placementId: 'placement-3',
      activityId: 'activity-3',
      activityVersionId: 'activity-3-v3',
      order: 2,
      sourceRefs: [{
        sourceKey: 'source-2',
        sourceVersionId: 'source-2-v1',
        availability: 'available' as const,
        pages: [4],
      }],
    };
    const broad = {
      ...base,
      placements: [first, second, third],
      sources: [
        ...base.sources,
        { sourceKey: 'source-2', sourceVersionId: 'source-2-v1', availability: 'available' as const, pages: [4] },
      ],
      replacement: [
        { ...base.replacement[0], placementIds: ['placement-1', 'placement-2'] },
        {
          sourceKey: 'source-2',
          fromSourceVersionId: 'source-2-v1',
          toSourceVersionId: 'source-2-v2',
          placementIds: ['placement-3'],
          mode: 'owner-adopts-replacement' as const,
          ownerChoice: 'owner-adopts-replacement' as const,
        },
      ],
    };
    const result = await createBookHomeworkImpactAdapter({
      reader: { authorize: authority, readOwnedContexts: async () => ({ contexts: [broad], complete: true as const }) },
    }).discover(query);
    expect(result).toMatchObject({
      status: 'ok',
      replacementScopes: [
        { sourceKey: 'source-1', placementIds: ['placement-1', 'placement-2'] },
        { sourceKey: 'source-2', placementIds: ['placement-3'] },
      ],
    });
  });

  it.each([
    ['not-started', 'active', []],
    ['in-progress', 'active', context().attempts],
    ['submitted', 'active', [{ ...context().attempts[0], lifecycle: 'submitted' as const }]],
    ['completed', 'active', [{
      ...context().attempts[0],
      lifecycle: 'completed' as const,
      completedAt: '2026-08-01T02:00:00.000Z',
    }]],
    ['in-progress', 'closed', context().attempts],
    ['in-progress', 'archived', context().attempts],
  ])('handles lifecycle %s and status %s without exposing closed rows', async (lifecycle, status, attempts) => {
    const result = await createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
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

  it('maps missing reads to a fail-closed result', async () => {
    await expect(createBookHomeworkImpactAdapter({
      reader: {
        authorize: authority,
        readOwnedContexts: async () => { throw new Error('index unavailable'); },
      },
    }).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'missing' });
  });
});
