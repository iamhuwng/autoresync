import type { ActivityDiff, NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import { normalizeActivity } from '../../../../src/services/book-activity/activityCanonical.service.ts';
import { diffActivities } from '../../../../src/services/book-activity/activityDiff.service.ts';
import { validateEditableActivity } from '../../../../src/services/book-activity/activitySchema.service.ts';
import {
  BOOK_ACTIVITY_EVIDENCE_REF_PATTERN,
  BOOK_ACTIVITY_MAX_EVIDENCE_REFS,
} from '../../../../src/services/book-activity/activityCandidate.service.ts';
import {
  FirebaseRestBookActivityAuthoringRepository,
  type BookActivityAuthoringRepositoryEnv,
  type BookActivityAuthoringRoot,
} from './repository.ts';
import {
  createBookRolloutWorkerGate,
  type BookRolloutWorkerGate,
} from '../../book-rollout-gate.ts';
import {
  BookRolloutDeniedError,
  createBookRolloutTrustedSeamGate,
} from '../../book-rollout-seams.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';
import type {
  UnitActivityBinding,
  UnitActivityBindingRepository,
} from '../../../../src/services/book-assembly/unitActivityBinding.repository.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CANDIDATE_RECORD_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Mutation = 'stage' | 'validate' | 'save-draft' | 'discard';
type Lifecycle = 'staged' | 'validated' | 'rejected' | 'saved' | 'discarded';
const MAX_CANDIDATES_PER_OWNER = 128;
const MAX_ACTIVITIES_PER_OWNER = 128;
const MAX_OPERATIONS_PER_OWNER = 256;
const OPERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MATERIAL_BOOK_PATH = (bookId: string): string => `material_catalog/books/${bookId}`;
const MATERIAL_BOOK_STATUSES = new Set([
  'draft-empty', 'draft-in-progress', 'ready', 'needs-repair', 'archived',
]);

interface ActivityRecord {
  activityId: string;
  ownerId: string;
  revision: number;
  lifecycle: 'draft';
  editableDraft: unknown;
  draft: NormalizedActivity;
  updatedAt: number;
}
interface CandidateRecord {
  candidateId: string;
  targetActivityId: string;
  ownerId: string;
  /** Server-resolved Book binding; absent only on legacy records, which cannot mutate. */
  bookId?: string;
  targetRevision: number;
  revision: number;
  lifecycle: Lifecycle;
  content: unknown;
  validation: { valid: boolean; errors: unknown[] };
  diff: unknown;
  evidenceRefs: string[];
  sourceEvidenceRefs: string[];
  answerEvidenceRefs: string[];
  updatedAt: number;
}
interface OperationRecord { ownerId: string; fingerprint: string; result: Record<string, unknown>; createdAt: number }

class AuthoringError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly detail?: Record<string, unknown>) {
    super(code);
    this.name = 'AuthoringError';
  }
}

interface BookActivityAuthoringRepositoryPort {
  readValue(path: string): Promise<unknown>;
  readOwnerRoot(ownerId: string): Promise<BookActivityAuthoringRoot>;
  transaction<T>(
    ownerId: string,
    mutate: (current: BookActivityAuthoringRoot) => { outcome: T; next?: BookActivityAuthoringRoot; write: boolean },
    options?: { beforeWrite?: (next: BookActivityAuthoringRoot) => Promise<void> },
  ): Promise<T>;
}

const plainRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = plainRecord(value);
  if (record) return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowDefault = (): number => Date.now();
const encodedBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const validId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new AuthoringError(`invalid_${label}`);
  return value;
};
const validRevision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new AuthoringError('invalid_expected_revision');
  return value as number;
};
const evidenceRefs = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > BOOK_ACTIVITY_MAX_EVIDENCE_REFS ||
    value.some((entry) => typeof entry !== 'string' || !BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(entry)) ||
    new Set(value).size !== value.length) throw new AuthoringError('invalid_evidence_refs');
  return [...value];
};
const evidenceRefGroups = (body: Record<string, unknown>): {
  legacy: string[];
  source: string[];
  answer: string[];
} => ({
  legacy: evidenceRefs(body.evidenceRefs) ?? [],
  source: evidenceRefs(body.sourceEvidenceRefs) ?? [],
  answer: evidenceRefs(body.answerEvidenceRefs) ?? [],
});
const unitActivityBinding = (body: Record<string, unknown>): { unitKey: string; activityKey: string } | undefined => {
  if (body.unitActivityBinding === undefined) return undefined;
  const value = plainRecord(body.unitActivityBinding);
  if (!value || Object.keys(value).some((key) => key !== 'unitKey' && key !== 'activityKey')) {
    throw new AuthoringError('invalid_unit_activity_binding');
  }
  return {
    unitKey: validId(value.unitKey, 'unit_key'),
    activityKey: validId(value.activityKey, 'activity_key'),
  };
};

type BindingReceiptPhase = 'binding-pending' | 'complete' | 'binding-conflict';
type BindingReceipt = UnitActivityBinding & {
  readonly phase: BindingReceiptPhase;
};

