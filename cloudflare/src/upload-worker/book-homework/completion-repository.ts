import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkAuthorityRecord } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  assertValidBookHomeworkManifest,
} from '../../../../src/services/book-homework/bookHomeworkManifest.service.ts';
import {
  assertValidBookHomeworkProgressProjection,
  assertValidBookHomeworkTerminalFact,
  deriveBookHomeworkProgress,
  type BookHomeworkProgressProjection,
} from '../../../../src/services/book-homework/bookHomeworkProgress.service.ts';
import type { BookHomeworkTerminalFact as PureBookHomeworkTerminalFact } from '../../../../src/services/book-homework/bookHomeworkProgress.types.ts';
import type {
  BookHomeworkActivityBinding,
  BookHomeworkManifest,
} from '../../../../src/types/homework.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

/**
 * The completion aggregate intentionally lives below the existing trusted
 * runtime root.  Browser clients never write this path; the runtime Worker
 * writes it with the service identity used by the other Book Runtime data.
 */
export const BOOK_HOMEWORK_COMPLETION_ROOT = 'book_runtime/homework_completion';
export const BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION = 1 as const;

// Keep local assertion aliases explicitly typed. The shared validators are
// arrow exports, while this aggregate also needs their assertion signatures
// to survive strict standalone TypeScript checks.
const assertManifest: (value: unknown) => asserts value is BookHomeworkManifest =
  assertValidBookHomeworkManifest;
const assertProgressProjection: (
  value: unknown,
) => asserts value is BookHomeworkProgressProjection = assertValidBookHomeworkProgressProjection;
const assertTerminalFact: (value: unknown) => asserts value is BookHomeworkTerminalFact =
  assertValidBookHomeworkTerminalFact;

const MAX_RETRIES = 5;
const MAX_SCOPE_BYTES = 512 * 1024;
const MAX_FACTS_PER_SCOPE = 512;
const MAX_ROWS_PER_SCOPE = 256;
const MAX_PAGE_GROUP_KEYS = 64;
const MAX_SOURCE_PROVENANCE = 64;
const MAX_SOURCE_PAGES = 256;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface BookHomeworkCompletionRepositoryEnv extends RepositoryEnv {
  BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY?: string;
  BOOK_HOMEWORK_COMPLETION_GOOGLE_SA_KEY?: string;
  /** Runtime aliases are accepted so a wrapper can share one trusted identity. */
  BOOK_RUNTIME_SERVICE_IDENTITY?: string;
  BOOK_RUNTIME_GOOGLE_SA_KEY?: string;
}

export type BookHomeworkCompletionActivityState =
  | 'not-started'
  | 'submitted'
  | 'excluded';

export type BookHomeworkCompletionActivityProjection = BookHomeworkProgressProjection['activities'][number];

/**
 * A compact, immutable terminal fact.  It contains the identity/provenance
 * needed for aggregation and deliberately omits the attempt response.
 */
export type BookHomeworkTerminalFact = PureBookHomeworkTerminalFact;

type StoredBookHomeworkTerminalFact = BookHomeworkTerminalFact & {
  readonly terminalId: string;
  readonly attemptId: string;
  readonly resultId: string;
  readonly completionId: string;
  readonly attemptNumber: number;
  readonly createdAt: string;
};

export type BookHomeworkCompletionProjection = BookHomeworkProgressProjection;

export interface BookHomeworkCompletionScope {
  readonly schemaVersion: typeof BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION;
  readonly recipientId: string;
  readonly contextId: string;
  readonly facts: Readonly<Record<string, BookHomeworkTerminalFact>>;
  readonly projection?: BookHomeworkCompletionProjection;
}

export interface BookHomeworkCompletionRepositorySnapshot {
  readonly scopes?: Readonly<Record<string, BookHomeworkCompletionScope>>;
}

export interface BookHomeworkCompletionAuthority {
  readonly assignmentId: string;
  readonly manifest: BookHomeworkManifest;
}

export interface BookHomeworkTerminalInput {
  readonly attempt: BookRuntimeAttemptRecord;
  readonly result: BookRuntimeResultRecord;
  readonly completion: BookRuntimeCompletionRecord;
  readonly index: BookRuntimeAttemptIndexRecord;
}

/** Input accepted by both an in-memory test repository and the Firebase adapter. */
export interface BookHomeworkCompletionProjectInput {
  /** A BookHomeworkAuthorityRecord, a manifest, or a normalized authority. */
  readonly authority?:
    | BookHomeworkAuthorityRecord
    | BookHomeworkManifest
    | BookHomeworkCompletionAuthority;
  readonly currentManifest?: BookHomeworkManifest;
  readonly manifest?: BookHomeworkManifest;
  readonly assignmentId?: string;
  readonly binding: BookDeliveryBinding;
  readonly terminal?: BookHomeworkTerminalInput;
  readonly attempt?: BookRuntimeAttemptRecord;
  readonly result?: BookRuntimeResultRecord;
  readonly completion?: BookRuntimeCompletionRecord;
  readonly index?: BookRuntimeAttemptIndexRecord;
  readonly now?: string;
}

