import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ReplacementSagaContextItem, ReplacementSagaRecord } from '../replacement-saga/contract.ts';
import type {
  ReplacementContextAuthority,
  ReplacementContextChoice,
  ReplacementContextDecision,
  ReplacementContextRepository,
} from './contract.ts';
import { InMemoryReplacementContextRepository } from './repository.ts';
import { createReplacementContextOwner } from './service.ts';
import { validateGeneratedBookRuleFragment } from '../../book-rules/generated-fragment-manifest.ts';

const hash = (character: string): string => character.repeat(64);
const now = '2026-08-11T00:00:00.000Z';

const sourceSet = (sourceVersionId: string) => ({
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'source-a', sourceVersionId, sourceOrder: 1 }],
  },
  sources: [{
    sourceKey: 'source-a',
    sourceVersionId,
    sourceOrder: 1,
    label: 'Source A',
    rotation: 0,
    physicalPageCount: 1,
    bounds: { width: 1, height: 1 },
    pageGroups: [],
  }],
});

const makeFixture = (choice: ReplacementContextChoice = 'adopt-current-replacement') => {
  const revisionVector = { book: 2, source: 3 };
  const item: ReplacementSagaContextItem = {
    contextKey: 'homework-1',
    contextKind: 'homework',
    classification: 'source-replaced',
    lifecycle: 'in-progress',
    status: 'active',
    sourceScopes: [{ sourceKey: 'source-a', pageCount: 1, placementCount: 1 }],
    state: 'pending',
    stateRevision: 0,
    operationId: 'saga-1:context:homework-1',
  };
  const sourceSetDelta = {
    schemaVersion: 1,
    old: sourceSet('old-v1'),
    next: sourceSet('new-v2'),
    mappings: [],
    fingerprint: hash('d'),
  } as never;
  const saga = {
    schemaVersion: 1,
    sagaId: 'saga-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    planId: 'plan-1',
    reviewId: 'review-1',
    idempotencyKey: 'replace-001',
    tokenHash: hash('t'),
    requestFingerprint: hash('r'),
    planFingerprint: hash('p'),
    deltaFingerprint: hash('d'),
    snapshotFingerprint: hash('s'),
    adapterFingerprint: hash('a'),
    revisionVector,
    sourceSetDelta,
    sourceVersionIds: ['old-v1'],
    targetSourceSetRevision: 4,
    contexts: { [item.contextKey]: item },
    state: 'contexts-pending',
    stateRevision: 1,
    acceptedAt: now,
    updatedAt: now,
    stagedReceipt: hash('g'),
    visibility: { receipt: hash('v'), visibleAt: now },
    retiredByteHandoff: null,
    audit: {
      itemCount: 1,
      retiredItemCount: 0,
      oldSourceVersionIds: ['old-v1'],
      newSourceVersionIds: ['new-v2'],
      events: [],
    },
    recovery: {
      resumeBehavior: 'forward-only-after-visible',
      rollbackBoundary: 'staged-only',
      contextOwner: '#117',
      retiredByteOwner: '#119',
    },
  } as unknown as ReplacementSagaRecord;
  const authority: ReplacementContextAuthority = {
    schemaVersion: 1,
    sagaId: saga.sagaId,
    ownerId: saga.ownerId,
    bookId: saga.bookId,
    planId: saga.planId,
    reviewId: saga.reviewId,
    contextKey: item.contextKey,
    contextKind: item.contextKind,
    recipientId: 'student-1',
    contextRevision: 0,
    status: 'pending',
    current: { bindingId: 'binding-1', bindingRevision: 7, sourceVersionIds: ['old-v1'] },
    retiredDeliveries: [
      {
        deliveryId: 'delivery-1',
        bindingId: 'binding-1',
        bindingRevision: 7,
        ownerId: saga.ownerId,
        bookId: saga.bookId,
        contextKey: item.contextKey,
        sourceVersionIds: ['old-v1'],
        status: 'active',
      },
      {
        deliveryId: 'delivery-2',
        bindingId: 'binding-2',
        bindingRevision: 2,
        ownerId: saga.ownerId,
        bookId: saga.bookId,
        contextKey: item.contextKey,
        sourceVersionIds: ['old-v1'],
        status: 'active',
      },
    ],
    immutableActivityWorkFingerprint: hash('work'),
    revisionVector,
    allowedChoices: ['adopt-current-replacement', 'decline-retain-unavailable'],
    completedOperationId: null,
    completedChoice: null,
    updatedAt: now,
  };
  const decision: ReplacementContextDecision = {
    schemaVersion: 1,
    sagaId: saga.sagaId,
    ownerId: saga.ownerId,
    bookId: saga.bookId,
    planId: saga.planId,
    reviewId: saga.reviewId,
    contextKey: item.contextKey,
    contextKind: item.contextKind,
    choice,
    allowedChoices: ['adopt-current-replacement', 'decline-retain-unavailable'],
    planFingerprint: saga.planFingerprint,
    deltaFingerprint: saga.deltaFingerprint,
    snapshotFingerprint: saga.snapshotFingerprint,
    revisionVector,
    decisionRevision: 0,
    decidedAt: now,
  };
  return { saga, item, authority, decision };
};

