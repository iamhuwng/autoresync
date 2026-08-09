import { describe, expect, it } from 'vitest';
import type { ActivitySubmission, NormalizedActivity } from '../../types/bookActivity.types';
import type { BookRuntimeAttemptRecord } from './activityRuntimeAttempt.types';
import { createTrustedBookActivityEvaluationService } from './activityEvaluation.service';
import type {
  BookActivityEvaluationTarget,
  ResolvedBookActivityEvaluationAttempt,
} from './activityEvaluation.types';
import { InMemoryBookActivityEvaluationRepository } from '../../../cloudflare/src/upload-worker/book-activity-grading/repository';

const activity = (correctOptionId: string, points: number): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Objective', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Choose.' }], stimulus: null, assetRefs: [],
  interaction: { family: 'choice', variant: 'single' },
  answerRule: { defaultPoints: points, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{
    family: 'choice', interactionId: 'interaction-1', prompt: 'Pick one', options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: [correctOptionId] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const attempt: BookRuntimeAttemptRecord = {
  schemaVersion: 1,
  attemptId: 'attempt-1', bindingId: 'binding-1', bindingRevision: 1,
  recipientId: 'student-1', contextId: 'solo-1', placementId: 'placement-1',
  activityId: 'activity-1', activityVersion: 1, interactionId: 'interaction-1',
  activityVersionId: 'activity-v1', acknowledgedDraftRevision: 1, attemptNumber: 1,
  pageGroupKeys: ['page-1'], sourceProvenance: [], feedbackRelease: 'pending',
  response: { selectedOptionIds: ['option-a'] }, createdByOperationId: 'submit-1',
  createdAt: '2026-08-10T00:00:00.000Z', submissionScope: 'activity',
  requiredInteractionIds: ['interaction-1'], submittedInteractionIds: ['interaction-1'],
};

const target: BookActivityEvaluationTarget = {
  attemptId: 'attempt-1', resultId: 'attempt-1:result', recipientId: 'student-1',
  bindingId: 'binding-1', bindingRevision: 1, contextKind: 'solo', contextId: 'solo-1',
  placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1,
  interactionId: 'interaction-1', activityVersionId: 'activity-v1', attemptNumber: 1,
  pageGroupKeys: ['page-1'], sourceProvenance: [],
};

describe('#112 objective regrade history', () => {
  it('rescales only from the preserved stored answer and appends one immutable revision', async () => {
    const repository = new InMemoryBookActivityEvaluationRepository();
    let currentActivity = activity('option-a', 1);
    const submission: ActivitySubmission = [{ interactionId: 'interaction-1', answer: ['option-a'] }];
    const service = createTrustedBookActivityEvaluationService({
      repository,
      trustedScorerIdentity: 'book-update-scorer',
      now: () => '2026-08-10T00:01:00.000Z',
      resolveAttempt: async (): Promise<ResolvedBookActivityEvaluationAttempt> => ({
        attempt, contextKind: 'solo', activity: currentActivity, submission,
      }),
      resolveTeacherAuthority: async () => null,
    });
    const actor = { kind: 'trusted_scorer' as const, serviceIdentity: 'book-update-scorer' };
    const first = await service.applyEvaluationCommand({
      schemaVersion: 1, scorerVersion: 1, operationId: 'initial-score',
      kind: 'evaluate_objective', expectedEvaluationRevision: 0, target,
    }, actor);
    expect(first).toMatchObject({ status: 'accepted', revision: { revision: 1, facts: { earnedScore: 1 } } });

    currentActivity = activity('option-b', 2);
    const command = {
      schemaVersion: 1 as const, scorerVersion: 1 as const, operationId: 'action-1:solo:placement-1:regrade',
      kind: 'regrade_objective' as const, expectedEvaluationRevision: 1, target,
    };
    const regraded = await service.applyEvaluationCommand(command, actor);
    expect(regraded).toMatchObject({
      status: 'accepted',
      revision: {
        revision: 2, previousRevision: 1, commandKind: 'regrade_objective',
        facts: { status: 'scored', earnedScore: 0, maximumScore: 2 },
      },
    });
    await expect(service.applyEvaluationCommand(command, actor)).resolves.toEqual({
      status: 'replayed',
      revision: regraded.status === 'accepted' ? regraded.revision : undefined,
    });
    expect(submission).toEqual([{ interactionId: 'interaction-1', answer: ['option-a'] }]);
    await expect(service.applyEvaluationCommand({
      ...command, operationId: 'stale-regrade', expectedEvaluationRevision: 0,
    }, actor)).resolves.toMatchObject({ status: 'rejected', code: 'evaluation_stale_revision' });
  });
});
