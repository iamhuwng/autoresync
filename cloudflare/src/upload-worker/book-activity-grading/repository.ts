import type {
  BookActivityCorrectionFact,
  BookActivityEvaluationCommandResult,
  BookActivityEvaluationOperation,
  BookActivityEvaluationRepository,
  BookActivityEvaluationRevision,
  BookActivityEvaluationTarget,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import {
  canonicalActivityEvaluationFingerprint,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

export const BOOK_ACTIVITY_EVALUATION_ROOT = 'book_activity_evaluations';
export const BOOK_ACTIVITY_EVALUATION_MAX_HISTORY = 100;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_SCOPE_BYTES = 512 * 1024;
const MAX_RETRIES = 5;

interface AggregateScoreFact {
  readonly revision: number;
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly displayScore: string;
}

interface CorrectionRevisionFact {
  readonly revision: number;
  readonly facts: readonly BookActivityCorrectionFact[];
}

interface DurableEvaluationScope {
  readonly current?: BookActivityEvaluationRevision;
  readonly history?: Readonly<Record<string, BookActivityEvaluationRevision>>;
  readonly corrections?: Readonly<Record<string, CorrectionRevisionFact>>;
  readonly aggregateScores?: Readonly<Record<string, AggregateScoreFact>>;
  readonly operations?: Readonly<Record<string, BookActivityEvaluationOperation>>;
}

export interface BookActivityEvaluationRepositorySnapshot {
  readonly scopes: Readonly<Record<string, DurableEvaluationScope>>;
}

export class BookActivityEvaluationRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookActivityEvaluationRepositoryError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);
export const bookActivityEvaluationTargetsEqual = (
  left: BookActivityEvaluationTarget,
  right: BookActivityEvaluationTarget,
): boolean => canonicalActivityEvaluationFingerprint(left)
  === canonicalActivityEvaluationFingerprint(right);

const pathId = (value: string, label: string): string => {
  if (!ID.test(value)) throw new BookActivityEvaluationRepositoryError(`evaluation_${label}_path_invalid`);
  return value;
};

export const bookActivityEvaluationScopePath = (
  target: BookActivityEvaluationTarget,
): string => [
  BOOK_ACTIVITY_EVALUATION_ROOT,
  'scopes',
  pathId(target.recipientId, 'recipient'),
  pathId(target.contextId, 'context'),
  pathId(target.placementId, 'placement'),
  pathId(target.activityId, 'activity'),
  pathId(target.attemptId, 'attempt'),
].join('/');

export const bookActivityEvaluationHistoryPath = (
  target: BookActivityEvaluationTarget,
): string => `${bookActivityEvaluationScopePath(target)}/history`;

const revisionKey = (revision: number): string => {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > BOOK_ACTIVITY_EVALUATION_MAX_HISTORY) {
    throw new BookActivityEvaluationRepositoryError('evaluation_revision_invalid');
  }
  return `r${String(revision).padStart(6, '0')}`;
};

const encodedBytes = (value: unknown): number => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new BookActivityEvaluationRepositoryError('evaluation_scope_unserializable');
  return new TextEncoder().encode(encoded).byteLength;
};

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const durableScope = (value: unknown): DurableEvaluationScope => {
  if (value === null || value === undefined) return {};
  const source = record(value);
  if (!source || encodedBytes(source) > MAX_SCOPE_BYTES) {
    throw new BookActivityEvaluationRepositoryError('evaluation_scope_invalid');
  }
  const allowed = new Set(['current', 'history', 'corrections', 'aggregateScores', 'operations']);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new BookActivityEvaluationRepositoryError('evaluation_scope_unknown_field');
  }
  for (const key of ['history', 'corrections', 'aggregateScores', 'operations']) {
    if (source[key] !== undefined) {
      const entries = record(source[key]);
      if (!entries || Object.keys(entries).length > BOOK_ACTIVITY_EVALUATION_MAX_HISTORY) {
        throw new BookActivityEvaluationRepositoryError('evaluation_history_unbounded');
      }
    }
  }
  return clone(source as DurableEvaluationScope);
};

