import { describe, expect, it, vi } from 'vitest';
import { createBookNonRedoProjectionAdapter } from '../../../cloudflare/src/upload-worker/book-updates/non-redo-projection-adapter';
import type { BookNonRedoProjectionState } from '../book-activity/bookNonRedoProjection.service';

const state = (): BookNonRedoProjectionState => ({
  contextId: 'homework-1', placementId: 'placement-1', activityId: 'activity-1',
  activityVersionId: 'activity-v1', bindingId: 'binding-1', bindingRevision: 1,
  parentRef: 'module-1', order: 0, displayFingerprint: 'old', scheduleFingerprint: 'schedule',
  answerState: { answer: 'kept' }, evaluationRevision: 1, earnedScore: 1, maximumScore: 1,
  correctionNote: null, feedbackRelease: 'hidden', completionStatus: 'completed', attemptCount: 1,
  attemptEligibility: 'exhausted', teacherReviewQueued: false,
});

describe('#112 projection adapter CAS/replay', () => {
  it('commits against the old version once and replays by deterministic operation receipt', async () => {
    let current = state();
    const receipts = new Map<string, {
      actionId: string; contextId: string; placementId: string; activityVersionId: string;
    }>();
    const repository = {
      readOperation: vi.fn(async (operationId: string) => receipts.get(operationId) ?? null),
      read: vi.fn(async () => current),
      commit: vi.fn(async (input: {
        operationId: string; actionId: string; expectedActivityVersionId: string;
        state: BookNonRedoProjectionState;
      }) => {
        if (current.activityVersionId !== input.expectedActivityVersionId) return { status: 'conflict' as const };
        current = input.state;
        receipts.set(input.operationId, {
          actionId: input.actionId, contextId: current.contextId,
          placementId: current.placementId, activityVersionId: current.activityVersionId,
        });
        return { status: 'applied' as const };
      }),
    };
    const adapter = createBookNonRedoProjectionAdapter(repository);
    const input = {
      operationId: 'action-1:homework:placement-1:display-only', actionId: 'action-1',
      operation: {
        kind: 'display-only' as const, contextKey: 'homework:homework-1', contextKind: 'homework' as const,
        lifecycle: 'completed' as const, placementId: 'placement-1', activityId: 'activity-1',
        oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
        choice: 'apply-without-redo' as const, displayFingerprint: 'a'.repeat(64),
        studentVisibleChange: true,
      },
    };
    await expect(adapter.apply(input)).resolves.toEqual({ status: 'applied' });
    await expect(adapter.apply(input)).resolves.toEqual({ status: 'replayed' });
    expect(repository.commit).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ activityVersionId: 'activity-v2', answerState: { answer: 'kept' } });
  });
});
