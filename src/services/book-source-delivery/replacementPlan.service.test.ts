import { describe, expect, it } from 'vitest';
import type { BookImpactSnapshot } from '../book-delivery/bookImpactSnapshot.types';
import type { BookImpactSummary } from '../book-delivery/bookImpactDiscovery.types';
import {
  createReplacementPlan,
  isReplacementPlanExpired,
} from './replacementPlan.service';
import type { ReplacementPlanBuildInput } from './replacementPlan.types';
import type { ReplacementTrustedSourceSet } from '../book-assembly/replacementSourceSetDelta.types';

const revisions = {
  bookRevision: 7,
  publicationRevision: 4,
  sourceSetRevision: 8,
  sourceVersionRevisions: { full: 2 },
} as const;
const sourceSet = (version: string): ReplacementTrustedSourceSet => ({
  sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: version, sourceOrder: 1 }] },
  sources: [{
    sourceKey: 'full', sourceVersionId: version, sourceOrder: 1, label: 'Full source', rotation: 0,
    physicalPageCount: 2, bounds: { width: 1000, height: 1400 }, pageGroups: [{
      pageGroupKey: 'group-1', label: 'Pages', sourceKey: 'full', pages: [1, 2], mode: 'reference_only',
    }],
  }],
});
const delta = {
  old: sourceSet('full-v1'),
  next: sourceSet('full-v2'),
  mappings: [
    { mappingId: 'p1', from: { sourceKey: 'full', physicalPageNumber: 1 }, to: { sourceKey: 'full', physicalPageNumber: 1 }, kind: 'reassigned' as const, sourceAssistedScopes: [] },
    { mappingId: 'p2', from: { sourceKey: 'full', physicalPageNumber: 2 }, to: { sourceKey: 'full', physicalPageNumber: 2 }, kind: 'reassigned' as const, sourceAssistedScopes: [] },
  ],
};
const impact = (kind: 'solo' | 'homework' | 'course' | 'class' | 'public-reference', index: number): BookImpactSummary => ({
  contextId: `${kind}-${index}`, contextKind: kind, ownerId: 'teacher-1', recipientId: `recipient-${index}`,
  bindingId: `binding-${kind}-${index}`, bindingRevision: 1, status: 'active', lifecycle: 'not-started',
  bookId: 'book-1', bookRevision: 7, publicationId: 'publication-1', publicationRevision: 4, effectiveWindow: null,
  placements: [{ placementId: `placement-${kind}-${index}`, activityId: 'activity-1', activityVersionId: 'activity-v1', activityVersion: 1, nodeKey: 'unit-1', order: 1, effectiveWindow: null, sourceRefs: [{ sourceKey: 'full', sourceVersionId: 'full-v1', availability: 'available', pages: [1, 2] }] }],
  attempts: [], sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', availability: 'available', pages: [1, 2], placementIds: [`placement-${kind}-${index}`] }],
  classification: { primaryEffect: index % 2 ? 'redo-required' : 'display-only', effects: ['display-only'], reasons: ['source-replacement'], requiresRedo: false, requiresRegrade: false },
  replacement: [],
} as unknown as BookImpactSummary);
const snapshot = (): BookImpactSnapshot => ({
  schemaVersion: 1, snapshotId: 'snapshot-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1', inputFingerprint: 'a'.repeat(64),
  immutableInputs: {
    oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2', oldActivityFingerprint: 'b'.repeat(64), newActivityFingerprint: 'c'.repeat(64),
    placementFingerprint: 'd'.repeat(64), manifestFingerprint: 'e'.repeat(64), sourceFingerprint: 'f'.repeat(64), scheduleFingerprint: '0'.repeat(64),
  },
  adapters: ['solo', 'homework', 'course', 'class', 'public-reference'].map((contextKind) => ({ adapterId: `${contextKind}-adapter`, adapterVersion: 1, contextKind, contractVersion: 1 })) as BookImpactSnapshot['adapters'],
  contexts: ['solo', 'homework', 'course', 'class', 'public-reference'].map((contextKind, index) => ({
    contextKey: `${contextKind}-context`, impact: impact(contextKind as never, index),
    updateAuthority: { ownerId: 'teacher-1', actorId: 'teacher-1', permitted: true as const },
    recipientScope: { recipientId: `recipient-${index}`, lifecycle: 'not-started' as const, status: 'active' as const },
    activityChoices: [], estimatedCheckpointCount: index, estimatedNotificationCount: index + 1,
  })),
  createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T01:00:00.000Z',
  recovery: { backupInventory: 'include-metadata', restoreBehavior: 'retain-read-only', expiryBehavior: 'retain-audit-deny-reuse', sideEffectsOnReplay: 'none', recoveryLedgerRoot: 'book_impact_snapshot_recovery' },
});
const input = (): ReplacementPlanBuildInput => ({
  ownerId: 'teacher-1', bookId: 'book-1', currentRevisions: revisions, targetSourceSetRevision: 9, sourceSetDelta: delta,
  impactSnapshot: { snapshot: snapshot(), revisionVector: { values: { book: 7, publication: 4, sourceSet: 8 } }, currentRevisions: revisions },
  capacity: { current: { trackedAccountBytes: 100, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 200 },
  now: '2026-08-11T00:05:00.000Z',
});

describe('replacement plan service', () => {
  it('creates a deep-frozen immutable plan with every context once and no default selection', async () => {
    const result = await createReplacementPlan(input());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.plan.sourceSetDelta)).toBe(true);
    expect(result.plan.contexts).toHaveLength(5);
    expect(new Set(result.plan.contexts.map((context) => context.contextKey)).size).toBe(5);
    expect(result.plan.selectedContextKeys).toEqual([]);
    expect(JSON.stringify(result.plan)).not.toContain('studentAnswer');
    expect(result.plan.capacity.available).toBe(true);
  });

  it('fails closed on stale or expired snapshot facts and the 9 GB capacity boundary', async () => {
    const stale = { ...input(), impactSnapshot: { ...input().impactSnapshot, currentRevisions: { ...revisions, bookRevision: 8 } } };
    await expect(createReplacementPlan(stale)).resolves.toMatchObject({ status: 'blocked', code: 'stale-snapshot' });

    const expiredInput = input();
    const expired = { ...expiredInput, impactSnapshot: { ...expiredInput.impactSnapshot, snapshot: { ...expiredInput.impactSnapshot.snapshot, expiresAt: expiredInput.now } } };
    await expect(createReplacementPlan(expired)).resolves.toMatchObject({ status: 'blocked', code: 'expired-snapshot' });

    const capacity = { ...input(), capacity: { current: { trackedAccountBytes: 9_000_000_000, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 1 } };
    await expect(createReplacementPlan(capacity)).resolves.toMatchObject({ status: 'blocked', code: 'capacity-exceeded' });
  });

  it('uses exact-boundary plan expiry', async () => {
    const result = await createReplacementPlan(input());
    if (result.status !== 'ready') throw new Error('expected plan');
    expect(isReplacementPlanExpired(result.plan, result.plan.expiresAt)).toBe(true);
    expect(isReplacementPlanExpired(result.plan, 'not-a-time')).toBe(true);
    expect(isReplacementPlanExpired({ expiresAt: 'not-a-time' }, input().now)).toBe(true);
  });
});