const bindingReceipt = (value: unknown): BindingReceipt | undefined => {
  const record = plainRecord(value);
  if (!record || !validIdValue(record.ownerId) || !validIdValue(record.bookId)
    || !validIdValue(record.unitKey) || !validIdValue(record.activityKey)
    || !validIdValue(record.activityId) || !validIdValue(record.candidateId)
    || !validRevisionValue(record.candidateRevision)
    || record.schemaVersion !== 1 || record.candidateLifecycle !== 'saved'
    || !['binding-pending', 'complete', 'binding-conflict'].includes(String(record.phase))) return undefined;
  return {
    schemaVersion: 1,
    ownerId: record.ownerId,
    bookId: record.bookId,
    unitKey: record.unitKey,
    activityKey: record.activityKey,
    activityId: record.activityId,
    candidateId: record.candidateId,
    candidateRevision: record.candidateRevision,
    candidateLifecycle: 'saved',
    phase: record.phase as BindingReceiptPhase,
  };
};
const sameBindingIdentity = (left: BindingReceipt, right: BindingReceipt): boolean => (
  left.ownerId === right.ownerId && left.bookId === right.bookId
  && left.unitKey === right.unitKey && left.activityKey === right.activityKey
  && left.activityId === right.activityId && left.candidateId === right.candidateId
  && left.candidateRevision === right.candidateRevision
);
const bindingWrite = (receipt: BindingReceipt): UnitActivityBinding => ({
  schemaVersion: 1,
  ownerId: receipt.ownerId,
  bookId: receipt.bookId,
  unitKey: receipt.unitKey,
  activityKey: receipt.activityKey,
  activityId: receipt.activityId,
  candidateId: receipt.candidateId,
  candidateRevision: receipt.candidateRevision,
  candidateLifecycle: 'saved',
});

const terminal = (candidate: CandidateRecord): boolean => ['rejected', 'saved', 'discarded'].includes(candidate.lifecycle);
const prune = (root: BookActivityAuthoringRoot, at: number): void => {
  const operations = Object.entries(root.operations ?? {})
    .flatMap(([id, value]) => {
      const operation = asOperation(value);
      return operation && operation.createdAt >= at - OPERATION_RETENTION_MS ? [[id, operation] as const] : [];
    })
    .sort(([, left], [, right]) => right.createdAt - left.createdAt)
    .slice(0, MAX_OPERATIONS_PER_OWNER);
  root.operations = Object.fromEntries(operations);
  const candidates = Object.entries(root.candidates ?? {});
  if (candidates.length < MAX_CANDIDATES_PER_OWNER) return;
  const removable = candidates
    .flatMap(([id, value]) => {
      const candidate = asCandidate(value, id);
      return candidate && terminal(candidate) ? [[id, candidate] as const] : [];
    })
    .sort(([, left], [, right]) => left.updatedAt - right.updatedAt);
  const next = { ...(root.candidates ?? {}) };
  for (const [id] of removable) {
    if (Object.keys(next).length < MAX_CANDIDATES_PER_OWNER) break;
    delete next[id];
  }
  root.candidates = next;
};

const readBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw new AuthoringError('content_type_required');
  const claimedLength = request.headers.get('Content-Length');
  if (claimedLength !== null && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new AuthoringError('body_too_large', 413);
  }
  if (!request.body) throw new AuthoringError('invalid_json');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new AuthoringError('body_too_large', 413);
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder().decode(parts.length === 1 ? parts[0] : concat(parts, bytes))); }
  catch { throw new AuthoringError('invalid_json'); }
};
const concat = (parts: Uint8Array[], size: number): Uint8Array => {
  const merged = new Uint8Array(size); let offset = 0;
  parts.forEach((part) => { merged.set(part, offset); offset += part.byteLength; });
  return merged;
};

const role = (profile: unknown): 'teacher' | 'super_admin' | null => {
  const user = plainRecord(profile);
  if (!user || user.forceReauth === true || ['blocked', 'inactive', 'suspended'].includes(String(user.status))) return null;
  return user.role === 'teacher' || user.role === 'super_admin' ? user.role : null;
};
const validIdValue = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validRevisionValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isLifecycle = (value: unknown): value is Lifecycle => (
  value === 'staged' || value === 'validated' || value === 'rejected' || value === 'saved' || value === 'discarded'
);
/** Compatibility resolver for focused tests that have no production authority port. */
const resolveOwnedPdfBookIdFromRepository = async (
  repository: BookActivityAuthoringRepositoryPort,
  ownerId: string,
  claimedBookId: string,
): Promise<string | undefined> => {
  const metadata = plainRecord(await repository.readValue(MATERIAL_BOOK_PATH(claimedBookId)));
  if (!metadata
    || metadata.bookId !== claimedBookId
    || metadata.ownerId !== ownerId
    || metadata.bookMode !== 'pdf'
    || typeof metadata.status !== 'string'
    || !MATERIAL_BOOK_STATUSES.has(metadata.status)
    || metadata.status === 'archived') {
    return undefined;
  }
  return claimedBookId;
};

const persistedCandidateBookId = (
  root: BookActivityAuthoringRoot,
  candidateId: unknown,
): string | undefined => {
  if (!validIdValue(candidateId)) return undefined;
  return asCandidate(root.candidates?.[candidateId], candidateId)?.bookId;
};

