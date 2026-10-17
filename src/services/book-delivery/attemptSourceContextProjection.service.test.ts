import { describe, expect, it, vi } from 'vitest';
import type {
  BookRuntimeAttemptRecord,
  BookRuntimeResultRecord,
} from '../book-activity/activityRuntimeAttempt.types';
import type { BookDeliveryRecord } from './bookDelivery.entitlement';
import {
  isBookAttemptSourceContextProjection,
  projectBookAttemptSourceContext,
  resolveBookAttemptSourceContext,
} from './attemptSourceContextProjection.service';
import type { BookHistoricalSourceAvailability } from './attemptSourceContextProjection.types';

const attempt = (overrides: Partial<BookRuntimeAttemptRecord> = {}): BookRuntimeAttemptRecord => ({
  schemaVersion: 1,
  attemptId: 'attempt-1',
  bindingId: 'binding-historical',
  bindingRevision: 4,
  recipientId: 'student-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 3,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-3',
  acknowledgedDraftRevision: 1,
  attemptNumber: 1,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{ sourceKey: 'component-a', sourceVersionId: 'source-version-4', pages: [7] }],
  feedbackRelease: 'pending',
  response: { value: 'answer' },
  createdByOperationId: 'operation-1',
  createdAt: '2026-07-31T00:00:00.000Z',
  ...overrides,
});

const result = (
  sourceAttempt: BookRuntimeAttemptRecord,
  overrides: Partial<BookRuntimeResultRecord> = {},
): BookRuntimeResultRecord => ({
  schemaVersion: 1,
  resultId: `result-${sourceAttempt.attemptId}`,
  attemptId: sourceAttempt.attemptId,
  bindingId: sourceAttempt.bindingId,
  bindingRevision: sourceAttempt.bindingRevision,
  recipientId: sourceAttempt.recipientId,
  contextId: sourceAttempt.contextId,
  placementId: sourceAttempt.placementId,
  activityId: sourceAttempt.activityId,
  activityVersion: sourceAttempt.activityVersion,
  interactionId: sourceAttempt.interactionId,
  activityVersionId: sourceAttempt.activityVersionId,
  acknowledgedDraftRevision: sourceAttempt.acknowledgedDraftRevision,
  attemptNumber: sourceAttempt.attemptNumber,
  pageGroupKeys: sourceAttempt.pageGroupKeys,
  sourceProvenance: sourceAttempt.sourceProvenance,
  feedbackRelease: 'pending',
  status: 'submitted',
  createdByOperationId: sourceAttempt.createdByOperationId,
  createdAt: sourceAttempt.createdAt,
  ...overrides,
});

const delivery = (
  sourceAttempt: BookRuntimeAttemptRecord,
  contextMode: 'none' | 'optional' | 'required' = 'required',
): BookDeliveryRecord => ({
  binding: {
    schemaVersion: 3,
    bindingId: sourceAttempt.bindingId,
    revision: sourceAttempt.bindingRevision,
    status: 'active',
    recipient: { recipientId: sourceAttempt.recipientId, recipientKind: 'student' },
    issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
    book: {
      bookId: 'book-1',
      bookMode: 'pdf',
      bookRevision: 2,
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 2,
      publicationStatus: 'published',
    },
    scope: { kind: 'placements', nodeKeys: ['node-1'], placementIds: [sourceAttempt.placementId] },
    outline: [],
    context: {
      kind: 'homework',
      contextId: sourceAttempt.contextId,
      recipientId: sourceAttempt.recipientId,
      ownerId: 'teacher-1',
      entitlementBasis: 'assignment',
    },
    sourceSet: {
      strategy: 'component_pdfs',
      sources: [{
        sourceKey: sourceAttempt.sourceProvenance[0]!.sourceKey,
        sourceVersionId: sourceAttempt.sourceProvenance[0]!.sourceVersionId,
        lifecycle: 'verified-usable',
        localPageScope: { kind: 'pages', pages: sourceAttempt.sourceProvenance[0]!.pages },
      }],
    },
    placements: [{
      placementId: sourceAttempt.placementId,
      activityId: sourceAttempt.activityId,
      activityVersionId: sourceAttempt.activityVersionId,
      activityVersion: sourceAttempt.activityVersion,
      nodeKey: 'node-1',
      order: 1,
      contextMode,
      pageGroupKeys: sourceAttempt.pageGroupKeys,
      sourcePageScopes: sourceAttempt.sourceProvenance.map(({ sourceKey, pages }) => ({ sourceKey, pages })),
    }],
    schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
    createdAt: '2026-07-30T00:00:00.000Z',
  },
  recordRevision: 8,
  status: 'active',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
});

const source = (
  sourceAttempt: BookRuntimeAttemptRecord,
  availability: BookHistoricalSourceAvailability = 'available',
) => ({
  sourceKey: sourceAttempt.sourceProvenance[0]!.sourceKey,
  sourceVersionId: sourceAttempt.sourceProvenance[0]!.sourceVersionId,
  availability,
  documentRequest: {
    sourceKey: sourceAttempt.sourceProvenance[0]!.sourceKey,
    sourceVersionId: sourceAttempt.sourceProvenance[0]!.sourceVersionId,
    opaqueRouteKey: `route-${sourceAttempt.attemptId}`,
    localPageScope: { kind: 'pages' as const, pages: sourceAttempt.sourceProvenance[0]!.pages },
  },
});

