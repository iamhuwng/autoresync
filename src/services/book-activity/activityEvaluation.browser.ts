import { getAuth } from 'firebase/auth';
import { resolveBookDeliveryWorkerOrigin } from '../book-delivery/bookDelivery.browser';
import {
  ACTIVITY_EVALUATION_SCHEMA_VERSION,
  ACTIVITY_EVALUATION_SCORER_VERSION,
  canonicalActivityEvaluationFingerprint,
  type BookActivityEvaluationCommand,
  type BookActivityEvaluationRevision,
  type BookActivityEvaluationTarget,
} from './activityEvaluation.types';
import type {
  BookActivityStudentResultProjection,
} from './bookResultVisibility.service';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const MAX_HISTORY_BYTES = 256 * 1024;
const MAX_COMMAND_BYTES = 256 * 1024;
const MAX_RESULT_BYTES = 128 * 1024;
const PRESENTATION_ENV = 'VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION';

export interface BookActivityEvaluationLocator {
  readonly bookId: string;
  readonly studentId: string;
  readonly contextKind: BookActivityEvaluationTarget['contextKind'];
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  /** Exact terminal identity from the trusted completion projection. */
  readonly terminalId?: string;
  /** Canonical attempt identity when the result route already exposes it. */
  readonly attemptId?: string;
}

export interface BookActivityEvaluationRevisionView {
  readonly revision: number;
  readonly previousRevision: number;
  readonly commandKind: BookActivityEvaluationRevision['commandKind'];
  readonly facts: BookActivityEvaluationRevision['facts'];
  readonly evaluatedBy: BookActivityEvaluationRevision['evaluatedBy']['kind'];
  readonly evaluatedAt: string;
}

export interface BookActivityTeacherEvaluationPresentation {
  readonly locator: BookActivityEvaluationLocator;
  readonly attemptId: string;
  readonly resultId: string;
  readonly interactionId: string;
  readonly submission: unknown;
  readonly current: BookActivityEvaluationRevisionView | null;
  readonly priorRevisions: readonly BookActivityEvaluationRevisionView[];
}

export interface SubmitBookActivityTeacherEvaluationInput {
  readonly locator: BookActivityEvaluationLocator;
  readonly expectedRevision: number;
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly feedback?: string;
  readonly correctionNote?: string;
}

export interface BookActivityEvaluationBrowserClient {
  readTeacherEvaluation(
    locator: BookActivityEvaluationLocator,
  ): Promise<BookActivityTeacherEvaluationPresentation>;
  grade(
    input: SubmitBookActivityTeacherEvaluationInput,
  ): Promise<BookActivityTeacherEvaluationPresentation>;
  regrade(
    input: SubmitBookActivityTeacherEvaluationInput,
  ): Promise<BookActivityTeacherEvaluationPresentation>;
  readStudentResult(
    locator: BookActivityEvaluationLocator,
  ): Promise<BookActivityStudentResultProjection>;
}