const asActivity = (value: unknown, expectedActivityId?: string): ActivityRecord | undefined => {
  const record = plainRecord(value);
  if (!record || !validIdValue(record.activityId) || !validIdValue(record.ownerId) ||
    (expectedActivityId !== undefined && record.activityId !== expectedActivityId) ||
    !validRevisionValue(record.revision) || record.lifecycle !== 'draft' || !validTimestamp(record.updatedAt)) return undefined;
  const validation = validateEditableActivity(record.editableDraft);
  if (!validation.valid) return undefined;
  try {
    const persistedDraft = record.draft as NormalizedActivity;
    const draft = normalizeActivity(validation.value, undefined, persistedDraft);
    if (stable(draft) !== stable(record.draft)) return undefined;
    return {
      activityId: record.activityId,
      ownerId: record.ownerId,
      revision: record.revision,
      lifecycle: 'draft',
      editableDraft: clone(validation.value),
      draft,
      updatedAt: record.updatedAt,
    };
  } catch {
    return undefined;
  }
};
const asCandidate = (value: unknown, expectedCandidateId?: string): CandidateRecord | undefined => {
  const record = plainRecord(value);
  const validation = plainRecord(record?.validation);
  if (!record || !validation || !validIdValue(record.candidateId) ||
    (expectedCandidateId !== undefined && record.candidateId !== expectedCandidateId) ||
    !validIdValue(record.targetActivityId) ||
    !validIdValue(record.ownerId) || !validRevisionValue(record.targetRevision) || !validRevisionValue(record.revision) ||
    !isLifecycle(record.lifecycle) || typeof validation.valid !== 'boolean' || !Array.isArray(validation.errors) ||
    !Array.isArray(record.evidenceRefs) ||
    record.evidenceRefs.length > BOOK_ACTIVITY_MAX_EVIDENCE_REFS ||
    record.evidenceRefs.some((ref) => typeof ref !== 'string' || !BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(ref)) ||
    new Set(record.evidenceRefs).size !== record.evidenceRefs.length || !validTimestamp(record.updatedAt)) return undefined;
  if (encodedBytes(record) > MAX_CANDIDATE_RECORD_BYTES) return undefined;
  const sourceEvidenceRefs = record.sourceEvidenceRefs === undefined
    ? [] : evidenceRefs(record.sourceEvidenceRefs);
  const answerEvidenceRefs = record.answerEvidenceRefs === undefined
    ? [] : evidenceRefs(record.answerEvidenceRefs);
  if (!sourceEvidenceRefs || !answerEvidenceRefs) return undefined;
  return {
    candidateId: record.candidateId,
    targetActivityId: record.targetActivityId,
    ownerId: record.ownerId,
    ...(validIdValue(record.bookId) ? { bookId: record.bookId } : {}),
    targetRevision: record.targetRevision,
    revision: record.revision,
    lifecycle: record.lifecycle,
    content: clone(record.content),
    validation: { valid: validation.valid, errors: clone(validation.errors) },
    diff: record.diff === null ? null : clone(record.diff),
    evidenceRefs: [...record.evidenceRefs],
    sourceEvidenceRefs,
    answerEvidenceRefs,
    updatedAt: record.updatedAt,
  };
};
const asOperation = (value: unknown): OperationRecord | undefined => {
  const record = plainRecord(value);
  const result = plainRecord(record?.result);
  if (!record || !result || !validIdValue(record.ownerId) || typeof record.fingerprint !== 'string' || !validTimestamp(record.createdAt)) return undefined;
  return { ownerId: record.ownerId, fingerprint: record.fingerprint, result: clone(result), createdAt: record.createdAt };
};

const assertPersistedRoot = (
  root: BookActivityAuthoringRoot,
  expectedOwnerId: string,
): void => {
  for (const [activityId, value] of Object.entries(root.activities ?? {})) {
    const activity = asActivity(value, activityId);
    if (!activity || activity.ownerId !== expectedOwnerId) {
      throw new AuthoringError('invalid_persisted_activity', 500);
    }
  }
  for (const [candidateId, value] of Object.entries(root.candidates ?? {})) {
    const candidate = asCandidate(value, candidateId);
    if (!candidate || candidate.ownerId !== expectedOwnerId) {
      throw new AuthoringError('invalid_persisted_candidate', 500);
    }
  }
  for (const [operationId, value] of Object.entries(root.operations ?? {})) {
    const operation = asOperation(value);
    if (!OPERATION_ID.test(operationId) || !operation || operation.ownerId !== expectedOwnerId) {
      throw new AuthoringError('invalid_persisted_operation', 500);
    }
  }
};

const exact = (body: unknown, keys: readonly string[]): Record<string, unknown> => {
  const record = plainRecord(body);
  if (!record || Object.keys(record).some((key) => !keys.includes(key))) throw new AuthoringError('invalid_request');
  return record;
};
const operation = (body: Record<string, unknown>): string => {
  const value = body.operationId;
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) throw new AuthoringError('invalid_operation_id');
  return value;
};
const recordId = (prefix: 'activity' | 'candidate', createId: () => string): string => {
  const value = createId();
  if (!OPERATION_ID.test(value)) {
    throw new AuthoringError('trusted_id_provider_failed', 500);
  }
  return `${prefix}-${value}`;
};
const operationResult = (
  root: BookActivityAuthoringRoot,
  ownerId: string,
  operationId: string,
  fingerprint: string,
  at: number,
  create: () => Record<string, unknown>,
): { result: Record<string, unknown>; write: boolean } => {
  const operations = root.operations ?? {};
  const old = asOperation(operations[operationId]);
  if (old) {
    if (old.ownerId !== ownerId || old.fingerprint !== fingerprint) {
      return { result: { status: 'idempotency-conflict' }, write: false };
    }
    return { result: { ...clone(old.result), replayed: true }, write: false };
  }
  const result = create();
  const retained = Object.entries(operations)
    .flatMap(([id, value]) => {
      const operation = asOperation(value);
      return operation ? [[id, operation] as const] : [];
    })
    .sort(([, left], [, right]) => right.createdAt - left.createdAt)
    .slice(0, MAX_OPERATIONS_PER_OWNER - 1);
  root.operations = {
    ...Object.fromEntries(retained),
    [operationId]: { ownerId, fingerprint, result: clone(result), createdAt: at },
  };
  return { result, write: true };
};

const validateContent = (content: unknown, previous?: NormalizedActivity): {
  validation: { valid: boolean; errors: unknown[] };
  normalized?: NormalizedActivity;
  diff: ActivityDiff | null;
} => {
  const validation = validateEditableActivity(content);
  if (!validation.valid) return { validation: { valid: false, errors: validation.errors }, diff: null };
  const normalized = normalizeActivity(validation.value, undefined, previous);
  return { validation: { valid: true, errors: [] }, normalized, diff: diffActivities(previous ?? null, normalized) };
};