const assertScopeIntegrity = (scope: DurableEvaluationScope): void => {
  const history = scope.history ?? {};
  const operations = scope.operations ?? {};
  const revisions = Object.values(history).sort((left, right) => left.revision - right.revision);
  const firstTarget = revisions[0]?.target;
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index]!;
    if (revision.revision !== index + 1
      || revision.previousRevision !== index
      || history[revisionKey(revision.revision)] === undefined
      || canonicalActivityEvaluationFingerprint(history[revisionKey(revision.revision)])
        !== canonicalActivityEvaluationFingerprint(revision)
      || (firstTarget !== undefined
        && !bookActivityEvaluationTargetsEqual(revision.target, firstTarget))) {
      throw new BookActivityEvaluationRepositoryError('evaluation_history_invalid');
    }
    const operation = operations[revision.operationId];
    if (!operation
      || operation.revision !== revision.revision
      || operation.commandFingerprint !== revision.commandFingerprint) {
      throw new BookActivityEvaluationRepositoryError('evaluation_operation_incomplete');
    }
    const aggregate = scope.aggregateScores?.[revisionKey(revision.revision)];
    if (revision.facts.status === 'scored') {
      if (!aggregate
        || aggregate.revision !== revision.revision
        || aggregate.earnedScore !== revision.facts.earnedScore
        || aggregate.maximumScore !== revision.facts.maximumScore
        || aggregate.displayScore !== revision.facts.displayScore) {
        throw new BookActivityEvaluationRepositoryError('evaluation_aggregate_invalid');
      }
    } else if (aggregate) {
      throw new BookActivityEvaluationRepositoryError('evaluation_aggregate_invalid');
    }
    const correction = scope.corrections?.[revisionKey(revision.revision)];
    if (!correction
      || correction.revision !== revision.revision
      || canonicalActivityEvaluationFingerprint(correction.facts)
        !== canonicalActivityEvaluationFingerprint(revision.facts.correctionFacts)) {
      throw new BookActivityEvaluationRepositoryError('evaluation_correction_invalid');
    }
  }
  if ((scope.current === undefined) !== (revisions.length === 0)
    || (scope.current && (
      scope.current.revision !== revisions.length
      || canonicalActivityEvaluationFingerprint(scope.current)
        !== canonicalActivityEvaluationFingerprint(revisions[revisions.length - 1])
    ))) {
    throw new BookActivityEvaluationRepositoryError('evaluation_current_invalid');
  }
};

const nextScope = (
  scope: DurableEvaluationScope,
  revision: BookActivityEvaluationRevision,
  operation: BookActivityEvaluationOperation,
): DurableEvaluationScope | BookActivityEvaluationCommandResult => {
  assertScopeIntegrity(scope);
  const existingOperation = scope.operations?.[operation.operationId];
  if (existingOperation) {
    const existingRevision = scope.history?.[revisionKey(existingOperation.revision)];
    if (!existingRevision) throw new BookActivityEvaluationRepositoryError('evaluation_operation_incomplete');
    return existingOperation.commandFingerprint === operation.commandFingerprint
      && existingOperation.actorFingerprint === operation.actorFingerprint
      ? { status: 'replayed', revision: clone(existingRevision) }
      : {
        status: 'rejected',
        code: 'evaluation_replay_conflict',
        currentRevision: scope.current?.revision ?? 0,
      };
  }
  const currentRevision = scope.current?.revision ?? 0;
  if (revision.previousRevision !== currentRevision
    || revision.revision !== currentRevision + 1) {
    return {
      status: 'rejected',
      code: 'evaluation_stale_revision',
      currentRevision,
    };
  }
  if (revision.revision > BOOK_ACTIVITY_EVALUATION_MAX_HISTORY) {
    return {
      status: 'rejected',
      code: 'evaluation_repository_conflict',
      currentRevision,
    };
  }
  if (!bookActivityEvaluationTargetsEqual(
    revision.target,
    scope.current?.target ?? revision.target,
  )) {
    return {
      status: 'rejected',
      code: 'evaluation_attempt_mismatch',
      currentRevision,
    };
  }
  const key = revisionKey(revision.revision);
  const next: DurableEvaluationScope = {
    current: clone(revision),
    history: { ...(scope.history ?? {}), [key]: clone(revision) },
    corrections: {
      ...(scope.corrections ?? {}),
      [key]: { revision: revision.revision, facts: clone(revision.facts.correctionFacts) },
    },
    aggregateScores: {
      ...(scope.aggregateScores ?? {}),
      ...(revision.facts.status === 'scored'
        ? {
          [key]: {
            revision: revision.revision,
            earnedScore: revision.facts.earnedScore!,
            maximumScore: revision.facts.maximumScore!,
            displayScore: revision.facts.displayScore!,
          },
        }
        : {}),
    },
    operations: { ...(scope.operations ?? {}), [operation.operationId]: clone(operation) },
  };
  assertScopeIntegrity(next);
  if (encodedBytes(next) > MAX_SCOPE_BYTES) {
    return {
      status: 'rejected',
      code: 'evaluation_repository_conflict',
      currentRevision,
    };
  }
  return next;
};