export interface BookActivityEvaluationBrowserEnv {
  readonly VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION?: string;
  readonly VITE_BOOK_EVALUATION_WORKER_URL?: string;
  readonly VITE_BOOK_RUNTIME_WORKER_URL?: string;
  readonly VITE_BOOK_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface BookActivityEvaluationBrowserClientOptions {
  readonly baseUrl?: string;
  readonly env?: BookActivityEvaluationBrowserEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly createOperationId?: () => string;
}

export type BookActivityEvaluationBrowserErrorCode =
  | 'presentation_disabled'
  | 'invalid_request'
  | 'missing_user'
  | 'token_unavailable'
  | 'network_failure'
  | 'invalid_response'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'stale_conflict'
  | 'retryable'
  | 'route_disabled'
  | 'server_unavailable';

export class BookActivityEvaluationBrowserError extends Error {
  constructor(
    readonly code: BookActivityEvaluationBrowserErrorCode,
    readonly status = 0,
    readonly currentRevision?: number,
  ) {
    super(`book_activity_evaluation_browser_${code}`);
    this.name = 'BookActivityEvaluationBrowserError';
  }
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => freeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
);

const validLocator = (locator: BookActivityEvaluationLocator): boolean => {
  const ids = [
    locator.bookId,
    locator.studentId,
    locator.contextId,
    locator.placementId,
    locator.activityId,
    locator.activityVersionId,
    ...(locator.terminalId === undefined ? [] : [locator.terminalId]),
    ...(locator.attemptId === undefined ? [] : [locator.attemptId]),
  ];
  return ids.every((value) => SAFE_ID.test(value))
    && ['homework', 'course', 'class'].includes(locator.contextKind);
};

export const isBookActivityEvaluationPresentationEnabled = (
  env: BookActivityEvaluationBrowserEnv = import.meta.env,
): boolean => env[PRESENTATION_ENV]?.trim().toLowerCase() === 'enabled';

const exactOrigin = (value: string): string => {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || (url.protocol === 'http:' && url.hostname !== 'localhost')
      || url.username !== ''
      || url.password !== ''
      || !/^\/+$/u.test(url.pathname)
      || url.search !== ''
      || url.hash !== '') {
      throw new Error('invalid');
    }
    return url.origin;
  } catch {
    throw new BookActivityEvaluationBrowserError('server_unavailable');
  }
};

const workerOrigin = (
  options: BookActivityEvaluationBrowserClientOptions,
): string => {
  const env = options.env ?? (import.meta.env as BookActivityEvaluationBrowserEnv);
  const explicit = options.baseUrl?.trim()
    || env.VITE_BOOK_EVALUATION_WORKER_URL?.trim()
    || env.VITE_BOOK_RUNTIME_WORKER_URL?.trim();
  return explicit
    ? exactOrigin(explicit)
    : exactOrigin(resolveBookDeliveryWorkerOrigin(env));
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string | null | undefined> => (
  getAuth().currentUser?.getIdToken(forceRefresh)
);

const responseBody = async (response: Response, maxBytes: number): Promise<unknown> => {
  const claimed = response.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > maxBytes)) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  try {
    return text === '' ? {} : JSON.parse(text);
  } catch {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
};

const codeFrom = (body: unknown): string | undefined => {
  const value = record(body)?.code;
  return typeof value === 'string' ? value : undefined;
};

const currentRevisionFrom = (body: unknown): number | undefined => {
  const value = record(body)?.currentRevision;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
};

const classifyHttpError = (
  response: Response,
  body: unknown,
): BookActivityEvaluationBrowserError => {
  const code = codeFrom(body);
  if (response.status === 401) {
    return new BookActivityEvaluationBrowserError('unauthorized', response.status);
  }
  if (response.status === 403) {
    return new BookActivityEvaluationBrowserError('forbidden', response.status);
  }
  if (response.status === 404) {
    return new BookActivityEvaluationBrowserError('not_found', response.status);
  }
  if (response.status === 409 || code === 'evaluation_stale_revision') {
    return new BookActivityEvaluationBrowserError(
      'stale_conflict',
      response.status,
      currentRevisionFrom(body),
    );
  }
  if (response.status === 429 || response.status >= 500) {
    if (response.status === 503 && code === 'book_route_disabled') {
      return new BookActivityEvaluationBrowserError('route_disabled', response.status);
    }
    return new BookActivityEvaluationBrowserError('retryable', response.status);
  }
  return new BookActivityEvaluationBrowserError('server_unavailable', response.status);
};

