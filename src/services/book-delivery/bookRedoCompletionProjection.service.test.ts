import { describe, expect, it } from 'vitest';
import {
  projectBookRedoCompletion,
  type BookRedoCompletionActivityInput,
} from './bookRedoCompletionProjection.service';

const activity = (update: Partial<BookRedoCompletionActivityInput> = {}): BookRedoCompletionActivityInput => ({
  placementId: 'placement-1',
  required: true,
  lifecycle: 'completed',
  changed: false,
  ...update,
});

const input = (activities: readonly BookRedoCompletionActivityInput[]) => ({
  actionId: 'action-1',
  ownerId: 'owner-1',
  bookId: 'book-1',
  contextKey: 'homework:1',
  contextId: 'homework-1',
  studentId: 'student-1',
  bindingId: 'redo:action-1:homework:1:student-1',
  bindingRevision: 4,
  activities,
});

describe('book redo completion projection', () => {
  it('reopens only required changed work and preserves unchanged completion', () => {
    const result = projectBookRedoCompletion(input([
      activity(),
      activity({ placementId: 'placement-2', changed: true }),
      activity({ placementId: 'placement-3', required: false, changed: true }),
      activity({ placementId: 'placement-4', lifecycle: 'in-progress' }),
      activity({ placementId: 'placement-5', lifecycle: 'submitted' }),
    ]));
    expect(result.status).toBe('projected');
    if (result.status !== 'projected') return;
    expect(result.projection.requiredPlacementIds).toEqual([
      'placement-1', 'placement-2', 'placement-4', 'placement-5',
    ]);
    expect(result.projection.completedPlacementIds).toEqual(['placement-1']);
    expect(result.projection.completedCount).toBe(1);
    expect(result.projection.status).toBe('in-progress');
    expect(result.projection.activities.find((item) => item.placementId === 'placement-2')).toMatchObject({
      completionStatus: 'not-started',
      reopenedByAction: true,
    });
    expect(result.projection.activities.find((item) => item.placementId === 'placement-1')).toMatchObject({
      completionStatus: 'completed',
      reopenedByAction: false,
    });
    expect(result.projection.activities.find((item) => item.placementId === 'placement-5')).toMatchObject({
      completionStatus: 'in-progress',
    });
  });

  it('rejects duplicate placements instead of merging completion facts', () => {
    expect(projectBookRedoCompletion(input([activity(), activity()]))).toEqual({
      status: 'invalid',
      code: 'completion-duplicate-placement',
    });
  });

  it('rejects slash path segments before completion persistence', () => {
    const base = input([activity()]);
    expect(projectBookRedoCompletion({ ...base, actionId: 'action/1' }).status).toBe('invalid');
    expect(projectBookRedoCompletion({ ...base, ownerId: 'owner/1' }).status).toBe('invalid');
    expect(projectBookRedoCompletion({ ...base, contextKey: 'homework/1' }).status).toBe('invalid');
    expect(projectBookRedoCompletion({ ...base, contextId: 'homework/1' }).status).toBe('invalid');
    expect(projectBookRedoCompletion({ ...base, studentId: 'student/1' }).status).toBe('invalid');
    expect(projectBookRedoCompletion({ ...base, bindingId: 'binding/new' }).status).toBe('invalid');
    expect(projectBookRedoCompletion(base).status).toBe('projected');
  });
});
