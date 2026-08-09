import { ACTIVITY_SCHEMA_VERSION } from '../../types/bookActivity.types';
import { scoreActivity } from './activityScoring.service';
import {
  ACTIVITY_EVALUATION_SCHEMA_VERSION,
  ACTIVITY_EVALUATION_SCORER_VERSION,
  canonicalActivityEvaluationFingerprint,
  type BookActivityCorrectionFact,
  type BookActivityEvaluationActor,
  type BookActivityEvaluationAuthority,
  type BookActivityEvaluationCommand,
  type BookActivityEvaluationCommandResult,
  type BookActivityEvaluationFailureCode,
  type BookActivityEvaluationFacts,
  type BookActivityEvaluationOperation,
  type BookActivityEvaluationRepository,
  type BookActivityEvaluationRevision,
  type BookActivityEvaluationTarget,
  type ResolvedBookActivityEvaluationAttempt,
} from './activityEvaluation.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_FEEDBACK_LENGTH = 4_000;
const MAX_CORRECTION_FACTS = 100;
const MAX_CORRECTION_NOTE_LENGTH = 1_000;
const MAX_SCORE = 10_000;

export interface BookActivityEvaluationDependencies {
  readonly repository: BookActivityEvaluationRepository;
  resolveAttempt(
    target: BookActivityEvaluationTarget,
  ): Promise<ResolvedBookActivityEvaluationAttempt | null>;
  resolveTeacherAuthority(input: {
    readonly actorUid: string;
    readonly target: BookActivityEvaluationTarget;
  }): Promise<BookActivityEvaluationAuthority | null>;
  readonly trustedScorerIdentity: string;
  readonly now?: () => string;
}

const rejected = (
  code: BookActivityEvaluationFailureCode,
  currentRevision?: number,
): BookActivityEvaluationCommandResult => ({
  status: 'rejected',
  code,
  ...(currentRevision === undefined ? {} : { currentRevision }),
});

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
};

const validIso = (value: string): boolean => (
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
);

const validTarget = (target: unknown): target is BookActivityEvaluationTarget => {
  if (!exactKeys(target, [
    'attemptId', 'resultId', 'recipientId', 'bindingId', 'bindingRevision',
    'contextKind', 'contextId', 'placementId', 'activityId', 'activityVersion',
    'interactionId', 'activityVersionId', 'attemptNumber', 'pageGroupKeys',
    'sourceProvenance',
  ])) return false;
  const ids = [
    target.attemptId, target.resultId, target.recipientId, target.bindingId,
    target.contextId, target.placementId, target.activityId, target.interactionId,
    target.activityVersionId,
  ];
  if (!ids.every((value) => typeof value === 'string' && ID.test(value))
    || !['solo', 'homework', 'course', 'class'].includes(target.contextKind as string)
    || !Number.isSafeInteger(target.bindingRevision) || (target.bindingRevision as number) < 1
    || !Number.isSafeInteger(target.activityVersion) || (target.activityVersion as number) < 1
    || !Number.isSafeInteger(target.attemptNumber) || (target.attemptNumber as number) < 1
    || !Array.isArray(target.pageGroupKeys)
    || !target.pageGroupKeys.every((value) => typeof value === 'string' && ID.test(value))
    || new Set(target.pageGroupKeys as string[]).size !== target.pageGroupKeys.length
    || !Array.isArray(target.sourceProvenance)) return false;
  return target.sourceProvenance.every((source) => exactKeys(
    source,
    ['sourceKey', 'sourceVersionId', 'pages'],
  )
    && typeof source.sourceKey === 'string' && ID.test(source.sourceKey)
    && typeof source.sourceVersionId === 'string' && ID.test(source.sourceVersionId)
    && Array.isArray(source.pages) && source.pages.length > 0
    && source.pages.every((page) => Number.isSafeInteger(page) && page > 0)
    && new Set(source.pages).size === source.pages.length);
};

const validCorrectionFacts = (
  value: unknown,
  interactionIds: ReadonlySet<string>,
): value is readonly BookActivityCorrectionFact[] => Array.isArray(value)
  && value.length <= MAX_CORRECTION_FACTS
  && value.every((fact) => exactKeys(fact, ['interactionId', 'outcome'], ['note'])
    && typeof fact.interactionId === 'string'
    && interactionIds.has(fact.interactionId)
    && ['correct', 'incorrect', 'partial', 'not_applicable'].includes(fact.outcome as string)
    && (fact.note === undefined
      || (typeof fact.note === 'string' && fact.note.length <= MAX_CORRECTION_NOTE_LENGTH)))
  && new Set(value.map((fact) => fact.interactionId)).size === value.length;