const validTarget = (value: unknown): value is BookActivityEvaluationTarget => {
  const target = record(value);
  if (!target || !exactKeys(target, [
    'attemptId', 'resultId', 'recipientId', 'bindingId', 'bindingRevision',
    'contextKind', 'contextId', 'placementId', 'activityId', 'activityVersion',
    'interactionId', 'activityVersionId', 'attemptNumber', 'pageGroupKeys',
    'sourceProvenance',
  ])) return false;
  const ids = [
    target.attemptId, target.resultId, target.recipientId, target.bindingId,
    target.contextId, target.placementId, target.activityId,
    target.interactionId, target.activityVersionId,
  ];
  return ids.every((entry) => typeof entry === 'string' && SAFE_ID.test(entry))
    && ['homework', 'course', 'class'].includes(String(target.contextKind))
    && Number.isSafeInteger(target.bindingRevision) && (target.bindingRevision as number) >= 1
    && Number.isSafeInteger(target.activityVersion) && (target.activityVersion as number) >= 1
    && Number.isSafeInteger(target.attemptNumber) && (target.attemptNumber as number) >= 1
    && Array.isArray(target.pageGroupKeys)
    && target.pageGroupKeys.every((entry) => typeof entry === 'string' && SAFE_ID.test(entry))
    && new Set(target.pageGroupKeys).size === target.pageGroupKeys.length
    && Array.isArray(target.sourceProvenance)
    && target.sourceProvenance.length <= 100
    && target.sourceProvenance.every((candidate) => {
      const source = record(candidate);
      return Boolean(source
        && exactKeys(source, ['sourceKey', 'sourceVersionId', 'pages'])
        && typeof source.sourceKey === 'string' && SAFE_ID.test(source.sourceKey)
        && typeof source.sourceVersionId === 'string' && SAFE_ID.test(source.sourceVersionId)
        && Array.isArray(source.pages) && source.pages.length > 0
        && source.pages.length <= 1_000
        && source.pages.every((page) => Number.isSafeInteger(page) && page > 0)
        && new Set(source.pages).size === source.pages.length);
    });
};

const validCorrectionFacts = (value: unknown): boolean => (
  Array.isArray(value)
  && value.length <= 100
  && value.every((candidate) => {
    const fact = record(candidate);
    return Boolean(fact
      && exactKeys(fact, ['interactionId', 'outcome'], ['note'])
      && typeof fact.interactionId === 'string'
      && SAFE_ID.test(fact.interactionId)
      && ['correct', 'incorrect', 'partial', 'not_applicable'].includes(String(fact.outcome))
      && (fact.note === undefined || (typeof fact.note === 'string' && fact.note.length <= 1_000)));
  })
  && new Set(value.map((candidate) => record(candidate)?.interactionId)).size === value.length
);

const validRevision = (
  value: unknown,
  target: BookActivityEvaluationTarget,
): value is BookActivityEvaluationRevision => {
  const revision = record(value);
  if (!revision || !exactKeys(revision, [
    'schemaVersion', 'revision', 'previousRevision', 'operationId', 'commandKind',
    'commandFingerprint', 'scorerVersion', 'activitySchemaVersion', 'target',
    'facts', 'evaluatedBy', 'evaluatedAt',
  ])) return false;
  const facts = record(revision.facts);
  const actor = record(revision.evaluatedBy);
  return revision.schemaVersion === ACTIVITY_EVALUATION_SCHEMA_VERSION
    && revision.scorerVersion === ACTIVITY_EVALUATION_SCORER_VERSION
    && Number.isSafeInteger(revision.revision) && (revision.revision as number) >= 1
    && revision.previousRevision === (revision.revision as number) - 1
    && typeof revision.operationId === 'string' && SAFE_ID.test(revision.operationId)
    && ['evaluate_objective', 'teacher_evaluation', 'regrade'].includes(String(revision.commandKind))
    && typeof revision.commandFingerprint === 'string'
    && revision.commandFingerprint.length > 0
    && revision.commandFingerprint.length <= 128 * 1024
    && Number.isSafeInteger(revision.activitySchemaVersion)
    && (revision.activitySchemaVersion as number) >= 1
    && validTarget(revision.target)
    && canonicalActivityEvaluationFingerprint(revision.target)
      === canonicalActivityEvaluationFingerprint(target)
    && facts !== null
    && exactKeys(
      facts,
      ['status', 'correctionFacts'],
      ['earnedScore', 'maximumScore', 'displayScore', 'feedback'],
    )
    && ['scored', 'review_required'].includes(String(facts.status))
    && (facts.earnedScore === undefined
      || (typeof facts.earnedScore === 'number' && Number.isFinite(facts.earnedScore)
        && facts.earnedScore >= 0))
    && (facts.maximumScore === undefined
      || (typeof facts.maximumScore === 'number' && Number.isFinite(facts.maximumScore)
        && facts.maximumScore >= 0))
    && (facts.earnedScore === undefined || facts.maximumScore === undefined
      || (facts.earnedScore as number) <= (facts.maximumScore as number))
    && (facts.displayScore === undefined
      || (typeof facts.displayScore === 'string' && facts.displayScore.length <= 100))
    && (facts.feedback === undefined
      || (typeof facts.feedback === 'string' && facts.feedback.length <= 4_000))
    && validCorrectionFacts(facts.correctionFacts)
    && actor !== null
    && ((exactKeys(actor, ['kind', 'uid'])
      && actor.kind === 'teacher'
      && typeof actor.uid === 'string'
      && SAFE_ID.test(actor.uid))
      || (exactKeys(actor, ['kind', 'serviceIdentity'])
        && actor.kind === 'trusted_scorer'
        && typeof actor.serviceIdentity === 'string'
        && SAFE_ID.test(actor.serviceIdentity)))
    && validIso(revision.evaluatedAt);
};