/** Rebuild the current projection from persisted terminal facts only. */
export interface BookHomeworkCompletionReprojectInput {
  readonly authority?:
    | BookHomeworkAuthorityRecord
    | BookHomeworkManifest
    | BookHomeworkCompletionAuthority;
  readonly currentManifest?: BookHomeworkManifest;
  readonly manifest?: BookHomeworkManifest;
  readonly assignmentId?: string;
  readonly binding: BookDeliveryBinding;
  readonly now?: string;
}

export interface BookHomeworkCompletionDeriveInput {
  readonly authority: BookHomeworkCompletionAuthority;
  readonly binding: BookDeliveryBinding;
  readonly terminalFacts: readonly BookHomeworkTerminalFact[];
  readonly now?: string;
}

export type BookHomeworkCompletionProjectionDeriver = (
  input: BookHomeworkCompletionDeriveInput,
) => BookHomeworkCompletionProjection | Promise<BookHomeworkCompletionProjection>;

export interface BookHomeworkCompletionProjectResult {
  readonly status: 'accepted' | 'replayed';
  readonly replayed: boolean;
  readonly fact: BookHomeworkTerminalFact;
  readonly projection: BookHomeworkCompletionProjection;
}

export interface BookHomeworkCompletionReprojectResult {
  readonly status: 'reprojected';
  readonly replayed: false;
  readonly projection: BookHomeworkCompletionProjection;
}

export class BookHomeworkCompletionRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookHomeworkCompletionRepositoryError';
  }
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const encodedBytes = (value: unknown): number => {
  const json = JSON.stringify(value);
  if (json === undefined) throw new BookHomeworkCompletionRepositoryError('homework_completion_unserializable');
  return new TextEncoder().encode(json).byteLength;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkCompletionRepositoryError(`homework_completion_${label}_invalid`);
  }
}

function assertIso(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new BookHomeworkCompletionRepositoryError(`homework_completion_${label}_invalid`);
  }
}

function assertRevision(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new BookHomeworkCompletionRepositoryError(`homework_completion_${label}_invalid`);
  }
}

function assertArray(value: unknown, label: string, maximum: number): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new BookHomeworkCompletionRepositoryError(`homework_completion_${label}_invalid`);
  }
}

const scopeKey = (recipientId: string, contextId: string): string => `${recipientId}/${contextId}`;

const scopePath = (recipientId: string, contextId: string): string => {
  assertId(recipientId, 'recipient_id');
  assertId(contextId, 'context_id');
  return `${BOOK_HOMEWORK_COMPLETION_ROOT}/${recipientId}/${contextId}`;
};

const factSlotKey = (fact: Pick<
  BookHomeworkTerminalFact,
  'bindingRevision' | 'placementId' | 'activityId' | 'activityVersionId'
>): string => (
  `${fact.bindingRevision}:${fact.placementId}:${fact.activityId}:${fact.activityVersionId}`
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const equal = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

const mergeTerminalFact = (
  currentFacts: Readonly<Record<string, BookHomeworkTerminalFact>>,
  incoming: StoredBookHomeworkTerminalFact,
): {
  readonly status: 'accepted' | 'replayed';
  readonly facts: Readonly<Record<string, BookHomeworkTerminalFact>>;
} => {
  const exact = currentFacts[incoming.completionId];
  if (exact && !equal(exact, incoming)) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_duplicate_conflict');
  }
  if (exact) return { status: 'replayed', facts: currentFacts };

  const slot = factSlotKey(incoming);
  const previousEntry = Object.entries(currentFacts).find(([, fact]) => factSlotKey(fact) === slot);
  if (previousEntry) {
    const [previousId, previous] = previousEntry;
    const previousAttempt = previous.attemptNumber ?? 0;
    if (previousAttempt >= incoming.attemptNumber) {
      if (previousAttempt === incoming.attemptNumber) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_duplicate_conflict');
      }
      return { status: 'replayed', facts: currentFacts };
    }
    const facts = { ...currentFacts };
    delete facts[previousId];
    facts[incoming.completionId] = clone(incoming);
    return { status: 'accepted', facts };
  }

  return {
    status: 'accepted',
    facts: { ...currentFacts, [incoming.completionId]: clone(incoming) },
  };
};

const manifestFromInput = (
  input: Pick<
    BookHomeworkCompletionProjectInput,
    'authority' | 'currentManifest' | 'manifest' | 'assignmentId'
  >,
): { authority: BookHomeworkCompletionAuthority; manifest: BookHomeworkManifest } => {
  const candidate = input.currentManifest ?? input.manifest
    ?? (isRecord(input.authority) && isRecord(input.authority.bookManifest)
      ? input.authority.bookManifest
      : isRecord(input.authority) && isRecord(input.authority.manifest)
        ? input.authority.manifest
        : input.authority);
  if (!candidate || !isRecord(candidate)) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_manifest_missing');
  }
  try {
    assertManifest(candidate);
  } catch {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_manifest_invalid');
  }
  const manifest = candidate as BookHomeworkManifest;
  const authorityRecord = isRecord(input.authority) ? input.authority : undefined;
  const assignmentId = input.assignmentId
    ?? (authorityRecord && isRecord(authorityRecord.saga)
      && typeof authorityRecord.saga.sagaId === 'string'
      ? authorityRecord.saga.sagaId
      : authorityRecord && typeof authorityRecord.assignmentId === 'string'
        ? authorityRecord.assignmentId
        : manifest.context.contextId);
  assertId(assignmentId, 'assignment_id');
  if (assignmentId !== manifest.context.contextId) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_assignment_context_mismatch');
  }
  return { authority: { assignmentId, manifest }, manifest };
};