const operationResult = (
  scope: DurableEvaluationScope,
  operationId: string,
): { operation: BookActivityEvaluationOperation; revision: BookActivityEvaluationRevision } | null => {
  assertScopeIntegrity(scope);
  const operation = scope.operations?.[operationId];
  if (!operation) return null;
  const revision = scope.history?.[revisionKey(operation.revision)];
  if (!revision) throw new BookActivityEvaluationRepositoryError('evaluation_operation_incomplete');
  return { operation: clone(operation), revision: clone(revision) };
};

const historyRevision = (
  key: string,
  value: unknown,
  target: BookActivityEvaluationTarget,
): BookActivityEvaluationRevision => {
  const source = record(value);
  const facts = record(source?.facts);
  const revisionTarget = record(source?.target);
  const evaluatedBy = record(source?.evaluatedBy);
  const sourceKeysValid = source !== null
    && Object.keys(source).every((sourceKey) => [
      'schemaVersion', 'revision', 'previousRevision', 'operationId', 'commandKind',
      'commandFingerprint', 'scorerVersion', 'activitySchemaVersion', 'target',
      'facts', 'evaluatedBy', 'evaluatedAt',
    ].includes(sourceKey));
  const correctionFacts = facts?.correctionFacts;
  const correctionInteractionIds = new Set<string>();
  const correctionFactsValid = Array.isArray(correctionFacts)
    && correctionFacts.length <= 100
    && correctionFacts.every((fact) => {
      const correction = record(fact);
      if (correction === null
        || typeof correction.interactionId !== 'string'
        || correctionInteractionIds.has(correction.interactionId)) return false;
      correctionInteractionIds.add(correction.interactionId);
      return (
        Object.keys(correction).every((key) => ['interactionId', 'outcome', 'note'].includes(key))
        && ID.test(correction.interactionId)
        && ['correct', 'incorrect', 'partial', 'not_applicable'].includes(correction.outcome as string)
        && (correction.note === undefined
          || (typeof correction.note === 'string' && correction.note.length <= 1_000))
      );
    });
  const factsKeysValid = facts !== null
    && Object.keys(facts).every((key) => [
      'status', 'earnedScore', 'maximumScore', 'displayScore', 'feedback', 'correctionFacts',
    ].includes(key));
  const feedbackValid = facts?.feedback === undefined
    || (typeof facts.feedback === 'string' && facts.feedback.length <= 4_000);
  const scoreValid = facts?.status === 'scored'
    ? Number.isFinite(facts.earnedScore)
      && Number.isFinite(facts.maximumScore)
      && (facts.earnedScore as number) >= 0
      && (facts.maximumScore as number) >= (facts.earnedScore as number)
      && (facts.maximumScore as number) <= 10_000
      && typeof facts.displayScore === 'string'
      && facts.displayScore === `${(facts.earnedScore as number).toFixed(2)} / ${(facts.maximumScore as number).toFixed(2)}`
    : facts?.status === 'review_required'
      && facts.earnedScore === undefined
      && facts.maximumScore === undefined
      && facts.displayScore === undefined;
  const evaluatorValid = evaluatedBy?.kind === 'trusted_scorer'
    ? Object.keys(evaluatedBy).every((evaluatedByKey) => [
      'kind', 'serviceIdentity',
    ].includes(evaluatedByKey))
      && typeof evaluatedBy.serviceIdentity === 'string'
      && ID.test(evaluatedBy.serviceIdentity)
    : evaluatedBy?.kind === 'teacher'
      && Object.keys(evaluatedBy).every((evaluatedByKey) => [
        'kind', 'uid',
      ].includes(evaluatedByKey))
      && typeof evaluatedBy.uid === 'string'
      && ID.test(evaluatedBy.uid);
  const evaluatedAtValid = typeof source?.evaluatedAt === 'string'
    && Number.isFinite(Date.parse(source.evaluatedAt))
    && new Date(source.evaluatedAt).toISOString() === source.evaluatedAt;
  if (!source
    || !facts
    || !revisionTarget
    || !evaluatedBy
    || !sourceKeysValid
    || source.schemaVersion !== 1
    || !Number.isSafeInteger(source.revision)
    || (source.revision as number) < 1
    || source.previousRevision !== (source.revision as number) - 1
    || key !== revisionKey(source.revision as number)
    || typeof source.operationId !== 'string'
    || !ID.test(source.operationId)
    || typeof source.commandFingerprint !== 'string'
    || source.commandFingerprint.length === 0
    || source.scorerVersion !== 1
    || source.activitySchemaVersion !== 1
    || !['evaluate_objective', 'teacher_evaluation', 'regrade'].includes(source.commandKind as string)
    || !['scored', 'review_required'].includes(facts.status as string)
    || !factsKeysValid
    || !correctionFactsValid
    || !feedbackValid
    || !scoreValid
    || !evaluatorValid
    || !evaluatedAtValid
    || !bookActivityEvaluationTargetsEqual(
      revisionTarget as unknown as BookActivityEvaluationTarget,
      target,
    )) {
    throw new BookActivityEvaluationRepositoryError('evaluation_history_readback_invalid');
  }
  return clone(source as unknown as BookActivityEvaluationRevision);
};

