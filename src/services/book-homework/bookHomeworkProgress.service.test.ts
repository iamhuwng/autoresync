import { describe, expect, it } from 'vitest';
import type {
  BookHomeworkActivityBinding,
  BookHomeworkManifest,
} from '../../types/homework.types';
import {
  deriveBookHomeworkProgress,
  validateBookHomeworkProgressProjection,
  type BookHomeworkTerminalFact,
} from './bookHomeworkProgress.service';

const requiredBinding = (
  placementId: string,
  activityId: string,
  order: number,
  contextMode: 'none' | 'optional' = 'none',
  activityVersion = 1,
): Extract<BookHomeworkActivityBinding, { state: 'required' }> => ({
  bindingId: `activity-binding-${placementId}`,
  placementId,
  activityId,
  nodeKey: 'unit-1',
  order,
  contextMode,
  pageGroupKeys: [],
  sourceReadiness: 'not-required',
  state: 'required',
  activityVersion,
  activityVersionId: `${activityId}-v${activityVersion}`,
  sourceContext: [],
});

const excludedBinding = (
  placementId: string,
  activityId: string,
  order: number,
): Extract<BookHomeworkActivityBinding, { state: 'excluded' }> => ({
  bindingId: `activity-binding-${placementId}`,
  placementId,
  activityId,
  nodeKey: 'unit-1',
  order,
  contextMode: 'optional',
  pageGroupKeys: [],
  sourceReadiness: 'unavailable',
  state: 'excluded',
  exclusionReason: 'missing-source',
});

const manifestWith = (
  bindings: readonly BookHomeworkActivityBinding[],
  overrides: Partial<BookHomeworkManifest> = {},
): BookHomeworkManifest => ({
  schemaVersion: 1,
  assignmentKind: 'book_activity_bundle',
  manifestVersionId: 'manifest-v1',
  ownerId: 'teacher-1',
  createdByCommandId: 'command-1',
  createdAt: '2026-07-28T00:00:00.000Z',
  bindingRevision: 1,
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-v1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'book', bookId: 'book-1' },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  scheduleRules: [],
  bindings,
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: bindings.filter((binding) => binding.state === 'required').length,
    excludedBindingCount: bindings.filter((binding) => binding.state === 'excluded').length,
    legacyScoreFields: 'untouched',
  },
  ...overrides,
});

const factFor = (
  binding: Extract<BookHomeworkActivityBinding, { state: 'required' }>,
  overrides: Partial<BookHomeworkTerminalFact> = {},
): BookHomeworkTerminalFact => ({
  resultId: `result-${binding.placementId}`,
  recipientId: 'student-1',
  contextId: 'homework-1',
  bindingId: 'delivery-binding-1',
  bindingRevision: 1,
  placementId: binding.placementId,
  activityId: binding.activityId,
  activityVersion: binding.activityVersion,
  activityVersionId: binding.activityVersionId,
  submissionScope: 'activity',
  requiredInteractionIds: [`interaction-${binding.placementId}`],
  submittedInteractionIds: [`interaction-${binding.placementId}`],
  result: {
    status: 'submitted',
    score: { status: 'scored', earnedScore: 1, maximumScore: 1, displayScore: '1/1' },
  },
  ...overrides,
});

const baseBindings = [
  requiredBinding('placement-a', 'activity-a', 1),
  requiredBinding('placement-b', 'activity-b', 2, 'optional'),
  requiredBinding('placement-c', 'activity-c', 3),
  excludedBinding('placement-x', 'activity-x', 4),
] as const;

const baseManifest = (): BookHomeworkManifest => manifestWith(baseBindings);
const derive = (manifest: BookHomeworkManifest, terminalFacts: readonly BookHomeworkTerminalFact[] = []) => (
  deriveBookHomeworkProgress({ manifest, deliveryBindingId: 'delivery-binding-1', terminalFacts })
);