const assertBinding = (binding: BookDeliveryBinding): void => {
  if (!isRecord(binding) || binding.schemaVersion !== 3 || binding.status !== 'active'
    || !isRecord(binding.context) || !isRecord(binding.recipient)
    || !isRecord(binding.issuer) || !isRecord(binding.book)
    || !Array.isArray(binding.placements)) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_binding_invalid');
  }
  try {
    assertId(binding.bindingId, 'binding_id');
    assertRevision(binding.revision, 'binding_revision', 1);
    assertId(binding.context.contextId, 'context_id');
    assertId(binding.context.recipientId, 'recipient_id');
  } catch (error) {
    if (error instanceof BookHomeworkCompletionRepositoryError) throw error;
    throw new BookHomeworkCompletionRepositoryError('homework_completion_binding_invalid');
  }
  if (binding.context.kind !== 'homework'
    || binding.context.entitlementBasis !== 'assignment'
    || binding.recipient.recipientKind !== 'student'
    || binding.recipient.recipientId !== binding.context.recipientId) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_binding_context_invalid');
  }
  const placements = binding.placements;
  assertArray(placements, 'placements', MAX_ROWS_PER_SCOPE);
  const placementIds = new Set<string>();
  for (const placement of placements) {
    assertId(placement.placementId, 'placement_id');
    assertId(placement.activityId, 'activity_id');
    assertId(placement.activityVersionId, 'activity_version_id');
    assertRevision(placement.activityVersion, 'activity_version', 1);
    if (placementIds.has(placement.placementId)) {
      throw new BookHomeworkCompletionRepositoryError('homework_completion_duplicate_placement');
    }
    placementIds.add(placement.placementId);
  }
};

const assertManifestContext = (
  manifest: BookHomeworkManifest,
  binding: BookDeliveryBinding,
): void => {
  if (manifest.context.kind !== 'homework'
    || manifest.context.entitlementBasis !== 'assignment'
    || manifest.context.contextId !== binding.context.contextId
    || manifest.context.recipientId !== binding.context.recipientId
    || manifest.bindingRevision !== binding.revision
    || manifest.ownerId !== binding.issuer.ownerId
    || manifest.book.bookId !== binding.book.bookId
    || manifest.book.bookRevision !== binding.book.bookRevision
    || manifest.book.publicationId !== binding.book.publicationId
    || manifest.book.publicationRevision !== binding.book.publicationRevision) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_manifest_context_mismatch');
  }
  assertArray(manifest.bindings, 'manifest_bindings', MAX_ROWS_PER_SCOPE);
  const slots = new Set<string>();
  for (const candidate of manifest.bindings) {
    assertId(candidate.bindingId, 'activity_binding_id');
    assertId(candidate.placementId, 'placement_id');
    assertId(candidate.activityId, 'activity_id');
    if (candidate.state === 'required') {
      assertId(candidate.activityVersionId, 'activity_version_id');
      assertRevision(candidate.activityVersion, 'activity_version', 1);
    }
    const key = `${candidate.placementId}:${candidate.activityId}:${candidate.activityVersionId ?? ''}`;
    if (slots.has(key)) throw new BookHomeworkCompletionRepositoryError('homework_completion_duplicate_manifest_slot');
    slots.add(key);
  }
};

/** Keep only the bounded score fields needed by the student-safe projection. */
const canonicalScore = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  if (value.status !== undefined) output.status = value.status;
  if (value.earnedScore !== undefined) output.earnedScore = value.earnedScore;
  if (value.maximumScore !== undefined) output.maximumScore = value.maximumScore;
  if (value.displayScore !== undefined) output.displayScore = value.displayScore;
  return output;
};