const revisionView = (
  revision: BookActivityEvaluationRevision,
): BookActivityEvaluationRevisionView => freeze({
  revision: revision.revision,
  previousRevision: revision.previousRevision,
  commandKind: revision.commandKind,
  facts: clone(revision.facts),
  evaluatedBy: revision.evaluatedBy.kind,
  evaluatedAt: revision.evaluatedAt,
});

const locatorMatchesTarget = (
  locator: BookActivityEvaluationLocator,
  target: BookActivityEvaluationTarget,
): boolean => target.recipientId === locator.studentId
  && target.contextKind === locator.contextKind
  && target.contextId === locator.contextId
  && target.placementId === locator.placementId
  && target.activityId === locator.activityId
  && target.activityVersionId === locator.activityVersionId
  && (locator.attemptId === undefined || locator.attemptId === target.attemptId);

const teacherPresentation = (
  value: unknown,
  locator: BookActivityEvaluationLocator,
): {
  readonly publicView: BookActivityTeacherEvaluationPresentation;
  readonly target: BookActivityEvaluationTarget;
} => {
  const envelope = record(value);
  if (!envelope || !exactKeys(envelope, ['target', 'submission', 'history'])) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  if (!validTarget(envelope.target) || !locatorMatchesTarget(locator, envelope.target)) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  const submission = record(envelope.submission);
  if (!submission || !exactKeys(submission, ['response'])) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  if (!Array.isArray(envelope.history)
    || envelope.history.length > 100
    || envelope.history.some((revision) => !validRevision(revision, envelope.target))) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  const history = [...envelope.history] as BookActivityEvaluationRevision[];
  history.sort((left, right) => right.revision - left.revision);
  if (new Set(history.map((entry) => entry.revision)).size !== history.length) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  const views = history.map(revisionView);
  return {
    target: clone(envelope.target),
    publicView: freeze({
      locator: clone(locator),
      attemptId: envelope.target.attemptId,
      resultId: envelope.target.resultId,
      interactionId: envelope.target.interactionId,
      submission: clone(submission.response),
      current: views[0] ?? null,
      priorRevisions: views.slice(1),
    }),
  };
};

const validScore = (value: unknown): boolean => {
  const score = record(value);
  return Boolean(score
    && exactKeys(score, ['earnedScore', 'maximumScore', 'displayScore'])
    && typeof score.earnedScore === 'number' && Number.isFinite(score.earnedScore)
    && typeof score.maximumScore === 'number' && Number.isFinite(score.maximumScore)
    && typeof score.displayScore === 'string');
};