const validCommand = (command: unknown): command is BookActivityEvaluationCommand => {
  if (!exactKeys(command, [
    'schemaVersion', 'scorerVersion', 'operationId', 'kind',
    'expectedEvaluationRevision', 'target',
  ], ['evaluation'])) return false;
  if (command.schemaVersion !== ACTIVITY_EVALUATION_SCHEMA_VERSION
    || command.scorerVersion !== ACTIVITY_EVALUATION_SCORER_VERSION
    || typeof command.operationId !== 'string' || !ID.test(command.operationId)
    || !['evaluate_objective', 'regrade_objective', 'teacher_evaluation', 'regrade'].includes(command.kind as string)
    || !Number.isSafeInteger(command.expectedEvaluationRevision)
    || (command.expectedEvaluationRevision as number) < 0
    || !validTarget(command.target)) return false;
  if (command.kind === 'evaluate_objective' || command.kind === 'regrade_objective') {
    return command.evaluation === undefined;
  }
  return exactKeys(command.evaluation, ['earnedScore', 'maximumScore'], ['feedback', 'correctionFacts']);
};

const validActor = (actor: unknown): actor is BookActivityEvaluationActor => {
  if (exactKeys(actor, ['kind', 'serviceIdentity'])) {
    return actor.kind === 'trusted_scorer'
      && typeof actor.serviceIdentity === 'string'
      && ID.test(actor.serviceIdentity);
  }
  if (exactKeys(actor, ['kind', 'uid'])) {
    return actor.kind === 'teacher'
      && typeof actor.uid === 'string'
      && ID.test(actor.uid);
  }
  return false;
};

const targetFor = (
  resolved: ResolvedBookActivityEvaluationAttempt,
): BookActivityEvaluationTarget => ({
  attemptId: resolved.attempt.attemptId,
  resultId: `${resolved.attempt.attemptId}:result`,
  recipientId: resolved.attempt.recipientId,
  bindingId: resolved.attempt.bindingId,
  bindingRevision: resolved.attempt.bindingRevision,
  contextKind: resolved.contextKind,
  contextId: resolved.attempt.contextId,
  placementId: resolved.attempt.placementId,
  activityId: resolved.attempt.activityId,
  activityVersion: resolved.attempt.activityVersion,
  interactionId: resolved.attempt.interactionId,
  activityVersionId: resolved.attempt.activityVersionId,
  attemptNumber: resolved.attempt.attemptNumber,
  pageGroupKeys: [...resolved.attempt.pageGroupKeys],
  sourceProvenance: structuredClone(resolved.attempt.sourceProvenance),
});

const authorityMatches = (
  authority: BookActivityEvaluationAuthority,
  target: BookActivityEvaluationTarget,
  actorUid: string,
): boolean => authority.ownerId === actorUid
  && authority.recipientId === target.recipientId
  && authority.bindingId === target.bindingId
  && authority.bindingRevision === target.bindingRevision
  && authority.contextKind === target.contextKind
  && authority.contextId === target.contextId
  && authority.placementId === target.placementId
  && authority.activityId === target.activityId
  && authority.activityVersion === target.activityVersion
  && authority.activityVersionId === target.activityVersionId;

const teacherFacts = (
  command: Extract<BookActivityEvaluationCommand, { kind: 'teacher_evaluation' | 'regrade' }>,
  resolved: ResolvedBookActivityEvaluationAttempt,
): BookActivityEvaluationFacts | null => {
  const evaluation = command.evaluation;
  const interactionIds = new Set(resolved.activity.interactions.map((entry) => entry.interactionId));
  if (!Number.isFinite(evaluation.earnedScore)
    || !Number.isFinite(evaluation.maximumScore)
    || evaluation.earnedScore < 0
    || evaluation.maximumScore < 0
    || evaluation.maximumScore > MAX_SCORE
    || evaluation.earnedScore > evaluation.maximumScore
    || Math.abs(evaluation.earnedScore * 100 - Math.round(evaluation.earnedScore * 100)) > 1e-9
    || Math.abs(evaluation.maximumScore * 100 - Math.round(evaluation.maximumScore * 100)) > 1e-9
    || (evaluation.feedback !== undefined
      && (typeof evaluation.feedback !== 'string'
        || evaluation.feedback.length > MAX_FEEDBACK_LENGTH))
    || !validCorrectionFacts(evaluation.correctionFacts ?? [], interactionIds)) return null;
  return {
    status: 'scored',
    earnedScore: evaluation.earnedScore,
    maximumScore: evaluation.maximumScore,
    displayScore: `${evaluation.earnedScore.toFixed(2)} / ${evaluation.maximumScore.toFixed(2)}`,
    ...(evaluation.feedback === undefined ? {} : { feedback: evaluation.feedback }),
    correctionFacts: structuredClone(evaluation.correctionFacts ?? []),
  };
};

export class TrustedBookActivityEvaluationService {
  constructor(private readonly dependencies: BookActivityEvaluationDependencies) {}