export class InMemoryBookActivityEvaluationRepository implements BookActivityEvaluationRepository {
  private readonly scopes: Record<string, DurableEvaluationScope>;

  constructor(initial: BookActivityEvaluationRepositorySnapshot = { scopes: {} }) {
    this.scopes = clone(initial.scopes);
  }

  snapshot(): BookActivityEvaluationRepositorySnapshot {
    return { scopes: clone(this.scopes) };
  }

  async readOperation(input: {
    target: BookActivityEvaluationTarget;
    operationId: string;
  }): Promise<{ operation: BookActivityEvaluationOperation; revision: BookActivityEvaluationRevision } | null> {
    const scope = durableScope(this.scopes[bookActivityEvaluationScopePath(input.target)]);
    return operationResult(scope, pathId(input.operationId, 'operation'));
  }

  async appendRevision(input: {
    revision: BookActivityEvaluationRevision;
    operation: BookActivityEvaluationOperation;
  }): Promise<BookActivityEvaluationCommandResult> {
    const path = bookActivityEvaluationScopePath(input.revision.target);
    const updated = nextScope(durableScope(this.scopes[path]), input.revision, input.operation);
    if ('status' in updated) return updated;
    this.scopes[path] = clone(updated);
    return { status: 'accepted', revision: clone(input.revision) };
  }

  async listHistory(input: {
    target: BookActivityEvaluationTarget;
    limit: number;
  }): Promise<readonly BookActivityEvaluationRevision[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1
      || input.limit > BOOK_ACTIVITY_EVALUATION_MAX_HISTORY) {
      throw new BookActivityEvaluationRepositoryError('evaluation_history_query_unbounded');
    }
    const scope = durableScope(this.scopes[bookActivityEvaluationScopePath(input.target)]);
    assertScopeIntegrity(scope);
    return Object.values(scope.history ?? {})
      .sort((left, right) => left.revision - right.revision)
      .slice(-input.limit)
      .map(clone);
  }
}

