import { describe, expect, it } from 'vitest';
import {
  bookAdditionBindingId,
  createBookAdditionProjectionAdapter,
  projectBookAddition,
  type BookAdditionProjectionRepository,
} from './bookAdditionProjection.service';
import type { BookDeliveryBinding } from './bookDelivery.types';
import type { BookRedoCurrentProjection } from './bookRedoCurrentProjection.adapter';

const now = '2026-08-01T00:00:00.000Z';
const node = (nodeKey: string, parentNodeKey: string | null, nodeType: 'section' | 'unit' | 'test', order: number) => ({ nodeKey, parentNodeKey, nodeType, order });
const placement = (placementId: string, nodeKey: string, order: number, activityId = placementId): BookDeliveryBinding['placements'][number] => ({
  placementId,
  activityId,
  activityVersionId: `${activityId}-v1`,
  activityVersion: 1,
  nodeKey,
  order,
  contextMode: 'required',
  pageGroupKeys: [],
  sourcePageScopes: [],
});
const binding = (bindingId: string, revision: number, placements: readonly BookDeliveryBinding['placements'][number][], outline = [
  node('book', null, 'section', 1),
  node('unit', 'book', 'unit', 1),
  node('activity-old', 'unit', 'test', 1),
] as const): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId,
  revision,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'owner-1', authorityBoundary: 'book-owner' },
  book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 1, publicationId: 'pub-1', publicationRevision: 1, publicationStatus: 'published' },
  scope: { kind: 'subtree', nodeKeys: outline.map((entry) => entry.nodeKey), placementIds: placements.map((entry) => entry.placementId) },
  outline,
  context: { contextId: 'hw-1', recipientId: 'student-1', ownerId: 'owner-1', kind: 'homework', entitlementBasis: 'assignment' },
  sourceSet: { strategy: 'full_pdf', sources: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }] },
  placements,
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: revision === 4 ? '2026-07-31T00:00:00.000Z' : now,
});

const currentProjection = (currentBinding: BookDeliveryBinding): BookRedoCurrentProjection => ({
  actionId: 'old-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1',
  bindingId: currentBinding.bindingId, bindingRevision: currentBinding.revision,
  activities: [{ placementId: 'placement-old', activityVersionId: 'placement-old-v1', required: true, completionStatus: 'completed', answerState: { answer: 'keep' }, attemptCount: 1, attemptEligibility: 'eligible', evaluationRevision: 2, earnedScore: 1, maximumScore: 1, correctionNote: null, feedbackRelease: 'released' }],
  completion: { schemaVersion: 1, actionId: 'old-action', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1', bindingId: currentBinding.bindingId, bindingRevision: currentBinding.revision, requiredPlacementIds: ['placement-old'], completedPlacementIds: ['placement-old'], requiredCount: 1, completedCount: 1, status: 'completed', activities: [{ placementId: 'placement-old', required: true, completionStatus: 'completed', reopenedByAction: false }] },
});

const setup = () => {
  const current = binding('current-binding', 4, [placement('placement-old', 'activity-old', 1)]);
  const added = placement('placement-new', 'activity-new', 2, 'activity-new');
  const next = binding(bookAdditionBindingId('action-1', 'homework:hw-1', 'student-1'), 5, [current.placements[0], added], [
    ...current.outline,
    node('activity-new', 'unit', 'test', 2),
  ]);
  return {
    current,
    next,
    input: {
      actionId: 'action-1', ownerId: 'owner-1', bookId: 'book-1', contextKey: 'homework:hw-1', contextId: 'hw-1', studentId: 'student-1',
      currentBinding: current, nextBinding: next, currentProjection: currentProjection(current),
      additions: [{ placement: added, feedbackRelease: 'hidden' as const }], now,
    },
  };
};

describe('Book required-addition projection', () => {
  it('appends only new required rows and reopens completed homework once', () => {
    const fixture = setup();
    const result = projectBookAddition(fixture.input);
    expect(result.status).toBe('projected');
    if (result.status !== 'projected') return;
    expect(result.result.projection.activities[0]).toEqual(fixture.input.currentProjection.activities[0]);
    expect(result.result.projection.activities[1]).toMatchObject({ placementId: 'placement-new', required: true, completionStatus: 'not-started', answerState: null });
    expect(result.result.projection.completion).toMatchObject({ status: 'in-progress', requiredCount: 2, completedCount: 1 });
    expect(result.result.binding.placements[0]).toEqual(fixture.current.placements[0]);
    expect(result.result.reopened).toBe(true);
  });

  it('rejects optional or mutated existing placements and isolates context keys', () => {
    const fixture = setup();
    expect(projectBookAddition({ ...fixture.input, additions: [{ placement: { ...fixture.input.additions[0].placement, contextMode: 'optional' }, feedbackRelease: 'hidden' }] }).status).toBe('invalid');
    expect(projectBookAddition({ ...fixture.input, nextBinding: binding(fixture.next.bindingId, 5, [{ ...fixture.current.placements[0], order: 9 }, fixture.input.additions[0].placement], fixture.next.outline) }).status).toBe('invalid');
    expect(projectBookAddition({ ...fixture.input, contextKey: 'homework:other' }).status).toBe('invalid');
  });

  it('commits binding and current rows through one repository and replays without a second write', async () => {
    const fixture = setup();
    let state: { binding: BookDeliveryBinding; projection: BookRedoCurrentProjection } = { binding: fixture.current, projection: fixture.input.currentProjection };
    let commits = 0;
    const repository: BookAdditionProjectionRepository = {
      async read() { return structuredClone(state); },
      async commit(input) {
        commits += 1;
        state = { binding: structuredClone(input.binding), projection: structuredClone(input.projection) };
        return { status: 'applied' };
      },
    };
    const adapter = createBookAdditionProjectionAdapter(repository);
    await expect(adapter.apply({ ...fixture.input, operationId: 'action-1:addition:homework:hw-1:hw-1:student-1:projection' })).resolves.toMatchObject({ status: 'applied', completionStatus: 'in-progress' });
    await expect(adapter.apply({ ...fixture.input, operationId: 'action-1:addition:homework:hw-1:hw-1:student-1:projection' })).resolves.toMatchObject({ status: 'replayed' });
    expect(commits).toBe(1);
  });
});