const studentProjection = (
  value: unknown,
  locator: BookActivityEvaluationLocator,
): BookActivityStudentResultProjection => {
  const envelope = record(value);
  const result = record(envelope?.result);
  if (!envelope || !exactKeys(envelope, ['result']) || !result
    || !exactKeys(result, ['attemptId', 'status'], [
      'studentResponse', 'answerKey', 'correctness', 'score', 'feedback', 'correction',
    ])
    || typeof result.attemptId !== 'string' || !SAFE_ID.test(result.attemptId)
    || (locator.attemptId !== undefined && result.attemptId !== locator.attemptId)
    || !['hidden', 'pending_review', 'graded'].includes(String(result.status))
    || (result.score !== undefined && !validScore(result.score))
    || (result.correctness !== undefined && !validCorrectionFacts(result.correctness))
    || (result.feedback !== undefined && typeof result.feedback !== 'string')) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  if (result.correction !== undefined) {
    const correction = record(result.correction);
    if (!correction
      || !exactKeys(correction, ['note', 'revision', 'previousRevision', 'evaluatedAt'])
      || typeof correction.note !== 'string'
      || correction.note.length > 1_000
      || !Number.isSafeInteger(correction.revision)
      || (correction.revision as number) < 2
      || !Number.isSafeInteger(correction.previousRevision)
      || (correction.previousRevision as number) < 1
      || (correction.previousRevision as number) >= (correction.revision as number)
      || !validIso(correction.evaluatedAt)) {
      throw new BookActivityEvaluationBrowserError('invalid_response', 502);
    }
  }
  if (result.status === 'hidden' && Object.keys(result).length !== 2) {
    throw new BookActivityEvaluationBrowserError('invalid_response', 502);
  }
  return freeze(clone(result as unknown as BookActivityStudentResultProjection));
};

const queryFor = (
  locator: BookActivityEvaluationLocator,
  view: 'teacher' | 'student',
): string => {
  if (!validLocator(locator)) throw new BookActivityEvaluationBrowserError('invalid_request');
  const query = new URLSearchParams({
    view,
    contextKind: locator.contextKind,
    contextId: locator.contextId,
    placementId: locator.placementId,
    activityId: locator.activityId,
    activityVersionId: locator.activityVersionId,
    ...(locator.terminalId === undefined ? {} : { terminalId: locator.terminalId }),
    ...(locator.attemptId === undefined ? {} : { attemptId: locator.attemptId }),
  });
  return `/book-evaluation/history/${encodeURIComponent(locator.bookId)}`
    + `/${encodeURIComponent(locator.studentId)}?${query.toString()}`;
};

const validEvaluationInput = (
  input: SubmitBookActivityTeacherEvaluationInput,
  regrade: boolean,
): boolean => validLocator(input.locator)
  && Number.isSafeInteger(input.expectedRevision)
  && input.expectedRevision >= (regrade ? 1 : 0)
  && Number.isFinite(input.earnedScore)
  && Number.isFinite(input.maximumScore)
  && input.earnedScore >= 0
  && input.maximumScore >= 0
  && input.earnedScore <= input.maximumScore
  && (input.feedback === undefined || input.feedback.length <= 4_000)
  && (!regrade || Boolean(input.correctionNote?.trim()))
  && (input.correctionNote === undefined || input.correctionNote.length <= 1_000);