describe('attempt source context projection', () => {
  it('preserves the exact historical component, version, page, group, placement, activity, and focus', () => {
    const terminalAttempt = attempt();
    const projection = projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt),
      historicalDelivery: delivery(terminalAttempt),
      sources: [source(terminalAttempt)],
    });

    expect(projection).toMatchObject({
      state: 'available',
      metadata: {
        attemptId: 'attempt-1',
        resultId: 'result-attempt-1',
        componentId: 'component-a',
        sourceVersionId: 'source-version-4',
        physicalPageNumber: 7,
        pageGroupId: 'page-group-1',
        placementId: 'placement-1',
        activityVersionId: 'activity-version-3',
        interactionFocusId: 'interaction-1',
        correspondence: 'source-assisted',
      },
      documentResource: {
        sourceKey: 'component-a',
        sourceVersionId: 'source-version-4',
        localPageScope: { kind: 'pages', pages: [7] },
      },
    });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('keeps neighboring attempts with the same local page bound to distinct immutable sources', () => {
    const first = attempt();
    const second = attempt({
      attemptId: 'attempt-2',
      sourceProvenance: [{ sourceKey: 'component-b', sourceVersionId: 'source-version-9', pages: [7] }],
    });

    const firstProjection = projectBookAttemptSourceContext({
      attempt: first, result: result(first), historicalDelivery: delivery(first), sources: [source(first)],
    });
    const secondProjection = projectBookAttemptSourceContext({
      attempt: second, result: result(second), historicalDelivery: delivery(second), sources: [source(second)],
    });

    expect(firstProjection.documentResource).toMatchObject({ sourceKey: 'component-a', sourceVersionId: 'source-version-4' });
    expect(secondProjection.documentResource).toMatchObject({ sourceKey: 'component-b', sourceVersionId: 'source-version-9' });
  });

  it('reads the immutable binding id and never asks for the current entitlement', async () => {
    const terminalAttempt = attempt();
    const readBinding = vi.fn().mockResolvedValue(delivery(terminalAttempt));
    const resolveCurrent = vi.fn();

    const projection = await resolveBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt),
      sources: [source(terminalAttempt)],
      repository: { readBinding },
    });

    expect(projection.state).toBe('available');
    expect(readBinding).toHaveBeenCalledWith('binding-historical');
    expect(resolveCurrent).not.toHaveBeenCalled();
  });

  it('marks optional source correspondence as reference-only', () => {
    const terminalAttempt = attempt();
    const projection = projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt),
      historicalDelivery: delivery(terminalAttempt, 'optional'),
      sources: [source(terminalAttempt)],
    });
    expect(projection.metadata?.correspondence).toBe('reference-only');
  });

  it.each(['deleted', 'replaced'] as const)(
    'keeps %s historical source metadata but exposes no document resource',
    (availability) => {
      const terminalAttempt = attempt();
      const projection = projectBookAttemptSourceContext({
        attempt: terminalAttempt,
        result: result(terminalAttempt),
        historicalDelivery: delivery(terminalAttempt),
        sources: [source(terminalAttempt, availability)],
      });
      expect(projection).toMatchObject({
        state: 'historical_source_unavailable',
        reason: availability,
        metadata: { sourceKey: 'component-a', sourceVersionId: 'source-version-4', physicalPageNumber: 7 },
        documentResource: null,
      });
    },
  );

  it('fails closed instead of substituting a current source version', () => {
    const terminalAttempt = attempt();
    const current = source(terminalAttempt);
    const projection = projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt),
      historicalDelivery: delivery(terminalAttempt),
      sources: [{
        ...current,
        sourceVersionId: 'source-version-current',
        documentRequest: { ...current.documentRequest, sourceVersionId: 'source-version-current' },
      }],
    });
    expect(projection).toMatchObject({
      state: 'historical_source_unavailable',
      reason: 'missing_context',
      documentResource: null,
    });
  });

  it('fails closed for missing, malformed, or broader historical context', () => {
    const terminalAttempt = attempt();
    const malformed = attempt({
      pageGroupKeys: ['page-group-1', 'page-group-2'],
      sourceProvenance: [{
        sourceKey: 'component-a',
        sourceVersionId: 'source-version-4',
        pages: [7, 8],
      }],
    });
    expect(projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt),
      historicalDelivery: null,
      sources: [source(terminalAttempt)],
    })).toMatchObject({ state: 'historical_source_unavailable', reason: 'missing_context' });
    expect(projectBookAttemptSourceContext({
      attempt: malformed,
      result: result(malformed),
      historicalDelivery: delivery(malformed),
      sources: [source(malformed)],
    })).toMatchObject({ state: 'historical_source_unavailable', reason: 'malformed_context' });
    expect(projectBookAttemptSourceContext({
      attempt: terminalAttempt,
      result: result(terminalAttempt, { activityVersionId: 'tampered-version' }),
      historicalDelivery: delivery(terminalAttempt),
      sources: [source(terminalAttempt)],
    })).toMatchObject({ state: 'historical_source_unavailable', reason: 'malformed_context' });
  });

  it('rejects malformed metadata even when no document capability is present', () => {
    expect(isBookAttemptSourceContextProjection({
      schemaVersion: 1,
      state: 'historical_source_unavailable',
      reason: 'deleted',
      metadata: {
        attemptId: '../neighbor',
        resultId: 'result-1',
      },
      documentResource: null,
    })).toBe(false);
  });
});