describe('Book Homework progress aggregation', () => {
  it('projects zero, partial, and all current required Activities', () => {
    const manifest = baseManifest();
    const [a, b, c] = baseBindings;
    if (a.state !== 'required' || b.state !== 'required' || c.state !== 'required') throw new Error('Fixture binding missing.');

    expect(derive(manifest).completion).toEqual({
      submittedCount: 0,
      requiredCount: 3,
      status: 'not_started',
      isComplete: false,
    });
    expect(derive(manifest, [factFor(a)]).completion).toMatchObject({
      submittedCount: 1,
      requiredCount: 3,
      status: 'in_progress',
    });

    const complete = derive(manifest, [factFor(a), factFor(b), factFor(c)]);
    expect(complete.completion).toMatchObject({ submittedCount: 3, requiredCount: 3, status: 'completed', isComplete: true });
    expect(complete.activities.find((activity) => activity.placementId === 'placement-b')).toMatchObject({ submitted: true });
  });

  it('counts optional-context required bindings and review_required as completion', () => {
    const manifest = baseManifest();
    const [a, b, c] = baseBindings;
    if (a.state !== 'required' || b.state !== 'required' || c.state !== 'required') throw new Error('Fixture binding missing.');
    const progress = derive(manifest, [
      factFor(a),
      factFor(b, { result: { status: 'pending_review', score: { status: 'review_required' } } }),
      factFor(c),
    ]);

    expect(progress.completion.isComplete).toBe(true);
    expect(progress.grading).toEqual({ scoredCount: 2, pendingReviewCount: 1, ungradedSubmittedCount: 0 });
    expect(progress.activities.find((activity) => activity.placementId === 'placement-b')).toMatchObject({
      gradingState: 'review_required',
    });
  });

  it('rejects pending-review results that also carry a scored payload', () => {
    const manifest = baseManifest();
    const [activity] = baseBindings;
    if (activity.state !== 'required') throw new Error('Fixture binding missing.');

    expect(() => derive(manifest, [
      factFor(activity, {
        result: {
          status: 'pending_review',
          score: {
            status: 'scored',
            earnedScore: 1,
            maximumScore: 1,
            displayScore: '1/1',
          },
        },
      }),
    ])).toThrow('Pending-review results cannot be graded as scored.');
  });

  it('keeps excluded rows and every identity mismatch out of current counts', () => {
    const manifest = baseManifest();
    const [a, b] = baseBindings;
    if (a.state !== 'required' || b.state !== 'required') throw new Error('Fixture binding missing.');
    const mismatchContext = factFor(a, { resultId: 'result-context', contextId: 'other-homework' });
    const mismatchVersion = factFor(b, {
      resultId: 'result-version',
      activityVersion: b.activityVersion + 1,
      activityVersionId: 'activity-b-v2',
    });
    const excluded = {
      ...factFor(a),
      resultId: 'result-excluded',
      placementId: 'placement-x',
      activityId: 'activity-x',
    };
    const removed = { ...factFor(a), resultId: 'result-removed', placementId: 'placement-removed', activityId: 'activity-removed' };
    const progress = derive(manifest, [mismatchContext, mismatchVersion, excluded, removed]);

    expect(progress.completion.submittedCount).toBe(0);
    expect(progress.excludedHistoricalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'context-mismatch', placementId: 'placement-a' }),
      expect.objectContaining({ reason: 'activity-version-mismatch', placementId: 'placement-b' }),
      expect.objectContaining({ reason: 'excluded-binding', placementId: 'placement-x' }),
      expect.objectContaining({ reason: 'removed-binding', placementId: 'placement-removed' }),
    ]));
  });

  it('is idempotent for replayed terminal facts and isolates another delivery binding', () => {
    const manifest = baseManifest();
    const [a] = baseBindings;
    if (a.state !== 'required') throw new Error('Fixture binding missing.');
    const first = factFor(a);
    const duplicate = { ...first };
    const otherDelivery = factFor(a, { resultId: 'result-other-delivery', bindingId: 'delivery-binding-other' });
    const progress = derive(manifest, [first, duplicate, otherDelivery]);

    expect(progress.completion).toMatchObject({ submittedCount: 1, requiredCount: 3 });
    expect(progress.excludedHistoricalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'binding-mismatch', placementId: 'placement-a', terminalId: 'result-other-delivery' }),
    ]));
  });

  it('reprojects manifest additions/removals while retaining old terminal facts as history', () => {
    const [a, b, c] = baseBindings;
    if (a.state !== 'required' || b.state !== 'required' || c.state !== 'required') throw new Error('Fixture binding missing.');
    const initial = manifestWith([a, b]);
    const facts = [factFor(a), factFor(b)];
    expect(derive(initial, facts).completion).toMatchObject({ submittedCount: 2, requiredCount: 2, isComplete: true });

    const removed = manifestWith([a]);
    const removedProgress = derive(removed, facts);
    expect(removedProgress.completion).toMatchObject({ submittedCount: 1, requiredCount: 1, isComplete: true });
    expect(removedProgress.excludedHistoricalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'removed-binding', placementId: 'placement-b' }),
    ]));

    const added = manifestWith([a, b, c]);
    const addedProgress = derive(added, facts);
    expect(addedProgress.completion).toMatchObject({ submittedCount: 2, requiredCount: 3, isComplete: false });
    expect(addedProgress.activities.find((activity) => activity.placementId === 'placement-c')).toMatchObject({ submitted: false });
  });

  it('does not expose legacy aggregate score fields', () => {
    const [a] = baseBindings;
    if (a.state !== 'required') throw new Error('Fixture binding missing.');
    const json = JSON.stringify(derive(baseManifest(), [factFor(a)]));
    expect(json).not.toMatch(/(?:percentage|bandScore|maxScore)/iu);
    expect(derive(baseManifest(), [factFor(a)])).not.toHaveProperty('score');
  });

  it('rejects projection summaries that do not reconcile with Activity rows', () => {
    const [a] = baseBindings;
    if (a.state !== 'required') throw new Error('Fixture binding missing.');
    const projection = {
      ...structuredClone(derive(baseManifest(), [factFor(a)])),
      activities: [],
    };

    expect(validateBookHomeworkProgressProjection(projection)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ path: '$.completion' }),
        expect.objectContaining({ path: '$.grading' }),
      ]),
    });
  });
});
