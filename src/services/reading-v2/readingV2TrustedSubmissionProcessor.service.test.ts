import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from './readingV2Repository.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import {
  persistReadingV2ResultPlanCanonicalFirst,
  processReadingV2TrustedSubmission,
} from './readingV2TrustedSubmissionProcessor.service';

const sentenceCompletionDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const publishTrustedSubmissionFixture = () => {
  const repository = createReadingV2Repository();
  const materialId = readingV2Ids.materialId('trusted-submit-guard-material');
  const snapshotVersionId = readingV2Ids.snapshotVersionId('trusted-submit-guard-snapshot');
  const publishResult = publishReadingV2Material({
    repository,
    materialId,
    ownerId: 'teacher-1',
    document: sentenceCompletionDocument(),
    publishedBy: 'teacher-1',
    snapshotVersionId,
    publishedAt: '2026-04-28T00:00:00.000Z',
  });
  const studentProjection = publishResult.projections.find(
    (projection) => projection.projectionKind === 'student-safe',
  );
  const reviewProjection = publishResult.projections.find(
    (projection) => projection.projectionKind === 'review',
  );

  if (!studentProjection || !reviewProjection) {
    throw new Error('Test setup failed to create required Reading V2 projections.');
  }

  return {
    repository,
    materialId,
    studentProjection,
    reviewProjection,
  };
};