  async applyEvaluationCommand(
    commandInput: BookActivityEvaluationCommand,
    actor: BookActivityEvaluationActor,
  ): Promise<BookActivityEvaluationCommandResult> {
    let command: BookActivityEvaluationCommand;
    let safeActor: BookActivityEvaluationActor;
    try {
      command = structuredClone(commandInput);
      safeActor = structuredClone(actor);
    } catch {
      return rejected('evaluation_command_malformed');
    }
    if (!validCommand(command)) return rejected('evaluation_command_malformed');
    if (!validActor(safeActor)) return rejected('evaluation_actor_unauthorized');
    const actorFingerprint = canonicalActivityEvaluationFingerprint(safeActor);
    const commandFingerprint = canonicalActivityEvaluationFingerprint(command);

    try {
      const prior = await this.dependencies.repository.readOperation({
        target: command.target,
        operationId: command.operationId,
      });
      if (prior) {
        return prior.operation.commandFingerprint === commandFingerprint
          && prior.operation.actorFingerprint === actorFingerprint
          ? { status: 'replayed', revision: prior.revision }
          : rejected('evaluation_replay_conflict', prior.revision.revision);
      }

      const resolved = await this.dependencies.resolveAttempt(command.target);
      if (!resolved) return rejected('evaluation_attempt_not_found');
      if (canonicalActivityEvaluationFingerprint(targetFor(resolved))
        !== canonicalActivityEvaluationFingerprint(command.target)) {
        return rejected('evaluation_attempt_mismatch');
      }
      if (resolved.attempt.schemaVersion !== 1
        || resolved.activity.schemaVersion !== ACTIVITY_SCHEMA_VERSION
        || command.schemaVersion !== ACTIVITY_EVALUATION_SCHEMA_VERSION
        || command.scorerVersion !== ACTIVITY_EVALUATION_SCORER_VERSION) {
        return rejected('evaluation_version_mismatch');
      }

      let facts: BookActivityEvaluationFacts;
      if (command.kind === 'evaluate_objective' || command.kind === 'regrade_objective') {
        if (safeActor.kind !== 'trusted_scorer'
          || safeActor.serviceIdentity !== this.dependencies.trustedScorerIdentity) {
          return rejected('evaluation_objective_scorer_required');
        }
        if (resolved.activity.interaction.family === 'long-response'
          || resolved.activity.scoring.mode === 'review-required') {
          return rejected('evaluation_subjective_teacher_required');
        }
        const scored = scoreActivity(resolved.activity, resolved.submission);
        if (scored.status === 'invalid') return rejected('evaluation_command_unsupported');
        facts = scored.status === 'review_required'
          ? { status: 'review_required', correctionFacts: [] }
          : { ...scored, correctionFacts: [] };
      } else if (command.kind === 'teacher_evaluation' || command.kind === 'regrade') {
        if (safeActor.kind !== 'teacher') return rejected('evaluation_actor_unauthorized');
        const authority = await this.dependencies.resolveTeacherAuthority({
          actorUid: safeActor.uid,
          target: command.target,
        });
        if (!authority || !authorityMatches(authority, command.target, safeActor.uid)) {
          return rejected('evaluation_actor_unauthorized');
        }
        const evaluated = teacherFacts(command, resolved);
        if (!evaluated) return rejected('evaluation_teacher_payload_invalid');
        facts = evaluated;
      } else {
        return rejected('evaluation_command_unsupported');
      }

      if ((command.kind === 'regrade' || command.kind === 'regrade_objective')
        && command.expectedEvaluationRevision === 0) {
        return rejected('evaluation_stale_revision', 0);
      }
      if (command.kind === 'teacher_evaluation'
        && resolved.activity.interaction.family !== 'long-response'
        && resolved.activity.scoring.mode !== 'review-required') {
        return rejected('evaluation_subjective_teacher_required');
      }

      const evaluatedAt = (this.dependencies.now ?? (() => new Date().toISOString()))();
      if (!validIso(evaluatedAt)) return rejected('evaluation_repository_conflict');
      const revision: BookActivityEvaluationRevision = {
        schemaVersion: ACTIVITY_EVALUATION_SCHEMA_VERSION,
        revision: command.expectedEvaluationRevision + 1,
        previousRevision: command.expectedEvaluationRevision,
        operationId: command.operationId,
        commandKind: command.kind,
        commandFingerprint,
        scorerVersion: ACTIVITY_EVALUATION_SCORER_VERSION,
        activitySchemaVersion: ACTIVITY_SCHEMA_VERSION,
        target: structuredClone(command.target),
        facts,
        evaluatedBy: safeActor.kind === 'teacher'
          ? { kind: 'teacher', uid: safeActor.uid }
          : { kind: 'trusted_scorer', serviceIdentity: safeActor.serviceIdentity },
        evaluatedAt,
      };
      const operation: BookActivityEvaluationOperation = {
        operationId: command.operationId,
        commandFingerprint,
        actorFingerprint,
        revision: revision.revision,
        createdAt: evaluatedAt,
      };
      return this.dependencies.repository.appendRevision({ revision, operation });
    } catch {
      return rejected('evaluation_repository_conflict');
    }
  }
}

export const createTrustedBookActivityEvaluationService = (
  dependencies: BookActivityEvaluationDependencies,
): TrustedBookActivityEvaluationService => new TrustedBookActivityEvaluationService(dependencies);
