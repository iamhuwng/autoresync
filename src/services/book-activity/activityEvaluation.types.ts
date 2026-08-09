import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../types/bookActivity.types';
import type {
  BookRuntimeAttemptRecord,
  BookRuntimeSourceProvenance,
} from './activityRuntimeAttempt.types';

export const ACTIVITY_EVALUATION_SCHEMA_VERSION = 1 as const;
export const ACTIVITY_EVALUATION_SCORER_VERSION = 1 as const;

export const canonicalActivityEvaluationFingerprint = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalActivityEvaluationFingerprint).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalActivityEvaluationFingerprint(record[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
};

export type BookActivityEvaluationContextKind = 'solo' | 'homework' | 'course' | 'class';
export type BookActivityEvaluationCommandKind =
  | 'evaluate_objective'
  | 'regrade_objective'
  | 'teacher_evaluation'
  | 'regrade';

export interface BookActivityEvaluationTarget {
  readonly attemptId: string;
  readonly resultId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextKind: BookActivityEvaluationContextKind;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly activityVersionId: string;
  readonly attemptNumber: number;
  readonly pageGroupKeys: readonly string[];
  readonly sourceProvenance: readonly BookRuntimeSourceProvenance[];
}

export interface BookActivityCorrectionFact {
  readonly interactionId: string;
  readonly outcome: 'correct' | 'incorrect' | 'partial' | 'not_applicable';
  readonly note?: string;
}

export interface BookActivityTeacherEvaluation {
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly feedback?: string;
  readonly correctionFacts?: readonly BookActivityCorrectionFact[];
}

interface BookActivityEvaluationCommandBase {
  readonly schemaVersion: typeof ACTIVITY_EVALUATION_SCHEMA_VERSION;
  readonly scorerVersion: typeof ACTIVITY_EVALUATION_SCORER_VERSION;
  readonly operationId: string;
  readonly expectedEvaluationRevision: number;
  readonly target: BookActivityEvaluationTarget;
}

export type BookActivityEvaluationCommand =
  | (BookActivityEvaluationCommandBase & {
      readonly kind: 'evaluate_objective' | 'regrade_objective';
      readonly evaluation?: never;
    })
  | (BookActivityEvaluationCommandBase & {
      readonly kind: 'teacher_evaluation' | 'regrade';
      readonly evaluation: BookActivityTeacherEvaluation;
    });

export type BookActivityEvaluationActor =
  | {
      readonly kind: 'trusted_scorer';
      readonly serviceIdentity: string;
    }
  | {
      readonly kind: 'teacher';
      readonly uid: string;
    };

export interface BookActivityEvaluationAuthority {
  readonly ownerId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextKind: BookActivityEvaluationContextKind;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
}

export interface ResolvedBookActivityEvaluationAttempt {
  readonly attempt: BookRuntimeAttemptRecord;
  readonly contextKind: BookActivityEvaluationContextKind;
  readonly activity: NormalizedActivity;
  readonly submission: ActivitySubmission;
}

export interface BookActivityEvaluationFacts {
  readonly status: 'scored' | 'review_required';
  readonly earnedScore?: number;
  readonly maximumScore?: number;
  readonly displayScore?: string;
  readonly feedback?: string;
  readonly correctionFacts: readonly BookActivityCorrectionFact[];
}

export interface BookActivityEvaluationRevision {
  readonly schemaVersion: typeof ACTIVITY_EVALUATION_SCHEMA_VERSION;
  readonly revision: number;
  readonly previousRevision: number;
  readonly operationId: string;
  readonly commandKind: BookActivityEvaluationCommandKind;
  readonly commandFingerprint: string;
  readonly scorerVersion: typeof ACTIVITY_EVALUATION_SCORER_VERSION;
  readonly activitySchemaVersion: number;
  readonly target: BookActivityEvaluationTarget;
  readonly facts: BookActivityEvaluationFacts;
  readonly evaluatedBy:
    | { readonly kind: 'trusted_scorer'; readonly serviceIdentity: string }
    | { readonly kind: 'teacher'; readonly uid: string };
  readonly evaluatedAt: string;
}

export interface BookActivityEvaluationOperation {
  readonly operationId: string;
  readonly commandFingerprint: string;
  readonly actorFingerprint: string;
  readonly revision: number;
  readonly createdAt: string;
}

export type BookActivityEvaluationFailureCode =
  | 'evaluation_command_malformed'
  | 'evaluation_command_unsupported'
  | 'evaluation_actor_unauthorized'
  | 'evaluation_attempt_not_found'
  | 'evaluation_attempt_mismatch'
  | 'evaluation_version_mismatch'
  | 'evaluation_objective_scorer_required'
  | 'evaluation_subjective_teacher_required'
  | 'evaluation_teacher_payload_invalid'
  | 'evaluation_stale_revision'
  | 'evaluation_replay_conflict'
  | 'evaluation_repository_conflict';

export type BookActivityEvaluationCommandResult =
  | {
      readonly status: 'accepted' | 'replayed';
      readonly revision: BookActivityEvaluationRevision;
    }
  | {
      readonly status: 'rejected';
      readonly code: BookActivityEvaluationFailureCode;
      readonly currentRevision?: number;
    };

export interface BookActivityEvaluationRepository {
  readOperation(input: {
    readonly target: BookActivityEvaluationTarget;
    readonly operationId: string;
  }): Promise<{
    readonly operation: BookActivityEvaluationOperation;
    readonly revision: BookActivityEvaluationRevision;
  } | null>;
  appendRevision(input: {
    readonly revision: BookActivityEvaluationRevision;
    readonly operation: BookActivityEvaluationOperation;
  }): Promise<BookActivityEvaluationCommandResult>;
  listHistory(input: {
    readonly target: BookActivityEvaluationTarget;
    readonly limit: number;
  }): Promise<readonly BookActivityEvaluationRevision[]>;
}
