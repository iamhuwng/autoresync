import { describe, expect, it, vi } from 'vitest';
import type { ReplacementPlanRepository, ReplacementPlanRevisionAuthority } from '../replacement-plans/contract.ts';
import type { ReplacementPlanRecord, ReplacementPlanReviewRecord, ReplacementTokenRecord } from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import type { ReplacementSagaDependencies, ReplacementSagaRecord } from './contract.ts';
import { InMemoryReplacementSagaLedger } from './repository.ts';
import { createReplacementSagaService } from './service.ts';

const hash = (character: string) => ({ d: 'd', s: 'e', p: 'f', a: 'a', r: 'b', v: 'c', q: '9', x: '8' }[character] ?? '0').repeat(64);
const now = '2026-08-11T04:00:00.000Z';
const token = 'a'.repeat(43);

const plan = (): ReplacementPlanRecord => ({
  schemaVersion: 1,
  planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1',
  bookRevision: 2, publicationRevision: 3, sourceSetRevision: 4, targetSourceSetRevision: 5,
  sourceVersionRevisions: { old: 1 },
  sourceSetDelta: {
    schemaVersion: 1, fingerprint: hash('d'),
    old: { sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'old', sourceOrder: 1 }] }, sources: [{ sourceKey: 'full', sourceVersionId: 'old', sourceOrder: 1, label: 'Old', rotation: 0, physicalPageCount: 1, bounds: { width: 1, height: 1 }, pageGroups: [] }] },
    next: { sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'new', sourceOrder: 1 }] }, sources: [{ sourceKey: 'full', sourceVersionId: 'new', sourceOrder: 1, label: 'New', rotation: 0, physicalPageCount: 1, bounds: { width: 1, height: 1 }, pageGroups: [] }] },
    mappings: [],
  },
  deltaFingerprint: hash('d'), impactSnapshotId: 'snapshot-1', impactSnapshotFingerprint: hash('s'),
  impactSnapshotRevisionVector: { old: 1 },
  impactSnapshotExpiresAt: '2026-08-11T05:00:00.000Z', adapters: [{ contextKind: 'homework', adapterId: 'adapter', adapterVersion: 1, contractVersion: 1 }],
  contexts: [{ contextKey: 'homework:hw-1', contextKind: 'homework', classification: 'replaced', effects: ['replaced'], reasons: ['source'], lifecycle: 'in-progress', status: 'active', sourceScopes: [{ sourceKey: 'full', pageCount: 1, placementCount: 1 }], activityCount: 1, placementCount: 1, checkpointCount: 0, notificationCount: 0 }],
  selectedContextKeys: [], capacity: { current: { trackedAccountBytes: 1, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 1, projected: 2, limit: 9_000_000_000, available: true },
  reviewState: 'unreviewed', createdAt: now, expiresAt: '2026-08-11T05:00:00.000Z', planFingerprint: hash('p'),
});

