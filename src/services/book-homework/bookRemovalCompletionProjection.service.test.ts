import { describe, expect, it } from 'vitest';
import {
  projectBookRemovalCompletion,
  type BookRemovalCompletionSelection,
} from './bookRemovalCompletionProjection.service';
import type { BookHomeworkProgressProjection } from './bookHomeworkProgress.types';

const current = (complete = false): BookHomeworkProgressProjection => ({
  schemaVersion: 1,
  manifestVersionId: 'manifest-1', recipientId: 'student-1', contextId: 'homework-1',
  deliveryBindingId: 'delivery-1', bindingRevision: 1,
  completion: complete
    ? { submittedCount: 1, requiredCount: 1, status: 'completed', isComplete: true }
    : { submittedCount: 2, requiredCount: 3, status: 'in_progress', isComplete: false },
  grading: complete
    ? { scoredCount: 1, pendingReviewCount: 0, ungradedSubmittedCount: 0 }
    : { scoredCount: 1, pendingReviewCount: 1, ungradedSubmittedCount: 0 },
  activities: complete
    ? [{
      bindingId: 'binding-1', placementId: 'placement-1', activityId: 'activity-1',
      activityVersion: 1, activityVersionId: 'activity-v1', order: 1, contextMode: 'required',
      submitted: true, gradingState: 'scored',
      score: { earnedScore: 8, maximumScore: 10, displayScore: '8/10' }, terminalId: 'attempt-1:completion',
    }]
    : [
      {
        bindingId: 'binding-1', placementId: 'placement-1', activityId: 'activity-1',
        activityVersion: 1, activityVersionId: 'activity-v1', order: 1, contextMode: 'required',
        submitted: true, gradingState: 'scored',
        score: { earnedScore: 8, maximumScore: 10, displayScore: '8/10' }, terminalId: 'attempt-1:completion',
      },
      {
        bindingId: 'binding-2', placementId: 'placement-2', activityId: 'activity-2',
        activityVersion: 1, activityVersionId: 'activity-v1', order: 2, contextMode: 'required',
        submitted: true, gradingState: 'review_required', terminalId: 'attempt-2:completion',
      },
      {
        bindingId: 'binding-3', placementId: 'placement-3', activityId: 'activity-3',
        activityVersion: 1, activityVersionId: 'activity-v1', order: 3, contextMode: 'required',
        submitted: false, gradingState: 'ungraded',
      },
    ],
  excludedHistoricalRows: [],
});

const removal = (placementId: string): BookRemovalCompletionSelection => ({
  actionId: 'action-1', ownerId: 'teacher-1', bookId: 'book-1',
  contextKey: 'homework:homework-1', contextId: 'homework-1', studentId: 'student-1',
  placementId, reason: 'Removed by teacher',
});

describe('book removal completion projection', () => {
  it('excludes submitted rows from current completion/grading while retaining historical identity', () => {
    const result = projectBookRemovalCompletion({
      current: current(), removals: [removal('placement-2')],
    });
    expect(result.status).toBe('projected');
    if (result.status === 'invalid') return;
    expect(result.projection.completion).toEqual({
      submittedCount: 1, requiredCount: 2, status: 'in_progress', isComplete: false,
    });
    expect(result.projection.grading).toEqual({
      scoredCount: 1, pendingReviewCount: 0, ungradedSubmittedCount: 0,
    });
    expect(result.projection.activities.map((activity) => activity.placementId)).toEqual(['placement-1', 'placement-3']);
    expect(result.projection.excludedHistoricalRows).toEqual([
      expect.objectContaining({
        placementId: 'placement-2', reason: 'removed-binding', source: 'terminal-fact',
        terminalId: 'attempt-2:completion', gradingState: 'review_required',
      }),
    ]);
  });

  it('removes in-progress and not-started work without opening a review row', () => {
    const result = projectBookRemovalCompletion({
      current: current(), removals: [removal('placement-3')],
    });
    expect(result.status).toBe('projected');
    if (result.status === 'invalid') return;
    expect(result.projection.activities.map((activity) => activity.placementId)).toEqual(['placement-1', 'placement-2']);
    expect(result.projection.excludedHistoricalRows).toEqual([
      expect.objectContaining({ placementId: 'placement-3', source: 'manifest-binding' }),
    ]);
  });

  it('keeps a completed Homework completed when its last required Activity is removed and replay converges', () => {
    const first = projectBookRemovalCompletion({
      current: current(true), removals: [removal('placement-1')],
    });
    expect(first.status).toBe('projected');
    if (first.status === 'invalid') return;
    expect(first.projection.completion).toEqual({
      submittedCount: 0, requiredCount: 0, status: 'completed', isComplete: true,
    });
    expect(first.projection.completionLatched).toBe(true);
    const replay = projectBookRemovalCompletion({
      current: first.projection,
      removals: [removal('placement-1')],
    });
    expect(replay.status).toBe('replayed');
    if (replay.status === 'invalid') return;
    expect(replay.projection).toEqual(first.projection);
  });

  it('preserves exclusion facts across sequential removal actions', () => {
    const first = projectBookRemovalCompletion({
      current: current(), removals: [removal('placement-2')],
    });
    expect(first.status).toBe('projected');
    if (first.status === 'invalid') return;
    const second = projectBookRemovalCompletion({
      current: first.projection, removals: [removal('placement-3')],
    });
    expect(second.status).toBe('projected');
    if (second.status === 'invalid') return;
    expect(second.projection.activities.map((activity) => activity.placementId)).toEqual(['placement-1']);
    expect(second.projection.exclusions.map((exclusion) => exclusion.placementId)).toEqual(['placement-2', 'placement-3']);
    expect(second.projection.excludedHistoricalRows.map((row) => row.placementId)).toEqual(['placement-2', 'placement-3']);
  });

  it('rejects cross-context and slash-bearing selections', () => {
    expect(projectBookRemovalCompletion({
      current: current(), removals: [removal('placement-1'), removal('placement-1')],
    })).toMatchObject({ status: 'invalid', code: 'completion-removal-duplicate' });
    expect(projectBookRemovalCompletion({
      current: current(), removals: [{ ...removal('placement-1'), contextId: 'other/homework' }],
    })).toMatchObject({ status: 'invalid', code: 'completion-input-invalid' });
  });
});
