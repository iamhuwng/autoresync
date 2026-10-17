import { classifyBookResultVisibility } from '../resultVisibility.service';
import type {
  BookResultOwnershipDecision,
} from '../../types/results.types';
import type {
  BookActivityCorrectionFact,
  BookActivityEvaluationRevision,
  BookActivityEvaluationTarget,
} from './activityEvaluation.types';

export type BookEvaluationFieldRelease = 'released' | 'withheld';

export interface BookResultReleasePolicyAuthority {
  readonly attemptId: string;
  readonly contextKind: BookActivityEvaluationTarget['contextKind'];
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly fields: {
    readonly answerKey: BookEvaluationFieldRelease;
    readonly correctness: BookEvaluationFieldRelease;
    readonly score: BookEvaluationFieldRelease;
    readonly feedback: BookEvaluationFieldRelease;
    readonly correctionNote: BookEvaluationFieldRelease;
  };
}

export interface BookActivityStudentCorrectionProjection {
  readonly note: string;
  readonly revision: number;
  readonly previousRevision: number;
  readonly evaluatedAt: string;
}

export interface BookActivityStudentResultProjection {
  readonly attemptId: string;
  readonly status: 'hidden' | 'pending_review' | 'graded';
  readonly studentResponse?: unknown;
  readonly answerKey?: unknown;
  readonly correctness?: readonly BookActivityCorrectionFact[];
  readonly score?: {
    readonly earnedScore: number;
    readonly maximumScore: number;
    readonly displayScore: string;
  };
  readonly feedback?: string;
  readonly correction?: BookActivityStudentCorrectionProjection;
}

