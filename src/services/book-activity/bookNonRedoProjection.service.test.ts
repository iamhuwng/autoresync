import { describe, expect, it } from 'vitest';
import {
  applyBookDisplayProjection,
  applyBookObjectiveRegradeProjection,
  applyBookReorderProjection,
  applyBookRetainedMoveProjection,
  queueBookRubricReviewProjection,
  type BookNonRedoProjectionState,
} from './bookNonRedoProjection.service';

const state = (): BookNonRedoProjectionState => ({
  contextId: 'homework-1', placementId: 'placement-1', activityId: 'activity-1',
  activityVersionId: 'activity-v1', bindingId: 'binding-1', bindingRevision: 4,
  parentRef: 'module-1', order: 0, displayFingerprint: 'display-old', scheduleFingerprint: 'schedule-old',
  answerState: { interactionId: 'interaction-1', answer: ['option-a'] },
  evaluationRevision: 1, earnedScore: 1, maximumScore: 1, correctionNote: null,
  feedbackRelease: 'released', completionStatus: 'completed', attemptCount: 1,
  attemptEligibility: 'exhausted', teacherReviewQueued: false,
});

const preserved = (value: BookNonRedoProjectionState) => ({
  answerState: value.answerState,
  bindingId: value.bindingId,
  bindingRevision: value.bindingRevision,
  completionStatus: value.completionStatus,
  attemptCount: value.attemptCount,
  attemptEligibility: value.attemptEligibility,
  feedbackRelease: value.feedbackRelease,
});

describe('#112 non-redo projections', () => {
  it('display and reorder preserve answers, binding identity, completion, attempts, eligibility, and visibility', () => {
    const before = state();
    const display = applyBookDisplayProjection(before, {
      activityVersionId: 'activity-v2', displayFingerprint: 'display-new',
    });
    const reordered = applyBookReorderProjection(before, { activityVersionId: 'activity-v2', order: 7 });
    expect(preserved(display)).toEqual(preserved(before));
    expect(preserved(reordered)).toEqual(preserved(before));
    expect(display).toMatchObject({ activityVersionId: 'activity-v2', displayFingerprint: 'display-new' });
    expect(reordered).toMatchObject({ activityVersionId: 'activity-v2', order: 7 });
  });

  it.each(['hidden', 'released'] as const)(
    'objective regrade changes only version/evaluation facts and keeps %s feedback policy stable',
    (feedbackRelease) => {
      const before = { ...state(), feedbackRelease };
      const after = applyBookObjectiveRegradeProjection(before, {
        activityVersionId: 'activity-v2', evaluationRevision: 2,
        earnedScore: 0, maximumScore: 2, correctionNote: 'Answer key corrected.',
      });
      expect(preserved(after)).toEqual(preserved(before));
      expect(after).toMatchObject({
        activityVersionId: 'activity-v2', evaluationRevision: 2,
        earnedScore: 0, maximumScore: 2, correctionNote: 'Answer key corrected.',
        feedbackRelease,
      });
      expect(() => applyBookObjectiveRegradeProjection(before, {
        activityVersionId: 'activity-v2', evaluationRevision: 2,
        earnedScore: Number.NaN, maximumScore: 2,
      })).toThrow('book_non_redo_score_invalid');
    },
  );

  it('rubric changes queue review without automatic score mutation, while retained move recalculates placement only', () => {
    const before = state();
    const review = queueBookRubricReviewProjection(before, { activityVersionId: 'activity-v2' });
    expect(review).toMatchObject({
      teacherReviewQueued: true, earnedScore: 1, maximumScore: 1, evaluationRevision: 1,
    });
    expect(preserved(review)).toEqual(preserved(before));
    const moved = applyBookRetainedMoveProjection(before, {
      activityVersionId: 'activity-v2', parentRef: 'module-2', order: 3,
      scheduleFingerprint: 'schedule-new',
    });
    expect(preserved(moved)).toEqual(preserved(before));
    expect(moved).toMatchObject({ parentRef: 'module-2', order: 3, scheduleFingerprint: 'schedule-new' });
  });
});