export const createBookActivityEvaluationBrowserClient = (
  options: BookActivityEvaluationBrowserClientOptions = {},
): BookActivityEvaluationBrowserClient => {
  const env = options.env ?? (import.meta.env as BookActivityEvaluationBrowserEnv);
  if (!isBookActivityEvaluationPresentationEnabled(env)) {
    throw new BookActivityEvaluationBrowserError('presentation_disabled');
  }
  const origin = workerOrigin(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const getIdToken = options.getIdToken ?? defaultGetIdToken;
  const createOperationId = options.createOperationId ?? (() => {
    if (!globalThis.crypto?.randomUUID) {
      throw new BookActivityEvaluationBrowserError('invalid_request');
    }
    return globalThis.crypto.randomUUID();
  });

  const request = async (
    path: string,
    init: RequestInit,
    maxBytes: number,
  ): Promise<unknown> => {
    let token: string | null | undefined;
    try {
      token = await getIdToken(false);
    } catch {
      throw new BookActivityEvaluationBrowserError('token_unavailable');
    }
    if (options.getIdToken === undefined && !getAuth().currentUser) {
      throw new BookActivityEvaluationBrowserError('missing_user');
    }
    if (!token) throw new BookActivityEvaluationBrowserError('token_unavailable');

    let response: Response | undefined;
    let body: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchImpl(`${origin}${path}`, {
          ...init,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
            ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        throw new BookActivityEvaluationBrowserError('network_failure');
      }
      body = await responseBody(response, maxBytes);
      if (response.status !== 401 || attempt === 1) break;
      try {
        token = await getIdToken(true);
      } catch {
        throw new BookActivityEvaluationBrowserError('token_unavailable');
      }
      if (!token) throw new BookActivityEvaluationBrowserError('token_unavailable');
    }
    if (!response) throw new BookActivityEvaluationBrowserError('network_failure');
    if (!response.ok) throw classifyHttpError(response, body);
    return body;
  };

  const readTeacherRaw = async (
    locator: BookActivityEvaluationLocator,
  ) => teacherPresentation(
    await request(queryFor(locator, 'teacher'), { method: 'GET' }, MAX_HISTORY_BYTES),
    locator,
  );

  const submit = async (
    input: SubmitBookActivityTeacherEvaluationInput,
    kind: 'teacher_evaluation' | 'regrade',
  ): Promise<BookActivityTeacherEvaluationPresentation> => {
    if (!validEvaluationInput(input, kind === 'regrade')) {
      throw new BookActivityEvaluationBrowserError('invalid_request');
    }
    const before = await readTeacherRaw(input.locator);
    if ((before.publicView.current?.revision ?? 0) !== input.expectedRevision) {
      throw new BookActivityEvaluationBrowserError(
        'stale_conflict',
        409,
        before.publicView.current?.revision ?? 0,
      );
    }
    const operationId = createOperationId();
    if (!SAFE_ID.test(operationId)) {
      throw new BookActivityEvaluationBrowserError('invalid_request');
    }
    const note = input.correctionNote?.trim();
    const command: BookActivityEvaluationCommand = {
      schemaVersion: ACTIVITY_EVALUATION_SCHEMA_VERSION,
      scorerVersion: ACTIVITY_EVALUATION_SCORER_VERSION,
      operationId,
      kind,
      expectedEvaluationRevision: input.expectedRevision,
      target: before.target,
      evaluation: {
        earnedScore: input.earnedScore,
        maximumScore: input.maximumScore,
        ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
        ...(note
          ? {
              correctionFacts: [{
                interactionId: before.target.interactionId,
                outcome: 'not_applicable',
                note,
              }],
            }
          : {}),
      },
    };
    const body = await request(
      '/book-evaluation/commands',
      { method: 'POST', body: JSON.stringify({ command }) },
      MAX_COMMAND_BYTES,
    );
    const envelope = record(body);
    const status = envelope?.status;
    if (status === 'rejected') {
      const code = envelope?.code;
      if (code === 'evaluation_stale_revision') {
        throw new BookActivityEvaluationBrowserError(
          'stale_conflict',
          409,
          currentRevisionFrom(envelope),
        );
      }
      if (code === 'evaluation_actor_unauthorized') {
        throw new BookActivityEvaluationBrowserError('forbidden', 403);
      }
      if (code === 'evaluation_repository_conflict') {
        throw new BookActivityEvaluationBrowserError('retryable', 503);
      }
      throw new BookActivityEvaluationBrowserError('invalid_response', 502);
    }
    if (!envelope
      || !exactKeys(envelope, ['status', 'revision'])
      || (status !== 'accepted' && status !== 'replayed')
      || !validRevision(envelope.revision, before.target)) {
      throw new BookActivityEvaluationBrowserError('invalid_response', 502);
    }
    return (await readTeacherRaw(input.locator)).publicView;
  };

  return freeze({
    async readTeacherEvaluation(locator) {
      return (await readTeacherRaw(locator)).publicView;
    },
    async grade(input) {
      return submit(input, 'teacher_evaluation');
    },
    async regrade(input) {
      return submit(input, 'regrade');
    },
    async readStudentResult(locator) {
      return studentProjection(
        await request(queryFor(locator, 'student'), { method: 'GET' }, MAX_RESULT_BYTES),
        locator,
      );
    },
  });
};