export interface ProjectBookActivityStudentResultInput {
  readonly presentationEnabled?: boolean;
  readonly ownership: BookResultOwnershipDecision;
  readonly target: BookActivityEvaluationTarget;
  readonly policy: BookResultReleasePolicyAuthority;
  readonly studentResponse: unknown;
  readonly answerKey?: unknown;
  readonly currentEvaluation?: BookActivityEvaluationRevision | null;
  readonly history?: readonly BookActivityEvaluationRevision[];
  /**
   * Trusted release audit pointer. It names the last evaluation revision whose
   * released fields may already have been visible to this student.
   */
  readonly previouslyVisibleRevision?: number;
}

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => freeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${stable(record[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
};

const policyMatchesTarget = (
  policy: BookResultReleasePolicyAuthority,
  target: BookActivityEvaluationTarget,
): boolean => policy.attemptId === target.attemptId
  && policy.contextKind === target.contextKind
  && policy.contextId === target.contextId
  && policy.placementId === target.placementId
  && policy.activityId === target.activityId
  && policy.activityVersionId === target.activityVersionId;

const revisionMatchesTarget = (
  revision: BookActivityEvaluationRevision,
  target: BookActivityEvaluationTarget,
): boolean => stable(revision.target) === stable(target);

const fieldVisible = (
  ownership: BookResultOwnershipDecision,
  evaluationState: 'pending_review' | 'graded',
  release: BookEvaluationFieldRelease,
  field: 'response' | 'score' | 'feedback',
): boolean => {
  const decision = classifyBookResultVisibility({
    ownership,
    evaluationState,
    feedbackRelease: release,
  });
  if (field === 'response') return decision.canViewResponse;
  if (field === 'score') return decision.canViewScore;
  return decision.canViewFeedback;
};

const revisionByNumber = (
  history: readonly BookActivityEvaluationRevision[],
  revision: number | undefined,
): BookActivityEvaluationRevision | undefined => (
  revision === undefined ? undefined : history.find((entry) => entry.revision === revision)
);

const visibleEvaluationChanged = (
  previous: BookActivityEvaluationRevision,
  current: BookActivityEvaluationRevision,
  policy: BookResultReleasePolicyAuthority,
): boolean => (
  (policy.fields.score === 'released'
    && stable([
      previous.facts.earnedScore,
      previous.facts.maximumScore,
      previous.facts.displayScore,
    ]) !== stable([
      current.facts.earnedScore,
      current.facts.maximumScore,
      current.facts.displayScore,
    ]))
  || (policy.fields.feedback === 'released'
    && previous.facts.feedback !== current.facts.feedback)
  || (policy.fields.correctness === 'released'
    && stable(previous.facts.correctionFacts) !== stable(current.facts.correctionFacts))
);

const correctionNote = (
  current: BookActivityEvaluationRevision,
): string => {
  const notes = current.facts.correctionFacts
    .map((fact) => fact.note?.trim())
    .filter((note): note is string => Boolean(note));
  return notes.length > 0
    ? notes.join(' ')
    : 'Previously released evaluation information was corrected by your teacher.';
};

/**
 * Server-safe Book result projection. Callers must supply ownership and the
 * exact attempt/context release-policy snapshot from trusted resolvers.
 *
 * Denied values are never copied into the returned object. The renderer sees
 * absence, not an authority decision or a hidden value.
 */
export const projectBookActivityStudentResult = (
  input: ProjectBookActivityStudentResultInput,
): BookActivityStudentResultProjection => {
  const hidden = (): BookActivityStudentResultProjection => freeze({
    attemptId: input.target.attemptId,
    status: 'hidden',
  });
  if (input.presentationEnabled !== true
    || !input.ownership.visible
    || input.ownership.attemptId !== input.target.attemptId
    || !policyMatchesTarget(input.policy, input.target)) {
    return hidden();
  }

  const current = input.currentEvaluation ?? null;
  const history = input.history ?? [];
  if ((current !== null && !revisionMatchesTarget(current, input.target))
    || history.some((revision) => !revisionMatchesTarget(revision, input.target))) {
    return hidden();
  }
  const evaluationState = current?.facts.status === 'scored' ? 'graded' : 'pending_review';
  const projection: {
    attemptId: string;
    status: BookActivityStudentResultProjection['status'];
    studentResponse?: unknown;
    answerKey?: unknown;
    correctness?: readonly BookActivityCorrectionFact[];
    score?: BookActivityStudentResultProjection['score'];
    feedback?: string;
    correction?: BookActivityStudentCorrectionProjection;
  } = {
    attemptId: input.target.attemptId,
    status: evaluationState,
  };

  if (fieldVisible(input.ownership, evaluationState, 'withheld', 'response')) {
    projection.studentResponse = clone(input.studentResponse);
  }

  const evaluationComplete = current?.facts.status === 'scored';
  if (evaluationComplete
    && input.policy.fields.answerKey === 'released'
    && fieldVisible(input.ownership, evaluationState, 'released', 'feedback')
    && input.answerKey !== undefined) {
    projection.answerKey = clone(input.answerKey);
  }
  if (evaluationComplete
    && input.policy.fields.correctness === 'released'
    && fieldVisible(input.ownership, evaluationState, 'released', 'feedback')) {
    projection.correctness = clone(current.facts.correctionFacts);
  }
  if (evaluationComplete
    && input.policy.fields.score === 'released'
    && fieldVisible(input.ownership, evaluationState, 'released', 'score')
    && current.facts.earnedScore !== undefined
    && current.facts.maximumScore !== undefined
    && current.facts.displayScore !== undefined) {
    projection.score = {
      earnedScore: current.facts.earnedScore,
      maximumScore: current.facts.maximumScore,
      displayScore: current.facts.displayScore,
    };
  }
  if (evaluationComplete
    && input.policy.fields.feedback === 'released'
    && fieldVisible(input.ownership, evaluationState, 'released', 'feedback')
    && current.facts.feedback !== undefined) {
    projection.feedback = current.facts.feedback;
  }

  const previous = revisionByNumber(history, input.previouslyVisibleRevision);
  if (evaluationComplete
    && previous
    && previous.revision < current.revision
    && input.policy.fields.correctionNote === 'released'
    && fieldVisible(input.ownership, evaluationState, 'released', 'feedback')
    && visibleEvaluationChanged(previous, current, input.policy)) {
    projection.correction = {
      note: correctionNote(current),
      revision: current.revision,
      previousRevision: previous.revision,
      evaluatedAt: current.evaluatedAt,
    };
  }

  return freeze(projection);
};