const terminalFromInput = (
  input: BookHomeworkCompletionProjectInput,
  manifest: BookHomeworkManifest,
): StoredBookHomeworkTerminalFact => {
  const terminal = input.terminal ?? (
    input.attempt && input.result && input.completion && input.index
      ? {
        attempt: input.attempt,
        result: input.result,
        completion: input.completion,
        index: input.index,
      }
      : undefined
  );
  if (!terminal) throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_missing');
  const { attempt, result, completion, index } = terminal;
  if (!isRecord(attempt) || !isRecord(result) || !isRecord(completion) || !isRecord(index)
    || attempt.schemaVersion !== 1 || result.schemaVersion !== 1
    || completion.schemaVersion !== 1 || index.schemaVersion !== 1
    || result.status !== 'pending_review' && result.status !== 'submitted'
    || completion.status !== 'completed') {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_invalid');
  }
  const requiredInteractionIds = attempt.requiredInteractionIds;
  const submittedInteractionIds = attempt.submittedInteractionIds;
  if (attempt.submissionScope !== 'activity'
    || !Array.isArray(requiredInteractionIds)
    || requiredInteractionIds.length === 0
    || new Set(requiredInteractionIds).size !== requiredInteractionIds.length
    || !Array.isArray(submittedInteractionIds)
    || equal(requiredInteractionIds, submittedInteractionIds) === false
    || requiredInteractionIds.some((id) => typeof id !== 'string' || !ID.test(id))) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_activity_boundary_invalid');
  }
  const binding = input.binding;
  const expected = {
    deliveryBindingId: binding.bindingId,
    bindingRevision: binding.revision,
    recipientId: binding.context.recipientId,
    contextId: binding.context.contextId,
  };
  const records = [attempt, result, completion, index] as readonly Record<string, unknown>[];
  for (const record of records) {
    if (record.bindingId !== expected.deliveryBindingId
      || record.bindingRevision !== expected.bindingRevision
      || record.recipientId !== expected.recipientId
      || record.contextId !== expected.contextId) {
      throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_context_mismatch');
    }
  }
  assertId(attempt.attemptId, 'attempt_id');
  assertId(result.resultId, 'result_id');
  assertId(completion.completionId, 'completion_id');
  assertId(index.attemptId, 'attempt_id');
  assertId(attempt.placementId, 'placement_id');
  assertId(attempt.activityId, 'activity_id');
  assertId(attempt.activityVersionId, 'activity_version_id');
  assertId(attempt.interactionId, 'interaction_id');
  assertId(attempt.createdByOperationId, 'operation_id');
  assertRevision(attempt.bindingRevision, 'binding_revision', 1);
  assertRevision(attempt.activityVersion, 'activity_version', 1);
  assertRevision(attempt.attemptNumber, 'attempt_number', 1);
  assertRevision(attempt.acknowledgedDraftRevision, 'draft_revision', 0);
  assertIso(attempt.createdAt, 'created_at');
  if (result.attemptId !== attempt.attemptId
    || completion.attemptId !== attempt.attemptId
    || index.attemptId !== attempt.attemptId
    || result.resultId !== `${attempt.attemptId}:result`
    || completion.completionId !== `${attempt.attemptId}:completion`
    || completion.resultId !== result.resultId
    || index.resultId !== result.resultId
    || result.placementId !== attempt.placementId
    || result.activityId !== attempt.activityId
    || result.activityVersion !== attempt.activityVersion
    || result.activityVersionId !== attempt.activityVersionId
    || completion.placementId !== attempt.placementId
    || completion.activityId !== attempt.activityId
    || completion.activityVersion !== attempt.activityVersion
    || completion.activityVersionId !== attempt.activityVersionId
    || completion.submissionScope !== attempt.submissionScope
    || !equal(completion.requiredInteractionIds, requiredInteractionIds)
    || !equal(completion.submittedInteractionIds, submittedInteractionIds)
    || index.placementId !== attempt.placementId
    || index.activityId !== attempt.activityId
    || index.activityVersion !== attempt.activityVersion
    || index.activityVersionId !== attempt.activityVersionId
    || index.submissionScope !== attempt.submissionScope
    || !equal(index.requiredInteractionIds, requiredInteractionIds)
    || !equal(index.submittedInteractionIds, submittedInteractionIds)
    || !equal(result.pageGroupKeys, attempt.pageGroupKeys)
    || !equal(completion.pageGroupKeys, attempt.pageGroupKeys)
    || !equal(index.pageGroupKeys, attempt.pageGroupKeys)
    || result.createdByOperationId !== attempt.createdByOperationId
    || completion.createdByOperationId !== attempt.createdByOperationId
    || index.createdByOperationId !== attempt.createdByOperationId
    || result.createdAt !== attempt.createdAt
    || completion.createdAt !== attempt.createdAt
    || index.createdAt !== attempt.createdAt) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_sequence_invalid');
  }
  assertArray(attempt.pageGroupKeys, 'page_group_keys', MAX_PAGE_GROUP_KEYS);
  for (const key of attempt.pageGroupKeys) assertId(key, 'page_group_key');
  assertArray(attempt.sourceProvenance, 'source_provenance', MAX_SOURCE_PROVENANCE);
  for (const source of attempt.sourceProvenance) {
    if (!isRecord(source)) throw new BookHomeworkCompletionRepositoryError('homework_completion_source_provenance_invalid');
    assertId(source.sourceKey, 'source_key');
    assertId(source.sourceVersionId, 'source_version_id');
    assertArray(source.pages, 'source_pages', MAX_SOURCE_PAGES);
    for (const page of source.pages) assertRevision(page, 'source_page', 1);
  }
  const placement = binding.placements.find((candidate) => candidate.placementId === attempt.placementId);
  if (!placement
    || placement.activityId !== attempt.activityId
    || placement.activityVersion !== attempt.activityVersion
    || placement.activityVersionId !== attempt.activityVersionId) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_binding_mismatch');
  }
  const manifestBinding = manifest.bindings.find((candidate) => (
    candidate.placementId === attempt.placementId
      && candidate.activityId === attempt.activityId
  ));
  if (!manifestBinding
    || manifestBinding.state !== 'required'
    || manifestBinding.activityVersion !== attempt.activityVersion
    || manifestBinding.activityVersionId !== attempt.activityVersionId) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_terminal_manifest_mismatch');
  }
  if (result.status === 'pending_review'
    && isRecord(result.score) && result.score.status === 'scored') {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_result_grading_mismatch');
  }
  const score = result.score;
  return {
    terminalId: completion.completionId,
    attemptId: attempt.attemptId,
    resultId: result.resultId,
    completionId: completion.completionId,
    attemptNumber: attempt.attemptNumber,
    createdAt: attempt.createdAt,
    recipientId: binding.context.recipientId,
    contextId: binding.context.contextId,
    // This is the delivery binding identity; the manifest Activity binding
    // identity is deliberately kept separate by the pure progress service.
    bindingId: binding.bindingId,
    bindingRevision: binding.revision,
    placementId: attempt.placementId,
    activityId: attempt.activityId,
    activityVersion: attempt.activityVersion,
    activityVersionId: attempt.activityVersionId,
    submissionScope: 'activity',
    requiredInteractionIds: [...requiredInteractionIds],
    submittedInteractionIds: [...submittedInteractionIds],
    result: {
      status: result.status,
      ...(score === undefined ? {} : { score: canonicalScore(score) }),
    },
  } as StoredBookHomeworkTerminalFact;
};