const review = (): ReplacementPlanReviewRecord => ({ schemaVersion: 1, reviewId: 'review-1', planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1', planFingerprint: hash('p'), deltaFingerprint: hash('d'), snapshotFingerprint: hash('s'), revisionVector: { old: 1 }, reviewedAt: now, expiresAt: '2026-08-11T05:00:00.000Z', state: 'reviewed' });
const stored = async (): Promise<ReplacementTokenRecord> => ({ schemaVersion: 1, tokenHash: await (async () => { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); })(), purpose: 'replacement-confirmation', ownerId: 'teacher-1', bookId: 'book-1', planId: 'plan-1', reviewId: 'review-1', planFingerprint: hash('p'), deltaFingerprint: hash('d'), snapshotFingerprint: hash('s'), revisionVector: { old: 1 }, adapterFingerprint: hash('a'), issuedAt: now, expiresAt: '2026-08-11T05:00:00.000Z' });

const makeDependencies = async (overrides: Partial<ReplacementSagaDependencies> = {}): Promise<ReplacementSagaDependencies> => {
  const currentPlan = plan();
  const currentReview = review();
  const currentToken = await stored();
  const plans: ReplacementPlanRepository = {
    createPlan: vi.fn(), readPlan: vi.fn(async () => currentPlan), readCurrent: vi.fn(async () => ({ status: 'ready' as const, plan: currentPlan, pointer: { planId: currentPlan.planId, planFingerprint: currentPlan.planFingerprint, ownerId: currentPlan.ownerId, bookId: currentPlan.bookId, status: 'current' as const, updatedAt: now } })),
    saveReview: vi.fn(), readReview: vi.fn(async () => currentReview), cancel: vi.fn(), saveToken: vi.fn(), readToken: vi.fn(async () => currentToken), invalidateTokens: vi.fn(),
  };
  const revisions: ReplacementPlanRevisionAuthority = { read: vi.fn(async () => ({ revisionVector: { values: { old: 1 } }, currentRevisions: { bookRevision: 2, publicationRevision: 3, sourceSetRevision: 4, sourceVersionRevisions: { old: 1 } }, adapterFingerprint: hash('a') })) };
  const prepare = vi.fn(async () => ({ status: 'prepared' as const, receipt: hash('r') }));
  const publish = vi.fn(async () => ({ status: 'visible' as const, receipt: hash('v'), visibleAt: now }));
  const adoptAndRevoke = vi.fn(async () => ({ status: 'adopted' as const, allRetiredDeliveriesRevoked: true }));
  const enqueueExactDeletion = vi.fn(async () => ({ status: 'queued' as const }));
  return {
    plans, revisions, ledger: new InMemoryReplacementSagaLedger(),
    visibility: { prepare, publish, rollbackStaged: vi.fn(async () => ({ status: 'rolled-back' as const })) },
    contexts: { adoptAndRevoke }, retiredBytes: { enqueueExactDeletion }, enabled: true, now: () => new Date(now), newId: () => 'saga-1',
    ...overrides,
  } as ReplacementSagaDependencies;
};

const input = { ownerId: 'teacher-1', bookId: 'book-1', planId: 'plan-1', reviewId: 'review-1', confirmationToken: token, idempotencyKey: 'replacement-1' };

describe('#116 durable replacement saga', () => {
  it('runs one visible replacement, delegates #117, then queues a metadata-only #119 handoff', async () => {
    const dependencies = await makeDependencies();
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result.status).toBe('awaiting-retired-byte-deletion');
    if (result.status === 'blocked' || result.status === 'pending') throw new Error('unexpected result');
    expect(result.saga.state).toBe('awaiting-retired-byte-deletion');
    expect(result.saga.stateRevision).toBe(6);
    expect(result.saga.contexts['homework:hw-1']?.state).toBe('retired-revoked');
    expect(dependencies.visibility.publish).toHaveBeenCalledOnce();
    expect(dependencies.contexts.adoptAndRevoke).toHaveBeenCalledOnce();
    expect(dependencies.retiredBytes.enqueueExactDeletion).toHaveBeenCalledWith(expect.objectContaining({ precondition: 'all-contexts-retired-deliveries-revoked' }));
    expect(JSON.stringify(result.saga)).not.toMatch(/confirmationToken|"token"/u);
  });

  it('replays terminal state and rejects changed idempotency input without a second visibility point', async () => {
    const dependencies = await makeDependencies();
    const service = createReplacementSagaService(dependencies);
    await service.execute(input);
    const replay = await service.execute(input);
    expect(replay.status).toBe('replayed');
    expect(dependencies.visibility.publish).toHaveBeenCalledOnce();
    await expect(service.execute({ ...input, confirmationToken: 'b'.repeat(43) })).resolves.toEqual({ status: 'blocked', code: 'replay-conflict' });
  });

  it('denies stale token fences before the ledger is mutated', async () => {
    const dependencies = await makeDependencies({ revisions: { read: vi.fn(async () => ({ revisionVector: { values: { old: 2 } }, currentRevisions: { bookRevision: 2, publicationRevision: 3, sourceSetRevision: 4, sourceVersionRevisions: { old: 2 } }, adapterFingerprint: hash('a') })) } });
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result).toEqual({ status: 'blocked', code: 'revision-changed' });
    expect(await dependencies.ledger.read({ ownerId: input.ownerId, sagaId: 'saga-1' })).toBeNull();
  });

  it('denies a changed current plan pointer before the ledger is mutated', async () => {
    const dependencies = await makeDependencies();
    vi.mocked(dependencies.plans.readCurrent).mockResolvedValue({
      status: 'ready',
      plan: plan(),
      pointer: { planId: 'plan-2', planFingerprint: hash('q'), ownerId: 'teacher-1', bookId: 'book-1', status: 'current', updatedAt: now },
    });
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result).toEqual({ status: 'blocked', code: 'stale-plan' });
    expect(await dependencies.ledger.read({ ownerId: input.ownerId, sagaId: 'saga-1' })).toBeNull();
  });

  it('does not touch contexts before visibility and resumes after a crash boundary', async () => {
    const dependencies = await makeDependencies({ visibility: {
      prepare: vi.fn(async () => ({ status: 'prepared' as const, receipt: hash('r') })),
      publish: vi.fn(async () => { throw new Error('crash-after-stage'); }),
      rollbackStaged: vi.fn(async () => ({ status: 'pending' as const })),
    } });
    const first = await createReplacementSagaService(dependencies).execute(input);
    expect(first).toMatchObject({ status: 'pending', code: 'visibility-pending' });
    expect(dependencies.contexts.adoptAndRevoke).not.toHaveBeenCalled();
    const second = await createReplacementSagaService(dependencies).execute(input);
    expect(second).toMatchObject({ status: 'pending', code: 'visibility-pending' });
    expect(dependencies.retiredBytes.enqueueExactDeletion).not.toHaveBeenCalled();
  });

  it('revalidates a staged replay before allowing the visibility point', async () => {
    const dependencies = await makeDependencies({ visibility: {
      prepare: vi.fn(async () => ({ status: 'prepared' as const, receipt: hash('r') })),
      publish: vi.fn(async () => { throw new Error('crash-before-visible'); }),
      rollbackStaged: vi.fn(async () => ({ status: 'pending' as const })),
    } });
    const service = createReplacementSagaService(dependencies);
    await expect(service.execute(input)).resolves.toMatchObject({ status: 'pending', code: 'visibility-pending' });
    vi.mocked(dependencies.revisions.read).mockResolvedValue({
      revisionVector: { values: { old: 2 } },
      currentRevisions: { bookRevision: 2, publicationRevision: 3, sourceSetRevision: 4, sourceVersionRevisions: { old: 2 } },
      adapterFingerprint: hash('a'),
    });
    await expect(service.execute(input)).resolves.toEqual({ status: 'blocked', code: 'revision-changed' });
    expect(dependencies.visibility.publish).toHaveBeenCalledOnce();
  });

  it('rejects CAS updates that mutate immutable saga provenance', async () => {
    const dependencies = await makeDependencies({ contexts: {
      adoptAndRevoke: vi.fn(async () => ({ status: 'pending' as const, allRetiredDeliveriesRevoked: false })),
    } });
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result.status).toBe('pending');
    if (result.status !== 'pending') throw new Error('unexpected result');
    const saga = result.saga;
    const tampered: ReplacementSagaRecord = {
      ...saga,
      stateRevision: saga.stateRevision + 1,
      sourceSetDelta: { ...saga.sourceSetDelta, fingerprint: hash('x') },
    };
    await expect(dependencies.ledger.compareAndSet({
      ownerId: saga.ownerId,
      sagaId: saga.sagaId,
      expectedState: saga.state,
      expectedRevision: saga.stateRevision,
      next: tampered,
    })).resolves.toEqual({ status: 'conflict' });
  });

  it('rejects skipped and reverse aggregate CAS transitions', async () => {
    const dependencies = await makeDependencies({ contexts: {
      adoptAndRevoke: vi.fn(async () => ({ status: 'pending' as const, allRetiredDeliveriesRevoked: false })),
    } });
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result.status).toBe('pending');
    if (result.status !== 'pending') throw new Error('unexpected result');
    const saga = result.saga;
    const skipped: ReplacementSagaRecord = { ...saga, state: 'awaiting-retired-byte-deletion', stateRevision: saga.stateRevision + 1 };
    const reversed: ReplacementSagaRecord = { ...saga, state: 'visible', stateRevision: saga.stateRevision + 1 };
    await expect(dependencies.ledger.compareAndSet({ ownerId: saga.ownerId, sagaId: saga.sagaId, expectedState: saga.state, expectedRevision: saga.stateRevision, next: skipped })).resolves.toEqual({ status: 'conflict' });
    await expect(dependencies.ledger.compareAndSet({ ownerId: saga.ownerId, sagaId: saga.sagaId, expectedState: saga.state, expectedRevision: saga.stateRevision, next: reversed })).resolves.toEqual({ status: 'conflict' });
  });

  it('fails closed when the dependency clock is invalid', async () => {
    const dependencies = await makeDependencies({ now: () => new Date(Number.NaN) });
    await expect(createReplacementSagaService(dependencies).execute(input)).resolves.toEqual({ status: 'blocked', code: 'clock-unavailable' });
    expect(await dependencies.ledger.read({ ownerId: input.ownerId, sagaId: 'saga-1' })).toBeNull();
  });

  it('supports safe pre-visibility rollback without invoking #117 or #119', async () => {
    const dependencies = await makeDependencies({ visibility: {
      prepare: vi.fn(async () => { throw new Error('provider-failed'); }),
      publish: vi.fn(),
      rollbackStaged: vi.fn(async () => ({ status: 'rolled-back' as const })),
    } });
    const result = await createReplacementSagaService(dependencies).execute(input);
    expect(result).toMatchObject({ status: 'compensated', saga: { state: 'compensated' } });
    expect(dependencies.contexts.adoptAndRevoke).not.toHaveBeenCalled();
    expect(dependencies.retiredBytes.enqueueExactDeletion).not.toHaveBeenCalled();
  });
});
