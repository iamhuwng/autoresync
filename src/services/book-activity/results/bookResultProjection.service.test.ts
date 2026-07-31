import { describe, expect, it } from 'vitest';
import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
} from '../activityRuntimeAttempt.types';
import {
  groupBookResultAttempts,
  projectBookResultAttempt,
  validateBookResultAttemptDetail,
  validateBookResultGroupSummary,
  validateBookResultProjectionInput,
} from './bookResultProjection.service';
import type { BookResultProjectionInput } from './bookResult.types';

const terminal = (options: {
  attemptId: string;
  attemptNumber: number;
  recipientId?: string;
  activityId?: string;
  contextId?: string;
  placementId?: string;
  surface?: 'solo' | 'homework';
  createdAt?: string;
  sourceVersionId?: string;
  status?: 'pending_review' | 'submitted';
}): BookResultProjectionInput => {
  const attemptId = options.attemptId;
  const base = {
    bindingId: 'binding-1',
    bindingRevision: 3,
    recipientId: options.recipientId ?? 'student-1',
    contextId: options.contextId ?? 'context-1',
    placementId: options.placementId ?? 'placement-1',
    activityId: options.activityId ?? 'activity-1',
    activityVersion: 2,
    activityVersionId: 'activity-version-2',
    interactionId: 'interaction-1',
    acknowledgedDraftRevision: 4,
    attemptNumber: options.attemptNumber,
    pageGroupKeys: ['page-group-1'],
    createdByOperationId: `operation-${attemptId}`,
    createdAt: options.createdAt ?? `2026-07-31T00:0${options.attemptNumber}:00.000Z`,
  } as const;
  const sourceProvenance = [{
    sourceKey: 'component-1',
    sourceVersionId: options.sourceVersionId ?? 'source-v1',
    pages: [7, 8],
  }] as const;
  const attempt: BookRuntimeAttemptRecord = {
    schemaVersion: 1,
    attemptId,
    ...base,
    sourceProvenance,
    feedbackRelease: 'pending',
    response: { text: `answer-${options.attemptNumber}` },
  };
  const result: BookRuntimeResultRecord = {
    schemaVersion: 1,
    resultId: `${attemptId}:result`,
    attemptId,
    ...base,
    sourceProvenance,
    feedbackRelease: 'pending',
    ...(options.status === 'submitted'
      ? { status: 'submitted' as const, score: { status: 'scored' as const, earnedScore: 3, maximumScore: 4, displayScore: '3/4' } }
      : { status: 'pending_review' as const }),
  };
  const completion: BookRuntimeCompletionRecord = {
    schemaVersion: 1,
    completionId: `${attemptId}:completion`,
    attemptId,
    resultId: result.resultId,
    ...base,
    sourceProvenance,
    status: 'completed',
  };
  const index: BookRuntimeAttemptIndexRecord = {
    schemaVersion: 1,
    attemptId,
    resultId: result.resultId,
    ...base,
  };
  return {
    attempt,
    result,
    completion,
    index,
    surface: options.surface ?? 'solo',
    context: {
      kind: options.surface ?? 'solo',
      contextId: base.contextId,
      deliveryId: 'delivery-1',
      ownerId: 'teacher-1',
      ...(options.surface === 'homework' ? { homeworkId: 'homework-1' } : {}),
    },
    attemptPolicy: { maxAttempts: options.surface === 'homework' ? 2 : 3 },
    sourceAvailability: {
      'component-1': { sourceVersionId: sourceProvenance[0].sourceVersionId, availability: 'available' },
    },
  };
};

