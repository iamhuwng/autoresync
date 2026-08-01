import { describe, expect, it } from 'vitest';
import type {
  BookResultOwnershipDecision,
} from '../../types/results.types';
import type {
  BookActivityEvaluationRevision,
  BookActivityEvaluationTarget,
} from './activityEvaluation.types';
import {
  projectBookActivityStudentResult,
  type BookResultReleasePolicyAuthority,
} from './bookResultVisibility.service';

const target: BookActivityEvaluationTarget = {
  attemptId: 'attempt-1',
  resultId: 'attempt-1:result',
  recipientId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-1',
  attemptNumber: 1,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-version-1',
    pages: [1],
  }],
};

const ownership: BookResultOwnershipDecision = {
  attemptId: target.attemptId,
  visible: true,
  viewerRole: 'student',
  reason: 'visible',
};

const revision = (
  value: number,
  overrides: Partial<BookActivityEvaluationRevision['facts']> = {},
): BookActivityEvaluationRevision => ({
  schemaVersion: 1,
  revision: value,
  previousRevision: value - 1,
  operationId: `operation-${value}`,
  commandKind: value === 1 ? 'teacher_evaluation' : 'regrade',
  commandFingerprint: `fingerprint-${value}`,
  scorerVersion: 1,
  activitySchemaVersion: 1,
  target,
  facts: {
    status: 'scored',
    earnedScore: value,
    maximumScore: 2,
    displayScore: `${value.toFixed(2)} / 2.00`,
    feedback: value === 1 ? 'First feedback' : 'Corrected feedback',
    correctionFacts: [{
      interactionId: target.interactionId,
      outcome: value === 1 ? 'incorrect' : 'correct',
      ...(value === 1 ? {} : { note: 'We corrected the released evaluation.' }),
    }],
    ...overrides,
  },
  evaluatedBy: { kind: 'teacher', uid: 'teacher-1' },
  evaluatedAt: `2026-08-0${value}T00:00:00.000Z`,
});

const fieldNames = [
  'answerKey',
  'correctness',
  'score',
  'feedback',
  'correctionNote',
] as const;

const policy = (
  released: ReadonlySet<(typeof fieldNames)[number]>,
  overrides: Partial<BookResultReleasePolicyAuthority> = {},
): BookResultReleasePolicyAuthority => ({
  attemptId: target.attemptId,
  contextKind: target.contextKind,
  contextId: target.contextId,
  placementId: target.placementId,
  activityId: target.activityId,
  activityVersionId: target.activityVersionId,
  fields: Object.fromEntries(fieldNames.map((field) => [
    field,
    released.has(field) ? 'released' : 'withheld',
  ])) as BookResultReleasePolicyAuthority['fields'],
  ...overrides,
});

