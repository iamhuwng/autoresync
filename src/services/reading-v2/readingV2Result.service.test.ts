import { describe, expect, it } from 'vitest';
import {
  READING_V2_RESULT_OPERATIONAL_STATES,
  buildReadingV2RegradePersistencePlan,
  buildReadingV2ResultPersistencePlan,
  captureReadingV2Attempt,
  createReadingV2RegradeArtifact,
} from './readingV2Result.service';
import { readingV2Ids, type ReadingV2Result } from '../../types/readingV2.types';

describe('readingV2Result.service', () => {
  it('captures attempts against snapshot-bound runtime submit payloads', () => {
    const attempt = captureReadingV2Attempt({
      attemptId: 'attempt-result-service',
      studentId: 'student-1',
      submitPayload: {
        projectionId: 'student-safe:material-1:snapshot-1',
        sourceSnapshotVersionId: 'snapshot-1',
        materialId: 'material-1',
        answers: [
          {
            interactionId: 'interaction-1',
            taskGroupId: 'task-group-1',
            displayNumber: 1,
            value: 'answer one',
          },
        ],
      },
      context: { mode: 'solo-practice' },
    });

    expect(attempt.sourceSnapshotVersionId).toBe('snapshot-1');
    expect(attempt.answers['interaction-1']).toMatchObject({
      taskGroupId: 'task-group-1',
      visibleNumber: 1,
    });
  });

  it('defines the complete Phase 8 result operational state catalog', () => {
    expect(Object.keys(READING_V2_RESULT_OPERATIONAL_STATES).sort()).toEqual([
      'adapter-failure',
      'empty',
      'feedback-save-failure',
      'loading',
      'missing-result',
      'permission-denied',
      'regrade-conflict',
      'regrade-failure',
      'regrade-success',
      'release-policy-blocked',
    ]);
  });

  it('plans writes for Reading V2 and existing result consumers', () => {
    const result = {
      resultId: readingV2Ids.resultId('result-1'),
      testId: 'material-1',
      studentId: 'student-1',
      ownerId: 'teacher-1',
      deliveryEngine: 'reading-v2',
      publishedSnapshotVersion: readingV2Ids.snapshotVersionId('snapshot-1'),
      attemptContext: { mode: 'solo-practice' },
      submittedAt: '2026-04-28T00:00:00.000Z',
      interactions: [],
    } as ReadingV2Result;
    const plan = buildReadingV2ResultPersistencePlan({
      attempt: {
        attemptId: readingV2Ids.attemptId('attempt-1'),
        studentId: 'student-1',
        sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
        context: { mode: 'solo-practice' },
        answers: {},
      },
      result,
      reviewPayload: {
        deliveryEngine: 'reading-v2',
        schemaVersion: 1,
        resultId: 'result-1',
        sourceSnapshotVersionId: 'snapshot-1',
        title: 'Reading V2 Result',
        taskGroups: [
          {
            taskGroupId: 'task-group-1',
            officialTaskType: 'sentence-completion',
            engineeringFamily: 'completion',
            instructionText: 'Complete the task.',
            stimulusContext: [],
            interactions: [],
          },
        ],
      },
      savedResult: {
        resultId: 'result-1',
        sessionCode: 'reading-v2',
        testId: 'material-1',
        studentId: 'student-1',
        studentName: 'Student One',
        totalScore: 0,
        maxScore: 0,
        percentage: 0,
        bandScore: 0,
        questionResults: [],
        correct: 0,
        incorrect: 0,
        partialCredit: 0,
        totalQuestions: 0,
        submittedAt: 1,
        timeElapsed: 0,
        testDuration: 0,
        createdAt: 1,
        testTitle: 'Reading V2 Result',
        testType: 'ielts-reading-v2',
        testSkill: 'reading',
      },
    });

    expect(plan.operations.map((operation) => operation.path)).toContain('test_results/result-1');
    expect(plan.operations.map((operation) => operation.path)).toContain('reading_v2/results/result-1');
  });

  it('creates append-only regrade artifacts without changing the result object', () => {
    const result = {
      resultId: readingV2Ids.resultId('result-regrade-service'),
      interactions: [{ score: 1 }],
    } as ReadingV2Result;
    const before = structuredClone(result);
    const artifact = createReadingV2RegradeArtifact({
      result,
      regradeId: 'regrade-1',
      reviewedScore: 2,
      changedBy: 'teacher-1',
      reason: 'Accepted alternate answer',
    });

    expect(artifact.originalScore).toBe(1);
    expect(result).toEqual(before);
  });

  it('exposes append-only regrade persistence through the result service boundary', () => {
    const artifact = createReadingV2RegradeArtifact({
      result: {
        resultId: readingV2Ids.resultId('result-regrade-service'),
        interactions: [{ score: 1 }],
      } as ReadingV2Result,
      regradeId: 'regrade-1',
      reviewedScore: 2,
      changedBy: 'teacher-1',
      reason: 'Accepted alternate answer',
      changedAt: '2026-04-28T00:10:00.000Z',
    });

    expect(buildReadingV2RegradePersistencePlan({ artifact }).operations.map((operation) => operation.path)).toEqual([
      'reading_v2/regrade_artifacts/result-regrade-service/regrade-1',
      'test_results/result-regrade-service/readingV2/regradeArtifactsById/regrade-1',
    ]);
  });
});