const ownerFor = (fixture: ReturnType<typeof makeFixture>, repository: ReplacementContextRepository = new InMemoryReplacementContextRepository([{ authority: fixture.authority, decision: fixture.decision }])) => (
  createReplacementContextOwner({ repository, enabled: true, now: () => new Date(now) })
);

describe('#117 ReplacementSagaContextOwner', () => {
  it('adopts the exact replacement, revokes every retired delivery, and preserves Activity work', async () => {
    const fixture = makeFixture();
    const repository = new InMemoryReplacementContextRepository([{ authority: fixture.authority, decision: fixture.decision }]);
    const result = await ownerFor(fixture, repository).resolveContext({
      saga: fixture.saga,
      item: fixture.item,
      operationId: fixture.item.operationId,
    });

    expect(result).toMatchObject({
      status: 'adopted',
      contextStatus: 'adopted',
      choice: 'adopt-current-replacement',
      allRetiredDeliveriesRevoked: true,
    });
    if (result.status === 'adopted') {
      expect(result.authority.current).toEqual({ bindingId: 'binding-1', bindingRevision: 8, sourceVersionIds: ['new-v2'] });
      expect(result.authority.retiredDeliveries.every((delivery) => delivery.status === 'revoked')).toBe(true);
      expect(result.authority.immutableActivityWorkFingerprint).toBe(hash('work'));
    }
    expect(await repository.findOperation({
      ownerId: fixture.saga.ownerId,
      bookId: fixture.saga.bookId,
      contextKey: fixture.item.contextKey,
      operationId: fixture.item.operationId,
    })).not.toBeNull();
  });

  it('records an explicitly allowed decline as unavailable while revoking old delivery', async () => {
    const fixture = makeFixture('decline-retain-unavailable');
    const result = await ownerFor(fixture).resolveContext({ saga: fixture.saga, item: fixture.item, operationId: fixture.item.operationId });
    expect(result).toMatchObject({
      status: 'adopted',
      contextStatus: 'declined-unavailable',
      choice: 'decline-retain-unavailable',
      allRetiredDeliveriesRevoked: true,
    });
    if (result.status === 'adopted') expect(result.authority.current).toBeNull();
  });

  it('fails closed for unsupported choices, stale pins, and cross-owner provenance before mutation', async () => {
    const unsupported = makeFixture('adopt-current-replacement');
    const unsupportedDecision = { ...unsupported.decision, choice: 'retain-current' as never };
    const unsupportedRepo = new InMemoryReplacementContextRepository([{ authority: unsupported.authority, decision: unsupportedDecision }]);
    const unsupportedResult = await ownerFor(unsupported, unsupportedRepo).resolveContext({ saga: unsupported.saga, item: unsupported.item, operationId: unsupported.item.operationId });
    expect(unsupportedResult).toEqual({ status: 'blocked', code: 'context-choice-unsupported' });
    expect(await unsupportedRepo.findOperation({ ownerId: unsupported.saga.ownerId, bookId: unsupported.saga.bookId, contextKey: unsupported.item.contextKey, operationId: unsupported.item.operationId })).toBeNull();

    const stale = makeFixture();
    const staleAuthority = { ...stale.authority, current: { ...stale.authority.current!, sourceVersionIds: ['new-v2'] } };
    const staleRepo = new InMemoryReplacementContextRepository([{ authority: staleAuthority, decision: stale.decision }]);
    await expect(ownerFor(stale, staleRepo).resolveContext({ saga: stale.saga, item: stale.item, operationId: stale.item.operationId })).resolves.toEqual({ status: 'blocked', code: 'context-version-pin-stale' });

    const crossOwner = makeFixture();
    const crossOwnerDecision = { ...crossOwner.decision, ownerId: 'other-teacher' };
    const crossOwnerRepo = new InMemoryReplacementContextRepository([{ authority: crossOwner.authority, decision: crossOwnerDecision }]);
    await expect(ownerFor(crossOwner, crossOwnerRepo).resolveContext({ saga: crossOwner.saga, item: crossOwner.item, operationId: crossOwner.item.operationId })).resolves.toEqual({ status: 'blocked', code: 'context-cross-owner' });
  });

  it('replays the same operation and denies a replay with changed approved choice', async () => {
    const fixture = makeFixture();
    const repository = new InMemoryReplacementContextRepository([{ authority: fixture.authority, decision: fixture.decision }]);
    const owner = ownerFor(fixture, repository);
    const input = { saga: fixture.saga, item: fixture.item, operationId: fixture.item.operationId };
    await expect(owner.resolveContext(input)).resolves.toMatchObject({ status: 'adopted' });
    await expect(owner.resolveContext(input)).resolves.toMatchObject({ status: 'replayed', allRetiredDeliveriesRevoked: true });
    repository.setDecision({ ...fixture.decision, choice: 'decline-retain-unavailable' });
    await expect(owner.resolveContext(input)).resolves.toEqual({ status: 'blocked', code: 'context-replay-conflict' });
  });

  it('returns resumable pending on a monotonic CAS conflict and does not delete provider bytes', async () => {
    const fixture = makeFixture();
    const base = new InMemoryReplacementContextRepository([{ authority: fixture.authority, decision: fixture.decision }]);
    const commit = vi.fn(async () => ({ status: 'conflict' as const }));
    const repository: ReplacementContextRepository = {
      readAuthority: (input) => base.readAuthority(input),
      readDecision: (input) => base.readDecision(input),
      findOperation: (input) => base.findOperation(input),
      commit,
    };
    const result = await ownerFor(fixture, repository).resolveContext({ saga: fixture.saga, item: fixture.item, operationId: fixture.item.operationId });
    expect(result).toEqual({ status: 'pending', code: 'context-cas-conflict' });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('is disabled by default and validates the inactive 46B fragment without route composition', async () => {
    const fixture = makeFixture();
    const repository = new InMemoryReplacementContextRepository([{ authority: fixture.authority, decision: fixture.decision }]);
    const owner = createReplacementContextOwner({ repository });
    await expect(owner.resolveContext({ saga: fixture.saga, item: fixture.item, operationId: fixture.item.operationId })).resolves.toEqual({ status: 'blocked', code: 'replacement_context_disabled' });
    const fragment = JSON.parse(readFileSync(new URL('../../book-rules/fragments/46B.json', import.meta.url), 'utf8')) as unknown;
    expect(validateGeneratedBookRuleFragment(fragment)).toMatchObject({ ticketId: '46B' });
  });
});