const parseFact = (
  value: unknown,
  expectedCompletionId: string,
  recipientId: string,
  contextId: string,
): StoredBookHomeworkTerminalFact => {
  if (!isRecord(value) || value.completionId !== expectedCompletionId
    || value.recipientId !== recipientId || value.contextId !== contextId) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_invalid');
  }
  try { assertTerminalFact(value); }
  catch { throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_invalid'); }
  const fact = value as StoredBookHomeworkTerminalFact;
  if (fact.attemptId !== undefined && fact.resultId !== undefined
    && fact.resultId !== `${fact.attemptId}:result`) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_sequence_invalid');
  }
  if (fact.attemptId !== undefined && fact.completionId !== undefined
    && fact.completionId !== `${fact.attemptId}:completion`) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_sequence_invalid');
  }
  return clone(fact);
};

const parseScope = (
  value: unknown,
  recipientId: string,
  contextId: string,
): BookHomeworkCompletionScope => {
  if (value === null || value === undefined) {
    return { schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION, recipientId, contextId, facts: {} };
  }
  if (!isRecord(value)
    || value.schemaVersion !== BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION
    || value.recipientId !== recipientId
    || value.contextId !== contextId
    || !isRecord(value.facts)
    || encodedBytes(value) > MAX_SCOPE_BYTES) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_scope_invalid');
  }
  const factEntries = Object.entries(value.facts);
  if (factEntries.length > MAX_FACTS_PER_SCOPE) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_capacity_exceeded');
  }
  const facts: Record<string, StoredBookHomeworkTerminalFact> = {};
  for (const [completionId, fact] of factEntries) {
    assertId(completionId, 'completion_id');
    facts[completionId] = parseFact(fact, completionId, recipientId, contextId);
  }
  const projection = value.projection === undefined
    ? undefined
    : (() => {
      try { assertProgressProjection(value.projection); }
      catch { throw new BookHomeworkCompletionRepositoryError('homework_completion_projection_invalid'); }
      const parsed = value.projection as unknown as BookHomeworkCompletionProjection;
      if (parsed.recipientId !== recipientId || parsed.contextId !== contextId) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_projection_context_mismatch');
      }
      return clone(parsed);
    })();
  return {
    schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
    recipientId,
    contextId,
    facts,
    ...(projection ? { projection } : {}),
  };
};

/** Default projection delegates all completion/grading/history semantics to the pure service. */
export const deriveBookHomeworkCompletionProjection: BookHomeworkCompletionProjectionDeriver = ({
  authority,
  binding,
  terminalFacts,
}) => {
  return deriveBookHomeworkProgress({
    manifest: authority.manifest,
    deliveryBindingId: binding.bindingId,
    terminalFacts,
  });
};

const validateProjection = (
  projection: BookHomeworkCompletionProjection,
  authority: BookHomeworkCompletionAuthority,
  binding: BookDeliveryBinding,
): BookHomeworkCompletionProjection => {
  try { assertProgressProjection(projection); }
  catch { throw new BookHomeworkCompletionRepositoryError('homework_completion_projection_invalid'); }
  const parsed = projection;
  if (parsed.manifestVersionId !== authority.manifest.manifestVersionId
    || parsed.deliveryBindingId !== binding.bindingId
    || parsed.bindingRevision !== binding.revision) {
    throw new BookHomeworkCompletionRepositoryError('homework_completion_projection_context_mismatch');
  }
  return parsed;
};

