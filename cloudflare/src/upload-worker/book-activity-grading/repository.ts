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
import { isBookActivityEvaluationTarget } from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';

export const BOOK_ACTIVITY_EVALUATION_ROOT = 'book_activity_evaluations';
export const BOOK_ACTIVITY_EVALUATION_MAX_HISTORY = 100;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_SCOPE_BYTES = 512 * 1024;

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

type StoredEvaluationRevision = Omit<BookActivityEvaluationRevision, 'target'> & {
  readonly target?: BookActivityEvaluationTarget;
  readonly targetRevisionKey?: 'r000001';
};

interface DurableEvaluationScope {
  readonly current?: { readonly revision: number; readonly revisionKey: string; readonly operationId: string };
  readonly history?: Readonly<Record<string, StoredEvaluationRevision>>;
  readonly corrections?: Readonly<Record<string, CorrectionRevisionFact>>;
  readonly aggregateScores?: Readonly<Record<string, AggregateScoreFact>>;
  readonly operations?: Readonly<Record<string, BookActivityEvaluationOperation>>;
}

type HydratedEvaluationScope = Omit<DurableEvaluationScope, 'history'> & {
  readonly history?: Readonly<Record<string, BookActivityEvaluationRevision>>;
};

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
  if (typeof value !== 'string' || !ID.test(value)) throw new BookActivityEvaluationRepositoryError(`evaluation_${label}_path_invalid`);
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

// RTDB omits empty arrays; these two arrays have a canonical empty meaning.
const hydrateRevision = (value: unknown): unknown => {
  const source = record(value);
  const facts = record(source?.facts);
  const target = record(source?.target);
  return source ? { ...source,
    ...(facts ? { facts: { ...facts, correctionFacts: facts.correctionFacts === undefined ? [] : facts.correctionFacts } } : {}),
    ...(target ? { target: { ...target,
      pageGroupKeys: target.pageGroupKeys === undefined ? [] : target.pageGroupKeys,
      sourceProvenance: target.sourceProvenance === undefined ? [] : target.sourceProvenance,
    } } : {}),
  } : value;
};

const encodeRevision = (revision: BookActivityEvaluationRevision): StoredEvaluationRevision => {
  if (revision.revision === 1) return clone(revision);
  const { target: _target, ...row } = revision;
  return { ...clone(row), targetRevisionKey: 'r000001' };
};

const encodeScope = (scope: HydratedEvaluationScope): DurableEvaluationScope => ({
  ...clone(scope), history: Object.fromEntries(Object.entries(scope.history ?? {})
    .map(([key, row]) => [key, encodeRevision(row)])),
});

const decodeRevision = (key: string, value: unknown, anchor: BookActivityEvaluationRevision,
  requestedTarget: BookActivityEvaluationTarget): BookActivityEvaluationRevision => {
  const row = record(value);
  if (!row || (key === 'r000001'
    ? row.target === undefined || row.targetRevisionKey !== undefined
    : row.target !== undefined || row.targetRevisionKey !== 'r000001')) {
    throw new BookActivityEvaluationRepositoryError('evaluation_target_anchor_invalid');
  }
  const { targetRevisionKey: _reference, ...fields } = row;
  return historyRevision(key, { ...fields, target: anchor.target }, requestedTarget);
};

const targetAnchor = (value: unknown, target: BookActivityEvaluationTarget): BookActivityEvaluationRevision => {
  const row = record(value);
  if (!row || row.targetRevisionKey !== undefined || row.target === undefined) {
    throw new BookActivityEvaluationRepositoryError('evaluation_target_anchor_invalid');
  }
  return historyRevision('r000001', row, target);
};

