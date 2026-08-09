import { describe, expect, it } from 'vitest';
import {
  bookRedoCheckpointId,
  createBookRedoCheckpointProjection,
  type BookRedoCheckpointActivityInput,
} from './bookRedoCheckpointProjection.service';

const activity = (update: Partial<BookRedoCheckpointActivityInput> = {}): BookRedoCheckpointActivityInput => ({
  contextKey: 'homework:1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  oldActivityVersionId: 'activity-version-1',
  oldSourceVersionIds: ['source-version-1'],
  lifecycle: 'in-progress',
  priorAnswer: { response: 'answer' },
  priorResult: {
    status: 'graded',
    score: { earnedScore: 1, maximumScore: 2, displayScore: '1/2' },
    feedback: 'Keep going',
  },
  feedbackRelease: 'released',
  changed: true,
  ...update,
});

const input = (activities: readonly BookRedoCheckpointActivityInput[]) => ({
  actionId: 'action-1',
  ownerId: 'owner-1',
  bookId: 'book-1',
  contextKey: 'homework:1',
  contextId: 'homework-1',
  studentId: 'student-1',
  oldBindingId: 'binding-old',
  oldBindingRevision: 3,
  reason: 'Replace the activity',
  createdAt: '2026-08-10T09:00:00.000Z',
  activities,
});

describe('book redo checkpoint projection', () => {
  it('creates exactly one deterministic checkpoint for changed started/submitted work', () => {
    const result = createBookRedoCheckpointProjection(input([
      activity(),
      activity({
        placementId: 'placement-2',
        activityId: 'activity-2',
        oldActivityVersionId: 'activity-version-2',
        lifecycle: 'submitted',
        oldSourceVersionIds: ['source-version-2', 'source-version-1'],
      }),
      activity({
        placementId: 'placement-3',
        activityId: 'activity-3',
        oldActivityVersionId: 'activity-version-3',
        lifecycle: 'not-started',
      }),
      activity({
        placementId: 'placement-4',
        activityId: 'activity-4',
        oldActivityVersionId: 'activity-version-4',
        removalOnly: true,
      }),
      activity({
        placementId: 'placement-5',
        activityId: 'activity-5',
        oldActivityVersionId: 'activity-version-5',
        changed: false,
      }),
    ]));

    expect(result.status).toBe('checkpoint');
    if (result.status !== 'checkpoint') return;
    expect(result.checkpoint.checkpointId).toBe(bookRedoCheckpointId('action-1', 'homework:1', 'student-1'));
    expect(result.checkpoint.activities.map((item) => item.placementId)).toEqual(['placement-1', 'placement-2']);
    expect(result.checkpoint.activities[0]?.oldSourceVersionIds).toEqual(['source-version-1']);
    expect(Object.isFrozen(result.checkpoint)).toBe(true);
    expect(result.checkpoint.status).toBe('review-only');
    expect(result.checkpoint).not.toHaveProperty('completion');
    expect(result.checkpoint).not.toHaveProperty('currentGrade');
    expect(result.checkpoint).not.toHaveProperty('pdfAuthority');
  });

  it('preserves the student answer but does not project hidden feedback', () => {
    const result = createBookRedoCheckpointProjection(input([
      activity({
        feedbackRelease: 'hidden',
        priorResult: {
          status: 'graded',
          score: { earnedScore: 2, maximumScore: 2, displayScore: '2/2' },
          feedback: 'Private feedback',
        },
      }),
    ]));
    expect(result.status).toBe('checkpoint');
    if (result.status !== 'checkpoint') return;
    expect(result.checkpoint.activities[0]).toMatchObject({
      priorAnswer: { response: 'answer' },
      feedbackRelease: 'hidden',
    });
    expect(result.checkpoint.activities[0]).not.toHaveProperty('priorResult');
  });

  it('creates no checkpoint for not-started, unchanged, or removal-only work', () => {
    const result = createBookRedoCheckpointProjection(input([
      activity({ lifecycle: 'not-started' }),
      activity({ placementId: 'placement-2', changed: false }),
      activity({ placementId: 'placement-3', removalOnly: true }),
    ]));
    expect(result).toEqual({ status: 'none' });
  });

  it('rejects duplicate selected placements and cross-context activity identity', () => {
    expect(createBookRedoCheckpointProjection(input([
      activity(),
      activity({ activityId: 'activity-2', oldActivityVersionId: 'activity-version-2' }),
    ]))).toEqual({ status: 'invalid', code: 'checkpoint-duplicate-placement' });
    expect(createBookRedoCheckpointProjection(input([
      activity({ contextKey: 'course:1' }),
    ])).status).toBe('invalid');
  });
});