const normalizeInput = (
  input: BookHomeworkCompletionProjectInput,
): { authority: BookHomeworkCompletionAuthority; binding: BookDeliveryBinding; fact: StoredBookHomeworkTerminalFact; now: string } => {
  if (!input || !isRecord(input)) throw new BookHomeworkCompletionRepositoryError('homework_completion_input_invalid');
  assertBinding(input.binding);
  const { authority, manifest } = manifestFromInput(input);
  assertManifestContext(manifest, input.binding);
  const fact = terminalFromInput(input, manifest);
  const now = input.now ?? fact.createdAt;
  assertIso(now, 'now');
  return { authority, binding: input.binding, fact, now };
};

const normalizeReprojectInput = (
  input: BookHomeworkCompletionReprojectInput,
): { authority: BookHomeworkCompletionAuthority; binding: BookDeliveryBinding; now?: string } => {
  if (!input || !isRecord(input)) throw new BookHomeworkCompletionRepositoryError('homework_completion_input_invalid');
  assertBinding(input.binding);
  const { authority, manifest } = manifestFromInput(input);
  assertManifestContext(manifest, input.binding);
  if (input.now !== undefined) assertIso(input.now, 'now');
  return { authority, binding: input.binding, ...(input.now === undefined ? {} : { now: input.now }) };
};

const projectionResult = (
  status: 'accepted' | 'replayed',
  fact: BookHomeworkTerminalFact,
  projection: BookHomeworkCompletionProjection,
): BookHomeworkCompletionProjectResult => ({
  status,
  replayed: status === 'replayed',
  fact: clone(fact),
  projection: clone(projection),
});

const reprojectResult = (
  projection: BookHomeworkCompletionProjection,
): BookHomeworkCompletionReprojectResult => ({
  status: 'reprojected',
  replayed: false,
  projection: clone(projection),
});

export interface InMemoryBookHomeworkCompletionRepositoryOptions {
  readonly deriveProjection?: BookHomeworkCompletionProjectionDeriver;
}

export class InMemoryBookHomeworkCompletionRepository {
  private scopes: Record<string, BookHomeworkCompletionScope>;
  private readonly deriveProjection: BookHomeworkCompletionProjectionDeriver;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    initial: BookHomeworkCompletionRepositorySnapshot = {},
    options: InMemoryBookHomeworkCompletionRepositoryOptions = {},
  ) {
    this.scopes = {};
    for (const [key, value] of Object.entries(initial.scopes ?? {})) {
      if (!isRecord(value) || typeof value.recipientId !== 'string' || typeof value.contextId !== 'string') {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_scope_invalid');
      }
      if (key !== scopeKey(value.recipientId, value.contextId)) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_scope_context_mismatch');
      }
      this.scopes[key] = parseScope(value, value.recipientId, value.contextId);
    }
    this.deriveProjection = options.deriveProjection ?? deriveBookHomeworkCompletionProjection;
  }

  snapshot(): BookHomeworkCompletionRepositorySnapshot {
    return clone({ scopes: this.scopes });
  }

  async readScope(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookHomeworkCompletionScope | null>;
  async readScope(recipientId: string, contextId: string): Promise<BookHomeworkCompletionScope | null>;
  async readScope(
    inputOrRecipientId: { readonly recipientId: string; readonly contextId: string } | string,
    maybeContextId?: string,
  ): Promise<BookHomeworkCompletionScope | null> {
    const recipientId = typeof inputOrRecipientId === 'string' ? inputOrRecipientId : inputOrRecipientId.recipientId;
    const contextId = typeof inputOrRecipientId === 'string' ? maybeContextId : inputOrRecipientId.contextId;
    assertId(recipientId, 'recipient_id');
    assertId(contextId, 'context_id');
    const scope = this.scopes[scopeKey(recipientId, contextId)];
    return scope ? clone(scope) : null;
  }

  async readProjection(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookHomeworkCompletionProjection | null>;
  async readProjection(recipientId: string, contextId: string): Promise<BookHomeworkCompletionProjection | null>;
  async readProjection(
    inputOrRecipientId: { readonly recipientId: string; readonly contextId: string } | string,
    maybeContextId?: string,
  ): Promise<BookHomeworkCompletionProjection | null> {
    const scope = typeof inputOrRecipientId === 'string'
      ? await this.readScope(inputOrRecipientId, maybeContextId ?? '')
      : await this.readScope(inputOrRecipientId);
    return scope?.projection ? clone(scope.projection) : null;
  }

  async resolveCurrentProjection(
    input: BookHomeworkCompletionReprojectInput,
  ): Promise<BookHomeworkCompletionProjection> {
    const normalized = normalizeReprojectInput(input);
    const scope = this.scopes[
      scopeKey(normalized.binding.context.recipientId, normalized.binding.context.contextId)
    ];
    return validateProjection(
      await this.deriveProjection({
        authority: normalized.authority,
        binding: normalized.binding,
        terminalFacts: Object.values(scope?.facts ?? {}).map((fact) => clone(fact)),
        now: normalized.now,
      }),
      normalized.authority,
      normalized.binding,
    );
  }

  async reproject(
    input: BookHomeworkCompletionReprojectInput,
  ): Promise<BookHomeworkCompletionReprojectResult> {
    const normalized = normalizeReprojectInput(input);
    const key = scopeKey(normalized.binding.context.recipientId, normalized.binding.context.contextId);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const scope = this.scopes[key] ?? {
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts: {},
      };
      const projection = validateProjection(
        await this.deriveProjection({
          authority: normalized.authority,
          binding: normalized.binding,
          terminalFacts: Object.values(scope.facts).map((fact) => clone(fact)),
          now: normalized.now,
        }),
        normalized.authority,
        normalized.binding,
      );
      this.scopes[key] = parseScope({
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts: scope.facts,
        projection,
      }, normalized.binding.context.recipientId, normalized.binding.context.contextId);
      return reprojectResult(projection);
    });
    this.queues.set(key, current.then(() => undefined, () => undefined));
    return current;
  }

  async project(input: BookHomeworkCompletionProjectInput): Promise<BookHomeworkCompletionProjectResult> {
    const normalized = normalizeInput(input);
    const key = scopeKey(normalized.binding.context.recipientId, normalized.binding.context.contextId);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const scope = this.scopes[key] ?? {
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts: {},
      };
      const merged = mergeTerminalFact(scope.facts, normalized.fact);
      if (merged.status === 'replayed' && scope.projection
        && scope.projection.manifestVersionId === normalized.authority.manifest.manifestVersionId
        && scope.projection.bindingRevision === normalized.binding.revision) {
        return projectionResult('replayed', normalized.fact, scope.projection);
      }
      const facts = merged.facts;
      if (Object.keys(facts).length > MAX_FACTS_PER_SCOPE) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_capacity_exceeded');
      }
      const projection = validateProjection(
        await this.deriveProjection({
          authority: normalized.authority,
          binding: normalized.binding,
          terminalFacts: Object.values(facts).map((fact) => clone(fact)),
          now: normalized.now,
        }),
        normalized.authority,
        normalized.binding,
      );
      this.scopes[key] = parseScope({
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts,
        projection,
      }, normalized.binding.context.recipientId, normalized.binding.context.contextId);
      return projectionResult(merged.status, normalized.fact, projection);
    });
    this.queues.set(key, current.then(() => undefined, () => undefined));
    return current;
  }
}