const durableScope = (value: unknown, target: BookActivityEvaluationTarget): HydratedEvaluationScope => {
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
  const hydrated = clone(source);
  if (record(hydrated.history)) {
    const rows = hydrated.history as Record<string, unknown>;
    const anchor = targetAnchor(rows.r000001, target);
    hydrated.history = Object.fromEntries(Object.entries(rows)
      .map(([key, row]) => [key, decodeRevision(key, row, anchor, target)]));
  }
  if (record(hydrated.corrections)) hydrated.corrections = Object.fromEntries(Object.entries(hydrated.corrections as Record<string, unknown>)
    .map(([key, value]) => {
      const row = record(value);
      return [key, row && row.facts === undefined ? { ...row, facts: [] } : value];
    }));
  return hydrated as HydratedEvaluationScope;
};

const assertScopeIntegrity = (scope: HydratedEvaluationScope): void => {
  const history = scope.history ?? {};
  const operations = scope.operations ?? {};
  const revisions = Object.values(history).sort((left, right) => left.revision - right.revision);
  const firstTarget = revisions[0]?.target;
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = historyRevision(revisionKey(revisions[index].revision), revisions[index], revisions[index].target);
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
      || operation.operationId !== revision.operationId
      || operation.commandFingerprint !== revision.commandFingerprint
      || operation.actorFingerprint !== canonicalActivityEvaluationFingerprint(revision.evaluatedBy)) {
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
      || Object.keys(scope.current).sort().join(',') !== 'operationId,revision,revisionKey'
      || scope.current.revisionKey !== revisionKey(scope.current.revision)
      || scope.current.operationId !== revisions[revisions.length - 1].operationId
    ))) {
    throw new BookActivityEvaluationRepositoryError('evaluation_current_invalid');
  }
  if (Object.keys(operations).length !== revisions.length
    || Object.keys(scope.corrections ?? {}).length !== revisions.length
    || Object.keys(scope.aggregateScores ?? {}).length !== revisions.filter((row) => row.facts.status === 'scored').length) {
    throw new BookActivityEvaluationRepositoryError('evaluation_scope_invalid');
  }
};

const nextScope = (
  scope: HydratedEvaluationScope,
  revision: BookActivityEvaluationRevision,
  operation: BookActivityEvaluationOperation,
): HydratedEvaluationScope | BookActivityEvaluationCommandResult => {
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
    (scope.current ? scope.history?.[scope.current.revisionKey]?.target : undefined) ?? revision.target,
  )) {
    return {
      status: 'rejected',
      code: 'evaluation_attempt_mismatch',
      currentRevision,
    };
  }
  const key = revisionKey(revision.revision);
  const next: HydratedEvaluationScope = {
    current: { revision: revision.revision, revisionKey: key, operationId: operation.operationId },
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
  if (encodedBytes(encodeScope(next)) > MAX_SCOPE_BYTES) {
    return {
      status: 'rejected',
      code: 'evaluation_repository_conflict',
      currentRevision,
    };
  }
  return next;
};