const httpStatus = (body: Record<string, unknown>): number => {
  if (body.status === 'idempotency-conflict' || body.status === 'conflict' || body.status === 'id-collision'
    || body.status === 'capacity-exceeded' || body.status === 'binding-conflict') return 409;
  if (body.status === 'not-found') return 404;
  if (body.status === 'invalid') return 422;
  return 200;
};

export const createBookActivityAuthoringWorkerHandlers = (options: {
  repository?: BookActivityAuthoringRepositoryPort;
  /** Production-composed authority port; repository lookup remains test compatibility only. */
  resolveOwnedPdfBookId?: (input: {
    readonly env: BookActivityAuthoringRepositoryEnv;
    readonly ownerId: string;
    readonly claimedBookId: string;
  }) => Promise<string | undefined>;
  now?: () => number;
  createRecordId?: () => string;
  /** Test-only trusted adapter; production reads deployment-owned input.env. */
  rolloutGate?: BookRolloutWorkerGate;
  /** #59: only the production composition supplies this server-side CAS port. */
  bindingRepositoryFactory?: (
    env: BookActivityAuthoringRepositoryEnv,
    ownerId: string,
    bookId: string,
    unitKey: string,
  ) => UnitActivityBindingRepository;
  /** Verifies the requested logical slot against the current trusted Assembly candidate. */
  readAssemblyActivityKeys?: (input: {
    readonly env: BookActivityAuthoringRepositoryEnv;
    readonly ownerId: string;
    readonly bookId: string;
    readonly unitKey: string;
  }) => Promise<readonly string[] | null>;
} = {}) => {
  const now = options.now ?? nowDefault;
  const createRecordId = options.createRecordId ?? (() => crypto.randomUUID());
  const repositoryFor = (env: BookActivityAuthoringRepositoryEnv): BookActivityAuthoringRepositoryPort => (
    options.repository ?? new FirebaseRestBookActivityAuthoringRepository({ env })
  );
  const authenticate = async (uid: string, repository: BookActivityAuthoringRepositoryPort): Promise<void> => {
    if (!role(await repository.readValue(`users/${uid}`))) throw new AuthoringError('authoring_forbidden', 403);
  };
  const resolveOwnedPdfBookId = async (
    env: BookActivityAuthoringRepositoryEnv,
    repository: BookActivityAuthoringRepositoryPort,
    ownerId: string,
    claimedBookId: unknown,
  ): Promise<string | undefined> => {
    if (!validIdValue(claimedBookId)) return undefined;
    const resolvedBookId = options.resolveOwnedPdfBookId
      ? await options.resolveOwnedPdfBookId({ env, ownerId, claimedBookId })
      : await resolveOwnedPdfBookIdFromRepository(repository, ownerId, claimedBookId);
    // The port may only confirm the already-derived claim; it cannot select a
    // different Book as the mutation subject.
    return resolvedBookId === claimedBookId ? resolvedBookId : undefined;
  };
  const advanceBindingReceipt = async (
    repository: BookActivityAuthoringRepositoryPort,
    ownerId: string,
    operationId: string,
    fingerprint: string,
    expected: BindingReceipt,
    phase: Extract<BindingReceiptPhase, 'complete' | 'binding-conflict'>,
  ): Promise<Record<string, unknown> | null> => repository.transaction(ownerId, (root) => {
    assertPersistedRoot(root, ownerId);
    const previous = asOperation(root.operations?.[operationId]);
    const result = plainRecord(previous?.result);
    const currentBinding = bindingReceipt(result?.binding);
    if (!previous || previous.ownerId !== ownerId || previous.fingerprint !== fingerprint
      || !result || !currentBinding || !sameBindingIdentity(currentBinding, expected)) {
      return { outcome: null, write: false };
    }
    if (currentBinding.phase === phase) return { outcome: clone(result), write: false };
    const nextResult = {
      ...result,
      status: phase === 'complete' ? 'saved' : 'binding-conflict',
      binding: { ...currentBinding, phase },
    };
    root.operations = {
      ...(root.operations ?? {}),
      [operationId]: { ...previous, result: clone(nextResult) },
    };
    return { outcome: nextResult, next: root, write: true };
  });
  const upgradeLegacyBindingReceipt = async (
    repository: BookActivityAuthoringRepositoryPort,
    ownerId: string,
    operationId: string,
    fingerprint: string,
    bookId: string,
    requested: { unitKey: string; activityKey: string },
  ): Promise<Record<string, unknown> | null> => repository.transaction(ownerId, (root) => {
    assertPersistedRoot(root, ownerId);
    const previous = asOperation(root.operations?.[operationId]);
    const result = plainRecord(previous?.result);
    if (!previous || previous.ownerId !== ownerId || previous.fingerprint !== fingerprint
      || !result || result.status !== 'saved' || result.binding !== undefined
      || !validIdValue(result.activityId) || !validIdValue(result.candidateId)
      || !validRevisionValue(result.candidateRevision)) {
      return { outcome: null, write: false };
    }
    const candidate = asCandidate(root.candidates?.[result.candidateId], result.candidateId);
    const activity = asActivity(root.activities?.[result.activityId], result.activityId);
    if (!candidate || !activity || candidate.ownerId !== ownerId || activity.ownerId !== ownerId
      || candidate.bookId !== bookId || candidate.lifecycle !== 'saved'
      || candidate.revision !== result.candidateRevision
      || candidate.targetActivityId !== result.activityId
      || activity.activityId !== result.activityId) {
      return { outcome: null, write: false };
    }
    const receipt: BindingReceipt = {
      schemaVersion: 1,
      ownerId,
      bookId,
      unitKey: requested.unitKey,
      activityKey: requested.activityKey,
      activityId: result.activityId,
      candidateId: result.candidateId,
      candidateRevision: result.candidateRevision,
      candidateLifecycle: 'saved',
      phase: 'binding-pending',
    };
    const nextResult = { ...result, binding: receipt };
    root.operations = {
      ...(root.operations ?? {}),
      [operationId]: { ...previous, result: clone(nextResult) },
    };
    return { outcome: { ...nextResult, replayed: true }, next: root, write: true };
  });
  const incompleteBindingResponse = (result: Record<string, unknown>, receipt: BindingReceipt) => ({
    ...result,
    status: 'binding-incomplete',
    retryable: true,
    binding: { ...receipt, phase: 'binding-pending' },
  });
  const respond = async (mutation: Mutation, input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => {
    try {
      const rolloutGate = createBookRolloutTrustedSeamGate(
        options.rolloutGate ?? createBookRolloutWorkerGate(input.env),
      );
      const rolloutOperation = mutation === 'stage' ? 'create' : 'mutation';
      // Validate deployment enforcement before reading any mutation subject. The
      // exact Book check follows only after the server resolves the binding.
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: rolloutOperation,
        actorKind: 'teacher',
        bookId: null,
        requireBook: false,
      });
      rolloutGate.homeworkMutation();
      const repository = repositoryFor(input.env);
      const body = await readBody(input.request);
      await authenticate(input.uid, repository);
      const bodyRecord = plainRecord(body);
      const saveRequest = mutation === 'save-draft'
        ? exact(body, [
          'operationId', 'expectedRevision', 'candidateId', 'evidenceRefs',
          'sourceEvidenceRefs', 'answerEvidenceRefs', 'unitActivityBinding',
        ])
        : undefined;
      const requestedBinding = saveRequest ? unitActivityBinding(saveRequest) : undefined;
      const saveOperationId = saveRequest ? operation(saveRequest) : undefined;
      const saveExpectedRevision = saveRequest ? validRevision(saveRequest.expectedRevision) : undefined;
      const candidateId = mutation === 'stage'
        ? undefined
        : (validIdValue(bodyRecord?.candidateId) ? bodyRecord.candidateId : undefined);
      const initialRoot = mutation === 'stage'
        ? undefined
        : await repository.readOwnerRoot(input.uid);
      if (initialRoot) assertPersistedRoot(initialRoot, input.uid);
      const claimedBookId = mutation === 'stage'
        ? bodyRecord?.bookId
        : persistedCandidateBookId(initialRoot ?? {}, candidateId);
      const trustedBookId = await resolveOwnedPdfBookId(input.env, repository, input.uid, claimedBookId);
      // The body Book ID is only a claim for stage. For later mutations the
      // candidate's persisted binding is the sole subject input.
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: rolloutOperation,
        actorKind: 'teacher',
        bookId: trustedBookId,
        requireBook: true,
      });
      let bindingRepository: UnitActivityBindingRepository | undefined;
      let saveBindingFingerprint: string | undefined;
      if (requestedBinding) {
        if (!trustedBookId || !options.bindingRepositoryFactory || !options.readAssemblyActivityKeys) {
          throw new AuthoringError('unit_activity_binding_unavailable', 503);
        }
        const activityKeys = await options.readAssemblyActivityKeys({
          env: input.env, ownerId: input.uid, bookId: trustedBookId, unitKey: requestedBinding.unitKey,
        });
        if (!activityKeys || !activityKeys.includes(requestedBinding.activityKey)) {
          throw new AuthoringError('unit_activity_binding_scope_invalid', 409);
        }
        bindingRepository = options.bindingRepositoryFactory(input.env, input.uid, trustedBookId, requestedBinding.unitKey);
        const candidate = asCandidate(initialRoot?.candidates?.[candidateId ?? ''], candidateId);
        if (candidate && candidate.ownerId === input.uid && candidate.revision === saveExpectedRevision
          && candidate.lifecycle === 'validated') {
          const existing = await bindingRepository.read({
            ownerId: input.uid, bookId: trustedBookId, unitKey: requestedBinding.unitKey,
            activityKey: requestedBinding.activityKey,
          });
          if (existing && (existing.activityId !== candidate.targetActivityId || existing.candidateId !== candidate.candidateId
            || existing.activityVersionId !== undefined || existing.candidateRevision > candidate.revision + 1)) {
            throw new AuthoringError('unit_activity_binding_conflict', 409);
          }
        }
        const refs = evidenceRefGroups(saveRequest!);
        saveBindingFingerprint = stable({
          action: 'save-draft', candidateId, expectedRevision: saveExpectedRevision,
          evidenceRefs: refs ?? null, unitActivityBinding: requestedBinding,
        });
      }
      let output = await repository.transaction(input.uid, (root) => {
        assertPersistedRoot(root, input.uid);
        if (mutation === 'stage') return stage(root, input.uid, body, now(), createRecordId, trustedBookId!);
        if (mutation === 'validate') return validate(root, input.uid, body, now());
        if (mutation === 'save-draft') return saveDraft(root, input.uid, body, now(), trustedBookId!);
        return discard(root, input.uid, body, now());
      }, {
        beforeWrite: async (next) => {
          // Recheck deployment enforcement and authenticated ownership on every
          // CAS attempt, then derive the Book from the post-mutation candidate.
          await enforceBookPilotScopeIfConfigured({
            env: input.env,
            uid: input.uid,
            request: input.request,
            operation: rolloutOperation,
            actorKind: 'teacher',
            bookId: null,
            requireBook: false,
          });
          rolloutGate.homeworkMutation();
          await authenticate(input.uid, repository);
          let nextBookId = mutation === 'stage'
            ? trustedBookId
            : persistedCandidateBookId(next, candidateId);
          if (mutation === 'stage' && trustedBookId) {
            const operationRecord = plainRecord(next.operations?.[bodyRecord?.operationId as string]);
            const result = plainRecord(operationRecord?.result);
            if (result?.candidateId !== undefined) {
              const persisted = asCandidate(next.candidates?.[String(result.candidateId)], String(result.candidateId));
              if (!persisted || persisted.bookId !== trustedBookId) {
                throw new AuthoringError('invalid_persisted_candidate', 500);
              }
              nextBookId = persisted.bookId;
            }
          }
          const resolvedBookId = await resolveOwnedPdfBookId(input.env, repository, input.uid, nextBookId);
          await enforceBookPilotScopeIfConfigured({
            env: input.env,
            uid: input.uid,
            request: input.request,
            operation: rolloutOperation,
            actorKind: 'teacher',
            bookId: resolvedBookId,
            requireBook: true,
          });
        },
      });
      if (requestedBinding) {
        let saved = plainRecord(output);
        let receipt = bindingReceipt(saved?.binding);
        if (saved?.status === 'saved' && saved.replayed === true && !receipt
          && trustedBookId && saveOperationId && saveBindingFingerprint) {
          output = await upgradeLegacyBindingReceipt(
            repository,
            input.uid,
            saveOperationId,
            saveBindingFingerprint,
            trustedBookId,
            requestedBinding,
          ) ?? output;
          saved = plainRecord(output);
          receipt = bindingReceipt(saved?.binding);
        }
        if (!saved || !receipt || !trustedBookId || !bindingRepository || !saveBindingFingerprint
          || receipt.ownerId !== input.uid || receipt.bookId !== trustedBookId
          || receipt.unitKey !== requestedBinding.unitKey || receipt.activityKey !== requestedBinding.activityKey) {
          throw new AuthoringError('unit_activity_binding_receipt_invalid', 500);
        }
        if (receipt.phase === 'complete' || receipt.phase === 'binding-conflict') {
          return { body: output, init: { status: httpStatus(output) } };
        }
        try {
          const activityKeys = await options.readAssemblyActivityKeys!({
            env: input.env, ownerId: input.uid, bookId: trustedBookId, unitKey: requestedBinding.unitKey,
          });
          if (!activityKeys || !activityKeys.includes(requestedBinding.activityKey)) {
            const partial = await advanceBindingReceipt(
              repository, input.uid, saveOperationId!, saveBindingFingerprint, receipt, 'binding-conflict',
            );
            return { body: partial ?? incompleteBindingResponse(saved, receipt), init: { status: partial ? 409 : 202 } };
          }
          const status = await bindingRepository.bindCandidate(bindingWrite(receipt));
          if (status === 'conflict' || status === 'stale') {
            const partial = await advanceBindingReceipt(
              repository, input.uid, saveOperationId!, saveBindingFingerprint, receipt, 'binding-conflict',
            );
            return { body: partial ?? incompleteBindingResponse(saved, receipt), init: { status: partial ? 409 : 202 } };
          }
          const complete = await advanceBindingReceipt(
            repository, input.uid, saveOperationId!, saveBindingFingerprint, receipt, 'complete',
          );
          return {
            body: complete
              ? { ...complete, ...(saved.replayed === true ? { replayed: true } : {}) }
              : incompleteBindingResponse(saved, receipt),
            init: { status: complete ? 200 : 202 },
          };
        } catch {
          return { body: incompleteBindingResponse(saved, receipt), init: { status: 202 } };
        }
      }
      return { body: output, init: { status: httpStatus(output) } };
    } catch (error) {
      if (error instanceof BookRolloutDeniedError) {
        return {
          body: { code: error.code, decision: error.authorization.decision },
          init: { status: error.status },
        };
      }
      if (error instanceof BookPilotScopeDeniedError) {
        return {
          body: { code: error.message, decision: error.decision },
          init: { status: error.status },
        };
      }
      if (error instanceof AuthoringError) return { body: { code: error.code, ...(error.detail ?? {}) }, init: { status: error.status } };
      console.error('Book Activity authoring mutation failed', error instanceof Error ? error.message : String(error));
      return { body: { code: 'book_activity_authoring_failed' }, init: { status: 500 } };
    }
  };
  return {
    stage: (input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => respond('stage', input),
    validate: (input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => respond('validate', input),
    saveDraft: (input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => respond('save-draft', input),
    discard: (input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => respond('discard', input),
    async loadCandidate(input: { env: BookActivityAuthoringRepositoryEnv; uid: string; candidateId: string }) {
      try {
        const repository = repositoryFor(input.env); await authenticate(input.uid, repository);
        const candidateId = validId(input.candidateId, 'candidate_id');
        const persistedRoot = await repository.readOwnerRoot(input.uid);
        assertPersistedRoot(persistedRoot, input.uid);
        const candidate = asCandidate(persistedRoot.candidates?.[candidateId], candidateId);
        if (!candidate || candidate.ownerId !== input.uid) return { body: { status: 'not-found' }, init: { status: 404 } };
        return { body: { status: 'loaded', candidate: clone(candidate) }, init: { status: 200 } };
      } catch (error) {
        const status = error instanceof AuthoringError ? error.status : 500;
        return { body: { code: error instanceof AuthoringError ? error.code : 'book_activity_authoring_failed' }, init: { status } };
      }
    },
  };
};

const stage = (
  root: BookActivityAuthoringRoot,
  ownerId: string,
  body: unknown,
  at: number,
  createRecordId: () => string,
  bookId: string,
) => {
  const input = exact(body, [
    'operationId', 'expectedRevision', 'targetActivityId', 'content', 'evidenceRefs',
    'sourceEvidenceRefs', 'answerEvidenceRefs', 'bookId',
  ]);
  const operationId = operation(input); const expectedRevision = validRevision(input.expectedRevision);
  const requestedTargetActivityId = input.targetActivityId === undefined ? undefined : validId(input.targetActivityId, 'activity_id');
  const refs = evidenceRefGroups(input);
  prune(root, at);
  const fingerprint = stable({ action: 'stage', bookId, expectedRevision, targetActivityId: requestedTargetActivityId ?? null, content: input.content, evidenceRefs: refs });
  const claimed = operationResult(root, ownerId, operationId, fingerprint, at, () => {
    if (Object.keys(root.candidates ?? {}).length >= MAX_CANDIDATES_PER_OWNER) return { status: 'capacity-exceeded' };
    const targetActivityId = requestedTargetActivityId ?? recordId('activity', createRecordId);
    const existing = asActivity(root.activities?.[targetActivityId], targetActivityId);
    if (existing && existing.ownerId !== ownerId) return { status: 'not-found' };
    if (!existing && Object.keys(root.activities ?? {}).length >= MAX_ACTIVITIES_PER_OWNER) {
      return { status: 'capacity-exceeded' };
    }
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) return { status: 'conflict', currentRevision };
    const checked = validateContent(input.content, existing?.draft);
    const candidateId = recordId('candidate', createRecordId);
    if (root.candidates?.[candidateId]) return { status: 'id-collision' };
    const candidate: CandidateRecord = {
      candidateId, targetActivityId, ownerId, targetRevision: currentRevision, revision: 1,
      bookId,
      lifecycle: checked.validation.valid ? 'staged' : 'rejected', content: clone(input.content),
      validation: checked.validation, diff: checked.diff, evidenceRefs: refs.legacy,
      sourceEvidenceRefs: refs.source, answerEvidenceRefs: refs.answer, updatedAt: at,
    };
    if (encodedBytes(candidate) > MAX_CANDIDATE_RECORD_BYTES) return { status: 'candidate_too_large' };
    root.candidates = { ...(root.candidates ?? {}), [candidateId]: candidate };
    return { status: checked.validation.valid ? 'staged' : 'invalid', candidateId, targetActivityId,
      revision: candidate.revision, lifecycle: candidate.lifecycle, validation: candidate.validation, diff: candidate.diff,
      evidenceRefs: candidate.evidenceRefs, sourceEvidenceRefs: candidate.sourceEvidenceRefs,
      answerEvidenceRefs: candidate.answerEvidenceRefs };
  });
  return { outcome: claimed.result, next: root, write: claimed.write };
};

const validate = (root: BookActivityAuthoringRoot, ownerId: string, body: unknown, at: number) => {
  const input = exact(body, [
    'operationId', 'expectedRevision', 'candidateId', 'evidenceRefs',
    'sourceEvidenceRefs', 'answerEvidenceRefs',
  ]);
  const operationId = operation(input); const candidateId = validId(input.candidateId, 'candidate_id');
  const expectedRevision = validRevision(input.expectedRevision); const refs = evidenceRefGroups(input);
  prune(root, at);
  const fingerprint = stable({ action: 'validate', candidateId, expectedRevision, evidenceRefs: refs ?? null });
  const claimed = operationResult(root, ownerId, operationId, fingerprint, at, () => {
    const candidate = asCandidate(root.candidates?.[candidateId], candidateId);
    if (!candidate || candidate.ownerId !== ownerId) return { status: 'not-found' };
    if (candidate.lifecycle === 'discarded') return { status: 'discarded', candidateId, revision: candidate.revision, lifecycle: candidate.lifecycle };
    if (candidate.revision !== expectedRevision) return { status: 'conflict', currentRevision: candidate.revision };
    const activity = asActivity(
      root.activities?.[candidate.targetActivityId],
      candidate.targetActivityId,
    );
    if (activity && activity.ownerId !== ownerId) return { status: 'not-found' };
    const checked = validateContent(candidate.content, activity?.draft);
    const next: CandidateRecord = { ...candidate, revision: candidate.revision + 1,
      lifecycle: checked.validation.valid ? 'validated' : 'rejected', validation: checked.validation,
      diff: checked.diff, evidenceRefs: input.evidenceRefs === undefined ? candidate.evidenceRefs : refs.legacy,
      sourceEvidenceRefs: input.sourceEvidenceRefs === undefined ? candidate.sourceEvidenceRefs : refs.source,
      answerEvidenceRefs: input.answerEvidenceRefs === undefined ? candidate.answerEvidenceRefs : refs.answer,
      updatedAt: at };
    root.candidates = { ...(root.candidates ?? {}), [candidateId]: next };
    return { status: checked.validation.valid ? 'validated' : 'invalid', candidateId, revision: next.revision,
      lifecycle: next.lifecycle, validation: next.validation, diff: next.diff, evidenceRefs: next.evidenceRefs,
      sourceEvidenceRefs: next.sourceEvidenceRefs, answerEvidenceRefs: next.answerEvidenceRefs };
  });
  return { outcome: claimed.result, next: root, write: claimed.write };
};

const saveDraft = (
  root: BookActivityAuthoringRoot,
  ownerId: string,
  body: unknown,
  at: number,
  trustedBookId: string,
) => {
  const input = exact(body, [
    'operationId', 'expectedRevision', 'candidateId', 'evidenceRefs',
    'sourceEvidenceRefs', 'answerEvidenceRefs', 'unitActivityBinding',
  ]);
  const operationId = operation(input); const candidateId = validId(input.candidateId, 'candidate_id');
  const expectedRevision = validRevision(input.expectedRevision); const refs = evidenceRefGroups(input);
  prune(root, at);
  const binding = unitActivityBinding(input);
  const fingerprint = stable({ action: 'save-draft', candidateId, expectedRevision, evidenceRefs: refs ?? null, unitActivityBinding: binding ?? null });
  const claimed = operationResult(root, ownerId, operationId, fingerprint, at, () => {
    const candidate = asCandidate(root.candidates?.[candidateId], candidateId);
    if (!candidate || candidate.ownerId !== ownerId) return { status: 'not-found' };
    if (candidate.lifecycle === 'discarded') return { status: 'discarded', candidateId, revision: candidate.revision, lifecycle: candidate.lifecycle };
    if (candidate.revision !== expectedRevision) return { status: 'conflict', currentRevision: candidate.revision };
    const existing = asActivity(
      root.activities?.[candidate.targetActivityId],
      candidate.targetActivityId,
    );
    if (existing && existing.ownerId !== ownerId) return { status: 'not-found' };
    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== candidate.targetRevision) return { status: 'conflict', currentRevision };
    const checked = validateContent(candidate.content, existing?.draft);
    if (!checked.validation.valid || !checked.normalized) {
      const rejected: CandidateRecord = { ...candidate, revision: candidate.revision + 1, lifecycle: 'rejected',
        validation: checked.validation, diff: checked.diff,
        evidenceRefs: input.evidenceRefs === undefined ? candidate.evidenceRefs : refs.legacy,
        sourceEvidenceRefs: input.sourceEvidenceRefs === undefined ? candidate.sourceEvidenceRefs : refs.source,
        answerEvidenceRefs: input.answerEvidenceRefs === undefined ? candidate.answerEvidenceRefs : refs.answer,
        updatedAt: at };
      root.candidates = { ...(root.candidates ?? {}), [candidateId]: rejected };
      return { status: 'invalid', candidateId, revision: rejected.revision, validation: rejected.validation, diff: rejected.diff };
    }
    const revision = currentRevision + 1;
    const activity: ActivityRecord = {
      activityId: candidate.targetActivityId,
      ownerId,
      revision,
      lifecycle: 'draft',
      editableDraft: clone(candidate.content),
      draft: checked.normalized,
      updatedAt: at,
    };
    const saved: CandidateRecord = { ...candidate, revision: candidate.revision + 1, lifecycle: 'saved',
      validation: checked.validation, diff: checked.diff,
      evidenceRefs: input.evidenceRefs === undefined ? candidate.evidenceRefs : refs.legacy,
      sourceEvidenceRefs: input.sourceEvidenceRefs === undefined ? candidate.sourceEvidenceRefs : refs.source,
      answerEvidenceRefs: input.answerEvidenceRefs === undefined ? candidate.answerEvidenceRefs : refs.answer,
      updatedAt: at };
    root.activities = { ...(root.activities ?? {}), [activity.activityId]: activity };
    root.candidates = { ...(root.candidates ?? {}), [candidateId]: saved };
    const receipt: BindingReceipt | undefined = binding ? {
      schemaVersion: 1,
      ownerId,
      bookId: trustedBookId,
      unitKey: binding.unitKey,
      activityKey: binding.activityKey,
      activityId: activity.activityId,
      candidateId,
      candidateRevision: saved.revision,
      candidateLifecycle: 'saved',
      phase: 'binding-pending',
    } : undefined;
    return { status: 'saved', activityId: activity.activityId, revision, candidateId, candidateRevision: saved.revision,
      lifecycle: saved.lifecycle, validation: saved.validation, diff: saved.diff, evidenceRefs: saved.evidenceRefs,
      sourceEvidenceRefs: saved.sourceEvidenceRefs, answerEvidenceRefs: saved.answerEvidenceRefs,
      ...(receipt ? { binding: receipt } : {}) };
  });
  return { outcome: claimed.result, next: root, write: claimed.write };
};

const discard = (root: BookActivityAuthoringRoot, ownerId: string, body: unknown, at: number) => {
  const input = exact(body, ['operationId', 'expectedRevision', 'candidateId']);
  const operationId = operation(input); const candidateId = validId(input.candidateId, 'candidate_id');
  const expectedRevision = validRevision(input.expectedRevision);
  prune(root, at);
  const fingerprint = stable({ action: 'discard', candidateId, expectedRevision });
  const claimed = operationResult(root, ownerId, operationId, fingerprint, at, () => {
    const candidate = asCandidate(root.candidates?.[candidateId], candidateId);
    if (!candidate || candidate.ownerId !== ownerId) return { status: 'not-found' };
    if (candidate.revision !== expectedRevision) return { status: 'conflict', currentRevision: candidate.revision };
    if (candidate.lifecycle === 'discarded') return { status: 'discarded', candidateId, revision: candidate.revision, lifecycle: candidate.lifecycle };
    const activity = asActivity(root.activities?.[candidate.targetActivityId], candidate.targetActivityId);
    if (activity && activity.ownerId !== ownerId) return { status: 'not-found' };
    const checked = validateContent(candidate.content, activity?.draft);
    if (!checked.validation.valid) throw new AuthoringError('invalid_persisted_candidate', 500);
    const tombstone: CandidateRecord = {
      ...candidate, revision: candidate.revision + 1, lifecycle: 'discarded', content: null,
      updatedAt: at,
    };
    root.candidates = { ...(root.candidates ?? {}), [candidateId]: tombstone };
    return { status: 'discarded', candidateId, revision: tombstone.revision, lifecycle: tombstone.lifecycle };
  });
  return { outcome: claimed.result, next: root, write: claimed.write };
};
