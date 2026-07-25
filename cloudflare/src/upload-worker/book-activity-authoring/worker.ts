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
    options?: { beforeWrite?: () => Promise<void> },
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
  if (body.status === 'idempotency-conflict' || body.status === 'conflict' || body.status === 'id-collision' || body.status === 'capacity-exceeded') return 409;
  if (body.status === 'not-found') return 404;
  if (body.status === 'invalid') return 422;
  return 200;
};

export const createBookActivityAuthoringWorkerHandlers = (options: {
  repository?: BookActivityAuthoringRepositoryPort;
  now?: () => number;
  createRecordId?: () => string;
  /** Test-only trusted adapter; production reads deployment-owned input.env. */
  rolloutGate?: BookRolloutWorkerGate;
} = {}) => {
  const now = options.now ?? nowDefault;
  const createRecordId = options.createRecordId ?? (() => crypto.randomUUID());
  const repositoryFor = (env: BookActivityAuthoringRepositoryEnv): BookActivityAuthoringRepositoryPort => (
    options.repository ?? new FirebaseRestBookActivityAuthoringRepository({ env })
  );
  const authenticate = async (uid: string, repository: BookActivityAuthoringRepositoryPort): Promise<void> => {
    if (!role(await repository.readValue(`users/${uid}`))) throw new AuthoringError('authoring_forbidden', 403);
  };
  const respond = async (mutation: Mutation, input: { request: Request; env: BookActivityAuthoringRepositoryEnv; uid: string }) => {
    try {
      const rolloutGate = createBookRolloutTrustedSeamGate(
        options.rolloutGate ?? createBookRolloutWorkerGate(input.env),
      );
      // Fail fast, then recheck immediately before every CAS write attempt.
      rolloutGate.homeworkMutation();
      const repository = repositoryFor(input.env);
      const body = await readBody(input.request);
      // Check identity after potentially slow untrusted-body parsing, immediately before CAS mutation.
      await authenticate(input.uid, repository);
      const output = await repository.transaction(input.uid, (root) => {
        assertPersistedRoot(root, input.uid);
        if (mutation === 'stage') return stage(root, input.uid, body, now(), createRecordId);
        if (mutation === 'validate') return validate(root, input.uid, body, now());
        if (mutation === 'save-draft') return saveDraft(root, input.uid, body, now());
        return discard(root, input.uid, body, now());
      }, {
        beforeWrite: async () => {
          rolloutGate.homeworkMutation();
          await authenticate(input.uid, repository);
        },
      });
      return { body: output, init: { status: httpStatus(output) } };
    } catch (error) {
      if (error instanceof BookRolloutDeniedError) {
        return {
          body: { code: error.code, decision: error.authorization.decision },
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
) => {
  const input = exact(body, [
    'operationId', 'expectedRevision', 'targetActivityId', 'content', 'evidenceRefs',
    'sourceEvidenceRefs', 'answerEvidenceRefs',
  ]);
  const operationId = operation(input); const expectedRevision = validRevision(input.expectedRevision);
  const requestedTargetActivityId = input.targetActivityId === undefined ? undefined : validId(input.targetActivityId, 'activity_id');
  const refs = evidenceRefGroups(input);
  prune(root, at);
  const fingerprint = stable({ action: 'stage', expectedRevision, targetActivityId: requestedTargetActivityId ?? null, content: input.content, evidenceRefs: refs });
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

const saveDraft = (root: BookActivityAuthoringRoot, ownerId: string, body: unknown, at: number) => {
  const input = exact(body, [
    'operationId', 'expectedRevision', 'candidateId', 'evidenceRefs',
    'sourceEvidenceRefs', 'answerEvidenceRefs',
  ]);
  const operationId = operation(input); const candidateId = validId(input.candidateId, 'candidate_id');
  const expectedRevision = validRevision(input.expectedRevision); const refs = evidenceRefGroups(input);
  prune(root, at);
  const fingerprint = stable({ action: 'save-draft', candidateId, expectedRevision, evidenceRefs: refs ?? null });
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
    return { status: 'saved', activityId: activity.activityId, revision, candidateId, candidateRevision: saved.revision,
      lifecycle: saved.lifecycle, validation: saved.validation, diff: saved.diff, evidenceRefs: saved.evidenceRefs,
      sourceEvidenceRefs: saved.sourceEvidenceRefs, answerEvidenceRefs: saved.answerEvidenceRefs };
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