describe('Book result projection', () => {
  it('projects exact #76 identity, context, provenance, evaluation, and safe source metadata', () => {
    const projection = projectBookResultAttempt(terminal({ attemptId: 'attempt-1', attemptNumber: 1 }));
    expect(projection.summary).toMatchObject({
      attemptId: 'attempt-1',
      resultId: 'attempt-1:result',
      completionId: 'attempt-1:completion',
      recipientId: 'student-1',
      studentId: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: 3,
      activityVersionId: 'activity-version-2',
      activityVersion: 2,
      contextId: 'context-1',
      placementId: 'placement-1',
      deliveryId: 'delivery-1',
      submittedAt: '2026-07-31T00:01:00.000Z',
      evaluationStatus: 'pending_review',
      sourceAvailability: 'available',
    });
    expect(projection.detail.response).toEqual({ text: 'answer-1' });
    expect(projection.detail.sources).toEqual([expect.objectContaining({
      sourceKey: 'component-1', componentId: 'component-1', sourceVersionId: 'source-v1', pages: [7, 8], available: true,
    })]);
    expect(JSON.stringify(projection)).not.toMatch(/pdf|provider|answerKey|privateObjectKey|credential/iu);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.summary.sources)).toBe(true);
  });

  it('keeps deleted/replaced/missing source references display-only', () => {
    const input = terminal({ attemptId: 'attempt-deleted', attemptNumber: 1 });
    const projection = projectBookResultAttempt({
      ...input,
      sourceAvailability: [{ sourceKey: 'component-1', sourceVersionId: 'source-v1', availability: 'deleted' }],
    });
    expect(projection.summary.sourceAvailability).toBe('deleted');
    expect(projection.summary.sourceAvailable).toBe(false);
    expect(projection.summary.sources[0]).toMatchObject({ availability: 'deleted', displayOnly: true, available: false });
    expect(projection.summary.sources[0]).not.toHaveProperty('pdfBytes');
    expect(projection.summary.sources[0]).not.toHaveProperty('providerAuthority');
  });

  it('preserves distinct submittedAt without changing immutable terminal createdAt', () => {
    const projection = projectBookResultAttempt({
      ...terminal({ attemptId: 'attempt-time', attemptNumber: 1 }),
      submittedAt: '2026-07-31T00:03:00.000Z',
    });
    expect(projection.summary.createdAt).toBe('2026-07-31T00:01:00.000Z');
    expect(projection.summary.submittedAt).toBe('2026-07-31T00:03:00.000Z');
    expect(projection.summary.completedAt).toBe('2026-07-31T00:01:00.000Z');
  });

  it('projects released feedback and safe score only', () => {
    const projection = projectBookResultAttempt({
      ...terminal({ attemptId: 'attempt-reviewed', attemptNumber: 1, status: 'submitted' }),
      evaluation: {
        status: 'graded',
        score: { earnedScore: 3, maximumScore: 4, displayScore: '3/4' },
        evaluatedAt: '2026-07-31T00:04:00.000Z',
      },
      feedback: {
        release: 'released',
        text: 'Good work.',
        correctionNote: 'Use a clearer topic sentence.',
        releasedAt: '2026-07-31T00:05:00.000Z',
      },
    });
    expect(projection.summary.evaluation).toMatchObject({ status: 'graded', score: { earnedScore: 3 } });
    expect(projection.summary.feedback).toMatchObject({ release: 'released', available: true, text: 'Good work.' });
  });

  it('gates pending feedback content', () => {
    const projection = projectBookResultAttempt({
      ...terminal({ attemptId: 'attempt-pending-feedback', attemptNumber: 1 }),
      feedback: { release: 'withheld', text: 'must not leak' },
    });
    expect(projection.summary.feedback).toEqual({ release: 'withheld', available: false });
  });

  it('denies any terminal identity or provenance mismatch', () => {
    const input = terminal({ attemptId: 'attempt-mismatch', attemptNumber: 1 });
    const malformed = {
      ...input,
      result: { ...input.result, activityVersionId: 'other-version' },
    };
    expect(validateBookResultProjectionInput(malformed).valid).toBe(false);
    expect(() => projectBookResultAttempt(malformed)).toThrow(/identity|provenance/iu);
  });

  it('denies unknown fields and malformed nested source availability', () => {
    const input = terminal({ attemptId: 'attempt-malformed', attemptNumber: 1 });
    const unknown = { ...input, result: { ...input.result, providerAuthority: 'forbidden' } };
    expect(validateBookResultProjectionInput(unknown).valid).toBe(false);
    const sourceMismatch = {
      ...input,
      sourceAvailability: [{ sourceKey: 'other-component', availability: 'available' as const }],
    };
    expect(validateBookResultProjectionInput(sourceMismatch).valid).toBe(false);
  });

  it('groups only by student plus Activity and keeps context-scoped limits/completion', () => {
    const soloFirst = terminal({ attemptId: 'solo-1', attemptNumber: 1, contextId: 'solo-context', placementId: 'solo-placement', surface: 'solo' });
    const soloSecond = terminal({ attemptId: 'solo-2', attemptNumber: 2, contextId: 'solo-context', placementId: 'solo-placement', surface: 'solo', createdAt: '2026-07-31T00:02:00.000Z' });
    const homeworkFirst = terminal({ attemptId: 'homework-1', attemptNumber: 1, contextId: 'homework-context', placementId: 'homework-placement', surface: 'homework' });
    const groups = groupBookResultAttempts([soloSecond, homeworkFirst, soloFirst]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupKey).toBe('g_WyJzdHVkZW50LTEiLCJhY3Rpdml0eS0xIl0');
    expect(groups[0].attempts.map((attempt) => attempt.attemptId)).toEqual(['homework-1', 'solo-1', 'solo-2']);
    expect(groups[0].contexts.map((context) => [context.contextId, context.attemptsUsed, context.attemptsRemaining])).toEqual([
      ['homework-context', 1, 1],
      ['solo-context', 2, 1],
    ]);
    expect(groups[0].contexts.every((context) => context.completionStatus === 'completed')).toBe(true);
  });

  it('uses deterministic ordering for equal attempt numbers across contexts', () => {
    const a = terminal({ attemptId: 'attempt-z', attemptNumber: 1, contextId: 'context-z', placementId: 'placement-z' });
    const b = terminal({ attemptId: 'attempt-a', attemptNumber: 1, contextId: 'context-a', placementId: 'placement-a' });
    const first = groupBookResultAttempts([a, b]);
    const second = groupBookResultAttempts([b, a]);
    expect(first).toEqual(second);
    expect(first[0].attempts.map((attempt) => attempt.attemptId)).toEqual(['attempt-a', 'attempt-z']);
  });

  it('validates detail and group wire objects fail closed', () => {
    const projection = projectBookResultAttempt(terminal({ attemptId: 'attempt-wire', attemptNumber: 1 }));
    expect(validateBookResultAttemptDetail(projection.detail).valid).toBe(true);
    const detailWithLeakedFeedback = {
      ...projection.detail,
      feedback: { ...projection.detail.feedback, release: 'withheld', available: true, text: 'leak' },
    };
    expect(validateBookResultAttemptDetail(detailWithLeakedFeedback).valid).toBe(false);
    const sourceContextMismatch = {
      ...projection.detail,
      attemptSourceContext: {
        ...projection.detail.attemptSourceContext,
        metadata: {
          ...projection.detail.attemptSourceContext.metadata,
          sourceVersionId: 'source-version-neighbor',
          physicalPageNumber: 99,
        },
        documentResource: projection.detail.attemptSourceContext.state === 'available'
          ? {
            ...projection.detail.attemptSourceContext.documentResource,
            sourceVersionId: 'source-version-neighbor',
            localPageScope: { kind: 'pages', pages: [99] },
          }
          : null,
      },
    };
    expect(validateBookResultAttemptDetail(sourceContextMismatch).valid).toBe(false);
    const group = groupBookResultAttempts([projection])[0];
    expect(validateBookResultGroupSummary(group).valid).toBe(true);
    expect(validateBookResultGroupSummary({ ...group, groupKey: 'student-1:activity-1' }).valid).toBe(false);
    expect(validateBookResultGroupSummary({ ...group, attempts: [{ ...group.attempts[0], completion: { ...group.attempts[0].completion, activityVersionId: 'wrong' } }] }).valid).toBe(false);
  });
});