describe('processReadingV2TrustedSubmission', () => {
  it('scores and persists a runtime submission without exposing canonical data to the browser payload', async () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('trusted-submit-material');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('trusted-submit-snapshot');
    const publishResult = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: sentenceCompletionDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-04-28T00:00:00.000Z',
    });
    const studentProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'student-safe',
    );
    const reviewProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'review',
    );

    if (!studentProjection || !reviewProjection) {
      throw new Error('Test setup failed to create required Reading V2 projections.');
    }

    const persistedPlans: unknown[] = [];
    const persistPlan = vi.fn((plan) => {
      persistedPlans.push(plan);
    });
    const answers = studentProjection.content.taskGroups.flatMap((taskGroup) =>
      taskGroup.interactions.map((interaction, index) => ({
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        visibleNumber: interaction.displayNumber,
        value: index === 0 ? 'answer one' : 'answer two',
      })),
    );

    const submission = await processReadingV2TrustedSubmission({
      payload: {
        projectionId: studentProjection.projectionId,
        sourceSnapshotVersionId: studentProjection.sourceSnapshotVersionId,
        materialId,
        answers,
      },
      context: {
        studentId: 'student-1',
        studentName: 'Student One',
        resultId: 'trusted-result-1',
        attemptId: 'trusted-attempt-1',
        mode: 'solo-practice',
        submittedAt: '2026-04-28T00:05:00.000Z',
      },
      dependencies: {
        loadPublishedSnapshot: ({ materialId: requestedMaterialId, snapshotVersionId: requestedSnapshotVersionId }) =>
          repository.loadPublishedSnapshot(requestedMaterialId, requestedSnapshotVersionId),
        loadReviewProjection: () => reviewProjection,
        persistPlan,
      },
    });

    const attemptOperation = submission.persistencePlan.operations.find(
      (operation) => operation.key === 'reading-v2-attempt:trusted-attempt-1',
    );

    expect(submission.resultId).toBe('trusted-result-1');
    expect(submission.totalScore).toBe(2);
    expect(submission.maxScore).toBe(2);
    expect(submission.percentage).toBe(100);
    expect(persistPlan).toHaveBeenCalledTimes(1);
    expect(persistedPlans).toHaveLength(1);
    expect(submission.persistencePlan.operations.map((operation) => operation.path)).toEqual(
      expect.arrayContaining([
        'test_results/trusted-result-1',
        'test_results_by_student/student-1/trusted-result-1',
        'reading_v2/review_indexes/trusted-result-1',
      ]),
    );
    expect(attemptOperation?.value).toEqual(
      expect.objectContaining({
        attemptId: 'trusted-attempt-1',
        sourceSnapshotVersionId: snapshotVersionId,
        answers: expect.objectContaining({
          [answers[0].interactionId]: expect.objectContaining({
            visibleNumber: answers[0].visibleNumber,
            value: 'answer one',
          }),
        }),
      }),
    );
    expect(JSON.stringify(submission.savedResult.readingV2.reviewPayload)).toContain('answer one');
    expect(JSON.stringify(submission.savedResult.readingV2.reviewPayload)).not.toContain('scoringRule');
  });

  it('rejects owner spoofing before persistence', async () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('trusted-submit-owner-material');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('trusted-submit-owner-snapshot');
    const publishResult = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: sentenceCompletionDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-04-28T00:00:00.000Z',
    });
    const studentProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'student-safe',
    );
    const reviewProjection = publishResult.projections.find(
      (projection) => projection.projectionKind === 'review',
    );

    if (!studentProjection || !reviewProjection) {
      throw new Error('Test setup failed to create required Reading V2 projections.');
    }

    const persistPlan = vi.fn();
    const answer = studentProjection.content.taskGroups[0].interactions[0];

    await expect(processReadingV2TrustedSubmission({
      payload: {
        projectionId: studentProjection.projectionId,
        sourceSnapshotVersionId: studentProjection.sourceSnapshotVersionId,
        materialId,
        answers: [{
          interactionId: answer.interactionId,
          taskGroupId: answer.taskGroupId,
          visibleNumber: answer.displayNumber,
          value: 'answer one',
        }],
      },
      context: {
        studentId: 'student-1',
        studentName: 'Student One',
        resultId: 'trusted-result-2',
        attemptId: 'trusted-attempt-2',
        mode: 'solo-practice',
        ownerId: 'teacher-2',
      },
      dependencies: {
        loadPublishedSnapshot: ({ materialId: requestedMaterialId, snapshotVersionId: requestedSnapshotVersionId }) =>
          repository.loadPublishedSnapshot(requestedMaterialId, requestedSnapshotVersionId),
        loadReviewProjection: () => reviewProjection,
        persistPlan,
      },
    })).rejects.toThrow('owner binding');

    expect(persistPlan).not.toHaveBeenCalled();
  });

  it('rejects tampered bindings and wrong-shaped scalar answers before persistence', async () => {
    const {
      repository,
      materialId,
      studentProjection,
      reviewProjection,
    } = publishTrustedSubmissionFixture();
    const persistPlan = vi.fn();
    const firstInteraction = studentProjection.content.taskGroups[0].interactions[0];
    const baseContext = {
      studentId: 'student-1',
      studentName: 'Student One',
      resultId: 'trusted-result-guard',
      attemptId: 'trusted-attempt-guard',
      mode: 'solo-practice' as const,
    };
    const dependencies = {
      loadPublishedSnapshot: ({ materialId: requestedMaterialId, snapshotVersionId: requestedSnapshotVersionId }) =>
        repository.loadPublishedSnapshot(requestedMaterialId, requestedSnapshotVersionId),
      loadReviewProjection: () => reviewProjection,
      persistPlan,
    };
    const submitWithAnswer = (answer: {
      readonly interactionId: string;
      readonly taskGroupId: string;
      readonly visibleNumber: number;
      readonly value: string | readonly string[];
    }) => processReadingV2TrustedSubmission({
      payload: {
        projectionId: studentProjection.projectionId,
        sourceSnapshotVersionId: studentProjection.sourceSnapshotVersionId,
        materialId,
        answers: [answer],
      },
      context: baseContext,
      dependencies,
    });

    await expect(submitWithAnswer({
      interactionId: firstInteraction.interactionId,
      taskGroupId: firstInteraction.taskGroupId,
      visibleNumber: firstInteraction.displayNumber,
      value: ['answer one'],
    })).rejects.toThrow(/scalar interaction .* cannot accept an array answer/i);
    await expect(submitWithAnswer({
      interactionId: firstInteraction.interactionId,
      taskGroupId: 'wrong-task-group',
      visibleNumber: firstInteraction.displayNumber,
      value: 'answer one',
    })).rejects.toThrow(/submitted task group does not match/i);
    await expect(submitWithAnswer({
      interactionId: firstInteraction.interactionId,
      taskGroupId: firstInteraction.taskGroupId,
      visibleNumber: firstInteraction.displayNumber + 20,
      value: 'answer one',
    })).rejects.toThrow(/submitted display number does not match/i);
    await expect(submitWithAnswer({
      interactionId: 'stale-interaction-id',
      taskGroupId: firstInteraction.taskGroupId,
      visibleNumber: firstInteraction.displayNumber,
      value: 'answer one',
    })).rejects.toThrow(/not in the published snapshot/i);
    expect(persistPlan).not.toHaveBeenCalled();
  });

  it('persists the canonical existing result before secondary indexes', async () => {
    const writes: string[] = [];
    const writer = {
      set: vi.fn((path: string) => {
        writes.push(`set:${path}`);
      }),
      update: vi.fn((updates: Record<string, unknown>) => {
        writes.push(`update:${Object.keys(updates).sort().join(',')}`);
      }),
    };

    await persistReadingV2ResultPlanCanonicalFirst({
      operations: [
        {
          key: 'reading-v2-attempt:attempt-1',
          path: 'reading_v2/attempts/attempt-1',
          value: { attemptId: 'attempt-1' },
        },
        {
          key: 'existing-result:result-1',
          path: 'test_results/result-1',
          value: { resultId: 'result-1' },
        },
        {
          key: 'existing-student-index:student-1:result-1',
          path: 'test_results_by_student/student-1/result-1',
          value: { resultId: 'result-1' },
        },
      ],
    }, writer);

    expect(writes[0]).toBe('set:test_results/result-1');
    expect(writer.update).toHaveBeenCalledWith({
      'reading_v2/attempts/attempt-1': { attemptId: 'attempt-1' },
      'test_results_by_student/student-1/result-1': { resultId: 'result-1' },
    });
  });
});