export interface FirebaseBookHomeworkCompletionRepositoryOptions {
  readonly env: BookHomeworkCompletionRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly maxRetries?: number;
  readonly deriveProjection?: BookHomeworkCompletionProjectionDeriver;
}

export class FirebaseRestBookHomeworkCompletionRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly serviceIdentity: string;
  private readonly serviceAccountKey?: string;
  private readonly getAccessToken?: () => Promise<string>;
  private readonly maxRetries: number;
  private readonly options: FirebaseBookHomeworkCompletionRepositoryOptions;
  private readonly deriveProjection: BookHomeworkCompletionProjectionDeriver;

  constructor(options: FirebaseBookHomeworkCompletionRepositoryOptions) {
    this.options = options;
    const identity = options.env.BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY?.trim()
      || options.env.BOOK_RUNTIME_SERVICE_IDENTITY?.trim();
    if (!identity) throw new BookHomeworkCompletionRepositoryError('missing_homework_completion_service_identity');
    const keyJson = (options.env.BOOK_HOMEWORK_COMPLETION_GOOGLE_SA_KEY
      || options.env.BOOK_RUNTIME_GOOGLE_SA_KEY)?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new BookHomeworkCompletionRepositoryError('missing_homework_completion_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; }
      catch { throw new BookHomeworkCompletionRepositoryError('invalid_homework_completion_google_sa_key'); }
      if (clientEmail !== identity) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_service_identity_mismatch');
      }
    }
    this.serviceIdentity = identity;
    this.serviceAccountKey = keyJson;
    this.getAccessToken = options.getAccessToken;
    this.maxRetries = Math.max(1, Math.min(8, options.maxRetries ?? MAX_RETRIES));
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: this.serviceAccountKey },
      fetchImpl,
      getAccessToken: this.getAccessToken,
      firebaseAuthToken: Boolean(this.getAccessToken),
    });
    this.deriveProjection = options.deriveProjection ?? deriveBookHomeworkCompletionProjection;
  }

  private assertWriteIdentity(): void {
    const envIdentity = this.options.env.BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY?.trim()
      || this.options.env.BOOK_RUNTIME_SERVICE_IDENTITY?.trim();
    if (envIdentity !== this.serviceIdentity) {
      throw new BookHomeworkCompletionRepositoryError('homework_completion_service_identity_changed');
    }
    if (this.serviceAccountKey) {
      try {
        const email = (JSON.parse(this.serviceAccountKey) as Record<string, unknown>).client_email;
        if (email !== this.serviceIdentity) {
          throw new BookHomeworkCompletionRepositoryError('homework_completion_service_identity_mismatch');
        }
      } catch (error) {
        if (error instanceof BookHomeworkCompletionRepositoryError) throw error;
        throw new BookHomeworkCompletionRepositoryError('invalid_homework_completion_google_sa_key');
      }
    }
  }

  async readScope(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookHomeworkCompletionScope | null>;
  async readScope(recipientId: string, contextId: string): Promise<BookHomeworkCompletionScope | null>;
  async readScope(
    inputOrRecipientId: { readonly recipientId: string; readonly contextId: string } | string,
    maybeContextId?: string,
  ): Promise<BookHomeworkCompletionScope | null> {
    const recipientId = typeof inputOrRecipientId === 'string' ? inputOrRecipientId : inputOrRecipientId.recipientId;
    const contextId = typeof inputOrRecipientId === 'string' ? maybeContextId : inputOrRecipientId.contextId;
    assertId(recipientId, 'recipient_id');
    assertId(contextId, 'context_id');
    const value = await this.rtdb.readValue(scopePath(recipientId, contextId));
    if (value === null || value === undefined) return null;
    return parseScope(value, recipientId, contextId);
  }

  async readProjection(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookHomeworkCompletionProjection | null>;
  async readProjection(recipientId: string, contextId: string): Promise<BookHomeworkCompletionProjection | null>;
  async readProjection(
    inputOrRecipientId: { readonly recipientId: string; readonly contextId: string } | string,
    maybeContextId?: string,
  ): Promise<BookHomeworkCompletionProjection | null> {
    const scope = typeof inputOrRecipientId === 'string'
      ? await this.readScope(inputOrRecipientId, maybeContextId ?? '')
      : await this.readScope(inputOrRecipientId);
    return scope?.projection ? clone(scope.projection) : null;
  }

  async resolveCurrentProjection(
    input: BookHomeworkCompletionReprojectInput,
  ): Promise<BookHomeworkCompletionProjection> {
    const normalized = normalizeReprojectInput(input);
    const scope = await this.readScope({
      recipientId: normalized.binding.context.recipientId,
      contextId: normalized.binding.context.contextId,
    });
    return validateProjection(
      await this.deriveProjection({
        authority: normalized.authority,
        binding: normalized.binding,
        terminalFacts: Object.values(scope?.facts ?? {}).map((fact) => clone(fact)),
        now: normalized.now,
      }),
      normalized.authority,
      normalized.binding,
    );
  }

  async reproject(
    input: BookHomeworkCompletionReprojectInput,
  ): Promise<BookHomeworkCompletionReprojectResult> {
    const normalized = normalizeReprojectInput(input);
    const path = scopePath(normalized.binding.context.recipientId, normalized.binding.context.contextId);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const scope = parseScope(
        current.data,
        normalized.binding.context.recipientId,
        normalized.binding.context.contextId,
      );
      const projection = validateProjection(
        await this.deriveProjection({
          authority: normalized.authority,
          binding: normalized.binding,
          terminalFacts: Object.values(scope.facts).map((fact) => clone(fact)),
          now: normalized.now,
        }),
        normalized.authority,
        normalized.binding,
      );
      const next: BookHomeworkCompletionScope = {
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts: scope.facts,
        projection,
      };
      if (encodedBytes(next) > MAX_SCOPE_BYTES) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_scope_capacity_exceeded');
      }
      this.assertWriteIdentity();
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) {
        return reprojectResult(projection);
      }
    }
    throw new BookHomeworkCompletionRepositoryError('homework_completion_cas_retries_exhausted');
  }

  async project(input: BookHomeworkCompletionProjectInput): Promise<BookHomeworkCompletionProjectResult> {
    const normalized = normalizeInput(input);
    const path = scopePath(normalized.binding.context.recipientId, normalized.binding.context.contextId);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const scope = parseScope(
        current.data,
        normalized.binding.context.recipientId,
        normalized.binding.context.contextId,
      );
      const merged = mergeTerminalFact(scope.facts, normalized.fact);
      if (merged.status === 'replayed' && scope.projection
        && scope.projection.manifestVersionId === normalized.authority.manifest.manifestVersionId
        && scope.projection.bindingRevision === normalized.binding.revision) {
        return projectionResult('replayed', normalized.fact, scope.projection);
      }
      const facts = merged.facts;
      if (Object.keys(facts).length > MAX_FACTS_PER_SCOPE) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_fact_capacity_exceeded');
      }
      const projection = validateProjection(
        await this.deriveProjection({
          authority: normalized.authority,
          binding: normalized.binding,
          terminalFacts: Object.values(facts).map((fact) => clone(fact)),
          now: normalized.now,
        }),
        normalized.authority,
        normalized.binding,
      );
      const next: BookHomeworkCompletionScope = {
        schemaVersion: BOOK_HOMEWORK_COMPLETION_SCHEMA_VERSION,
        recipientId: normalized.binding.context.recipientId,
        contextId: normalized.binding.context.contextId,
        facts,
        projection,
      };
      if (encodedBytes(next) > MAX_SCOPE_BYTES) {
        throw new BookHomeworkCompletionRepositoryError('homework_completion_scope_capacity_exceeded');
      }
      this.assertWriteIdentity();
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) {
        return projectionResult(merged.status, normalized.fact, projection);
      }
    }
    throw new BookHomeworkCompletionRepositoryError('homework_completion_cas_retries_exhausted');
  }
}