describe('projectBookActivityStudentResult', () => {
  it('covers every independent answer/correctness/score/feedback/correction release combination', () => {
    for (let mask = 0; mask < 2 ** fieldNames.length; mask += 1) {
      const released = new Set(fieldNames.filter((_, index) => (mask & (1 << index)) !== 0));
      const projection = projectBookActivityStudentResult({
        presentationEnabled: true,
        ownership,
        target,
        policy: policy(released),
        studentResponse: { text: 'Student response' },
        answerKey: { expected: 'Trusted answer' },
        currentEvaluation: revision(2),
        history: [revision(2), revision(1)],
        previouslyVisibleRevision: 1,
      });

      expect(projection.status).toBe('graded');
      expect(projection).toHaveProperty('studentResponse');
      expect(Object.hasOwn(projection, 'answerKey')).toBe(released.has('answerKey'));
      expect(Object.hasOwn(projection, 'correctness')).toBe(released.has('correctness'));
      expect(Object.hasOwn(projection, 'score')).toBe(released.has('score'));
      expect(Object.hasOwn(projection, 'feedback')).toBe(released.has('feedback'));
      expect(Object.hasOwn(projection, 'correction')).toBe(
        released.has('correctionNote')
        && (released.has('score') || released.has('feedback') || released.has('correctness')),
      );
    }
  });

  it('keeps subjective pending-review output score and feedback free', () => {
    const pending = revision(1, {
      status: 'review_required',
      earnedScore: undefined,
      maximumScore: undefined,
      displayScore: undefined,
      feedback: undefined,
      correctionFacts: [],
    });
    const projection = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(new Set(fieldNames)),
      studentResponse: 'Long response',
      answerKey: 'Private rubric',
      currentEvaluation: pending,
      history: [pending],
    });

    expect(projection).toEqual({
      attemptId: target.attemptId,
      status: 'pending_review',
      studentResponse: 'Long response',
    });
  });

  it.each([
    ['disabled presentation', { presentationEnabled: false }],
    ['denied ownership', { ownership: { ...ownership, visible: false, reason: 'wrong_student' as const } }],
    ['wrong ownership attempt', { ownership: { ...ownership, attemptId: 'attempt-2' } }],
    ['wrong policy context', { policy: policy(new Set(fieldNames), { contextId: 'homework-2' }) }],
    ['wrong policy placement', { policy: policy(new Set(fieldNames), { placementId: 'placement-2' }) }],
    ['wrong policy activity', { policy: policy(new Set(fieldNames), { activityId: 'activity-2' }) }],
    ['wrong policy version', { policy: policy(new Set(fieldNames), { activityVersionId: 'version-2' }) }],
  ])('fails closed for %s', (_label, overrides) => {
    const projection = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(new Set(fieldNames)),
      studentResponse: { secret: 'response' },
      answerKey: { secret: 'answer' },
      currentEvaluation: revision(2),
      history: [revision(2), revision(1)],
      previouslyVisibleRevision: 1,
      ...overrides,
    });
    expect(projection).toEqual({ attemptId: target.attemptId, status: 'hidden' });
    expect(JSON.stringify(projection)).not.toMatch(/answer|feedback|score|secret/iu);
  });

  it.each([
    ['current context', {
      currentEvaluation: {
        ...revision(2),
        target: { ...target, contextId: 'homework-2' },
      },
    }],
    ['current recipient', {
      currentEvaluation: {
        ...revision(2),
        target: { ...target, recipientId: 'student-2' },
      },
    }],
    ['prior activity version', {
      history: [
        revision(2),
        {
          ...revision(1),
          target: { ...target, activityVersionId: 'activity-version-2' },
        },
      ],
    }],
  ])('fails closed for a mismatched %s revision target', (_label, overrides) => {
    const projection = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(new Set(fieldNames)),
      studentResponse: { secret: 'response' },
      answerKey: { secret: 'answer' },
      currentEvaluation: revision(2),
      history: [revision(2), revision(1)],
      previouslyVisibleRevision: 1,
      ...overrides,
    });

    expect(projection).toEqual({ attemptId: target.attemptId, status: 'hidden' });
    expect(JSON.stringify(projection)).not.toMatch(/answer|feedback|score|secret/iu);
  });

  it('shows an audit correction only for changed previously visible fields', () => {
    const released = new Set<(typeof fieldNames)[number]>(['score', 'correctionNote']);
    const changed = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(released),
      studentResponse: 'answer',
      currentEvaluation: revision(2),
      history: [revision(2), revision(1)],
      previouslyVisibleRevision: 1,
    });
    expect(changed.correction).toEqual({
      note: 'We corrected the released evaluation.',
      revision: 2,
      previousRevision: 1,
      evaluatedAt: '2026-08-02T00:00:00.000Z',
    });

    const unchangedRevision = revision(2, revision(1).facts);
    const unchanged = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(released),
      studentResponse: 'answer',
      currentEvaluation: unchangedRevision,
      history: [unchangedRevision, revision(1)],
      previouslyVisibleRevision: 1,
    });
    expect(unchanged).not.toHaveProperty('correction');
  });

  it('uses audit-safe fallback correction copy and never mutates canonical inputs', () => {
    const prior = revision(1);
    const current = revision(2, { correctionFacts: [] });
    const input = {
      presentationEnabled: true,
      ownership,
      target,
      policy: policy(new Set<(typeof fieldNames)[number]>(['score', 'correctionNote'])),
      studentResponse: { text: 'response' },
      currentEvaluation: current,
      history: [current, prior],
      previouslyVisibleRevision: 1,
    } as const;
    const before = structuredClone(input);
    const projection = projectBookActivityStudentResult(input);

    expect(projection.correction?.note).toBe(
      'Previously released evaluation information was corrected by your teacher.',
    );
    expect(input).toEqual(before);
    expect(Object.isFrozen(projection)).toBe(true);
  });
});
