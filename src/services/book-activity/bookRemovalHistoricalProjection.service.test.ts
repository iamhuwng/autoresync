import { describe, expect, it } from 'vitest';
import {
  projectBookRemovalHistoricalProjection,
} from './bookRemovalHistoricalProjection.service';

const base = {
  actionId: 'action-1', ownerId: 'teacher-1', bookId: 'book-1',
  contextKey: 'homework:homework-1', contextId: 'homework-1', studentId: 'student-1',
  placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1',
  feedbackRelease: 'released' as const, reason: 'Removed by teacher',
  at: '2026-08-10T00:00:00.000Z',
};

describe('book removal historical projection', () => {
  it('does not surface a not-started historical row and never creates a result/checkpoint shape', () => {
    expect(projectBookRemovalHistoricalProjection({
      ...base,
      lifecycle: 'not-started',
      source: { kind: 'submission', terminalId: 'stray-terminal' },
    })).toEqual({ status: 'none' });
  });

  it.each([
    ['in-progress', { kind: 'draft' as const, draftId: 'draft-1' }],
    ['submitted', {
      kind: 'submission' as const,
      terminalId: 'attempt-1:completion', attemptId: 'attempt-1',
      resultId: 'attempt-1:result', completionId: 'attempt-1:completion',
    }],
    ['completed', {
      kind: 'submission' as const,
      terminalId: 'attempt-1:completion', attemptId: 'attempt-1',
      resultId: 'attempt-1:result', completionId: 'attempt-1:completion',
    }],
  ] as const)('preserves %s as a read-only pointer with the original feedback release policy', (lifecycle, source) => {
    const result = projectBookRemovalHistoricalProjection({ ...base, lifecycle, source });
    expect(result.status).toBe('projected');
    if (result.status !== 'projected') return;
    expect(result.projection).toMatchObject({
      status: 'historical-excluded', currentRequired: false,
      feedbackRelease: 'released', source, lifecycle,
    });
    expect(JSON.stringify(result.projection)).not.toMatch(/answer|response|resultData|checkpoint|redo/iu);
  });

  it('rejects slash-bearing path identities before a projection can be made', () => {
    expect(projectBookRemovalHistoricalProjection({
      ...base,
      contextId: 'homework/other',
      lifecycle: 'submitted',
      source: { kind: 'submission', terminalId: 'attempt-1:completion' },
    })).toMatchObject({ status: 'invalid', code: 'historical-input-invalid' });
  });
});