export interface FirebaseBookActivityEvaluationRepositoryEnv extends RepositoryEnv {
  readonly BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY?: string;
  readonly BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestBookActivityEvaluationRepository implements BookActivityEvaluationRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly serviceIdentity: string;
  private readonly serviceAccountKey?: string;

  constructor(private readonly options: {
    readonly env: FirebaseBookActivityEvaluationRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    const identity = options.env.BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY?.trim();
    if (!identity) {
      throw new BookActivityEvaluationRepositoryError('missing_evaluation_service_identity');
    }
    const keyJson = options.env.BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new BookActivityEvaluationRepositoryError('missing_evaluation_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
      } catch {
        throw new BookActivityEvaluationRepositoryError('invalid_evaluation_google_sa_key');
      }
      if (clientEmail !== identity) {
        throw new BookActivityEvaluationRepositoryError('evaluation_service_identity_mismatch');
      }
    }
    this.serviceIdentity = identity;
    this.serviceAccountKey = keyJson;
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        ...options.env,
        GOOGLE_SA_KEY: this.serviceAccountKey,
      },
      fetchImpl: options.fetchImpl ?? fetch,
      ...(options.getAccessToken ? { getAccessToken: options.getAccessToken } : {}),
      firebaseAuthToken: Boolean(options.getAccessToken),
    });
  }

  private assertIdentity(): void {
    if (this.options.env.BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY?.trim()
      !== this.serviceIdentity) {
      throw new BookActivityEvaluationRepositoryError('evaluation_service_identity_changed');
    }
    if (this.serviceAccountKey) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(this.serviceAccountKey) as Record<string, unknown>).client_email;
      } catch {
        throw new BookActivityEvaluationRepositoryError('invalid_evaluation_google_sa_key');
      }
      if (clientEmail !== this.serviceIdentity) {
        throw new BookActivityEvaluationRepositoryError('evaluation_service_identity_mismatch');
      }
    }
  }

  async readOperation(input: {
    target: BookActivityEvaluationTarget;
    operationId: string;
  }): Promise<{ operation: BookActivityEvaluationOperation; revision: BookActivityEvaluationRevision } | null> {
    this.assertIdentity();
    const raw = await this.rtdb.readValue(bookActivityEvaluationScopePath(input.target));
    return operationResult(durableScope(raw), pathId(input.operationId, 'operation'));
  }

  async appendRevision(input: {
    revision: BookActivityEvaluationRevision;
    operation: BookActivityEvaluationOperation;
  }): Promise<BookActivityEvaluationCommandResult> {
    this.assertIdentity();
    const path = bookActivityEvaluationScopePath(input.revision.target);
    for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const updated = nextScope(durableScope(current.data), input.revision, input.operation);
      if ('status' in updated) return updated;
      if (await this.rtdb.writeIfMatch(path, updated, current.etag)) {
        return { status: 'accepted', revision: clone(input.revision) };
      }
    }
    return { status: 'rejected', code: 'evaluation_repository_conflict' };
  }

  async listHistory(input: {
    target: BookActivityEvaluationTarget;
    limit: number;
  }): Promise<readonly BookActivityEvaluationRevision[]> {
    this.assertIdentity();
    if (!Number.isSafeInteger(input.limit) || input.limit < 1
      || input.limit > BOOK_ACTIVITY_EVALUATION_MAX_HISTORY) {
      throw new BookActivityEvaluationRepositoryError('evaluation_history_query_unbounded');
    }
    const raw = await this.rtdb.readValue(bookActivityEvaluationHistoryPath(input.target), {
      orderBy: '$key',
      limitToLast: input.limit,
    });
    const rows = record(raw);
    if (!rows) return [];
    if (Object.keys(rows).length > input.limit) {
      throw new BookActivityEvaluationRepositoryError('evaluation_history_query_unbounded');
    }
    return Object.entries(rows)
      .map(([key, value]) => historyRevision(key, value, input.target))
      .sort((left, right) => left.revision - right.revision);
  }
}