const operationResult = (
  scope: HydratedEvaluationScope,
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
  const source = record(hydrateRevision(value));
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
    || !isBookActivityEvaluationTarget(revisionTarget)
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
    || !['evaluate_objective', 'regrade_objective', 'teacher_evaluation', 'regrade'].includes(source.commandKind as string)
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
    const scope = durableScope(this.scopes[bookActivityEvaluationScopePath(input.target)], input.target);
    return operationResult(scope, pathId(input.operationId, 'operation'));
  }

  async appendRevision(input: {
    revision: BookActivityEvaluationRevision;
    operation: BookActivityEvaluationOperation;
  }): Promise<BookActivityEvaluationCommandResult> {
    const path = bookActivityEvaluationScopePath(input.revision.target);
    const updated = nextScope(durableScope(this.scopes[path], input.revision.target), input.revision, input.operation);
    if ('status' in updated) return updated;
    this.scopes[path] = encodeScope(updated);
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
    const scope = durableScope(this.scopes[bookActivityEvaluationScopePath(input.target)], input.target);
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
  private readonly getFirebaseIdToken: (claims: Extract<BookFirebaseClaimTuple, { service: 'book_activity_evaluation' }>) => Promise<string>;

  constructor(private readonly options: {
    readonly env: FirebaseBookActivityEvaluationRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getFirebaseIdToken?: (claims: Extract<BookFirebaseClaimTuple, { service: 'book_activity_evaluation' }>) => Promise<string>;
  }) {
    const identity = options.env.BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY?.trim();
    if (!identity) {
      throw new BookActivityEvaluationRepositoryError('missing_evaluation_service_identity');
    }
    const keyJson = options.env.BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getFirebaseIdToken) {
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
    this.getFirebaseIdToken = options.getFirebaseIdToken ?? createFirebaseClaimTokenProvider({
      serviceAccountJson: keyJson!,
      serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
      fetchImpl: options.fetchImpl ?? fetch,
    });
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl: options.fetchImpl ?? fetch,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async ({ path } = { path: '' }) => {
        const match = /^book_activity_evaluations\/scopes\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)(?:\/history(?:\/r000001)?)?$/u.exec(path);
        if (!match || !match.slice(1).every((value) => ID.test(value))) {
          throw new BookActivityEvaluationRepositoryError('evaluation_claim_target_unavailable');
        }
        return this.getFirebaseIdToken({
          service: 'book_activity_evaluation',
          recipientId: match[1], contextId: match[2], placementId: match[3],
          activityId: match[4], attemptId: match[5],
        });
      },
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
    return operationResult(durableScope(raw, input.target), pathId(input.operationId, 'operation'));
  }

  async appendRevision(input: {
    revision: BookActivityEvaluationRevision;
    operation: BookActivityEvaluationOperation;
  }): Promise<BookActivityEvaluationCommandResult> {
    this.assertIdentity();
    const path = bookActivityEvaluationScopePath(input.revision.target);
    const current = durableScope(await this.rtdb.readValue(path), input.revision.target);
    const updated = nextScope(current, input.revision, input.operation);
    if ('status' in updated) return updated;
    const key = revisionKey(input.revision.revision);
    const updates = [
      { path: `${path}/current`, value: updated.current },
      { path: `${path}/history/${key}`, value: encodeRevision(updated.history![key]) },
      { path: `${path}/corrections/${key}`, value: updated.corrections![key] },
      { path: `${path}/operations/${input.operation.operationId}`, value: updated.operations![input.operation.operationId] },
      ...(updated.aggregateScores?.[key] ? [{ path: `${path}/aggregateScores/${key}`, value: updated.aggregateScores[key] }] : []),
    ];
    const target = input.revision.target;
    const writer = new FirebaseRtdbRestClient({
      env: this.options.env, fetchImpl: this.options.fetchImpl ?? fetch, firebaseAuthToken: true,
      getFirebaseAuthToken: () => this.getFirebaseIdToken({ service: 'book_activity_evaluation',
        recipientId: target.recipientId, contextId: target.contextId, placementId: target.placementId,
        activityId: target.activityId, attemptId: target.attemptId }),
    });
    try {
      await writer.patchMultiLocation(updates);
      return { status: 'accepted', revision: clone(input.revision) };
    } catch {
      // One exact readback resolves a lost response or a competing append. Never resend.
      try {
        const readback = durableScope(await this.rtdb.readValue(path), input.revision.target);
        const outcome = nextScope(readback, input.revision, input.operation);
        if ('status' in outcome) return outcome;
        return { status: 'rejected', code: 'evaluation_repository_conflict', currentRevision: readback.current?.revision ?? 0 };
      } catch {
        return { status: 'rejected', code: 'evaluation_repository_conflict' };
      }
    }
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
    if (raw === null) return [];
    if (!rows) throw new BookActivityEvaluationRepositoryError('evaluation_history_readback_invalid');
    if (Object.keys(rows).length > input.limit) {
      throw new BookActivityEvaluationRepositoryError('evaluation_history_query_unbounded');
    }
    if (Object.keys(rows).length === 0) return [];
    const anchor = targetAnchor(rows.r000001 ?? await this.rtdb.readValue(`${bookActivityEvaluationHistoryPath(input.target)}/r000001`), input.target);
    return Object.entries(rows)
      .map(([key, value]) => decodeRevision(key, value, anchor, input.target))
      .sort((left, right) => left.revision - right.revision);
  }
}
