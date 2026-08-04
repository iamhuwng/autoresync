import type { ActivityDiff, StudentActivityProjection } from '../../../../src/types/bookActivity.types.ts';
import {
  BOOK_ACTIVITY_EVIDENCE_REF_PATTERN,
  BOOK_ACTIVITY_MAX_EVIDENCE_REFS,
} from '../../../../src/services/book-activity/activityCandidate.service.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_IMPACT_BYTES = 16 * 1024;
const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const VERSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FINGERPRINT_ID = /^fnv1a64:[0-9a-f]{16}$/u;
const SENSITIVE_RESPONSE_KEYS = new Set([
  'acceptedAnswers',
  'acceptedOptionIndexes',
  'acceptedOrder',
  'acceptedPairs',
  'answerKey',
  'answers',
  'content',
  'editableDraft',
  'normalized',
  'replacementContent',
  'rubric',
  'teacherNotes',
  'sourceProvenance',
  'privateObjectKey',
  'providerAuthority',
  'credentials',
]);

export interface BookActivityRevisionWorkerEnv {
  readonly BOOK_ACTIVITY_REVISION_ENABLED?: string;
}

export interface ActivityRevisionSourceContext {
  readonly [key: string]: unknown;
}

export interface TrustedActivityRevisionCommand {
  readonly actorId: string;
  readonly operationId: string;
  readonly activityId: string;
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
  readonly expectedCurrentActivityVersionId: string;
  readonly expectedCurrentActivityVersion: number;
  /** Opaque expected context. Service must compare it to current Book-owned context exactly. */
  readonly expectedSourceContext: ActivityRevisionSourceContext | null;
  /** Complete editable Activity replacement. Identity/provenance stay outside this value. */
  readonly replacementContent: Record<string, unknown>;
  readonly evidenceRefs: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
  readonly answerEvidenceRefs: readonly string[];
  readonly previewApproval: {
    readonly approvalId: string;
    readonly approvedAt: string;
    readonly expiresAt: string;
  };
}

export interface ActivityRevisionImpact {
  readonly [key: string]: unknown;
}

export interface TrustedActivityRevisionSuccess {
  readonly status: 'revised' | 'replayed';
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly predecessorActivityVersionId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly placementIds: readonly string[];
  readonly diff: ActivityDiff;
  readonly projection: StudentActivityProjection;
  readonly impact?: ActivityRevisionImpact;
}

export type TrustedActivityRevisionResult =
  | TrustedActivityRevisionSuccess
  | { readonly status: 'conflict' | 'idempotency-conflict' | 'invalid' | 'not-found' | 'forbidden'; readonly failureCode: string; readonly errors?: readonly unknown[] }
  | { readonly status: 'malformed'; readonly failureCode?: string };

/**
 * Storage and Book/Activity authority stay behind this port. Implementation must:
 * authenticate actor ownership, re-read candidate/version/Placement/source context,
 * compare every expected value, then perform one CAS/idempotent commit.
 */
export interface TrustedActivityRevisionService {
  revalidateAndCommit(command: TrustedActivityRevisionCommand): Promise<TrustedActivityRevisionResult>;
}

export class ActivityRevisionWorkerError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = 'ActivityRevisionWorkerError';
  }
}

interface RevisionRequest {
  activityId: string;
  candidateId: string;
  expectedCandidateRevision: number;
  expectedCurrentActivityVersionId: string;
  expectedCurrentActivityVersion: number;
  expectedSourceContext: ActivityRevisionSourceContext | null;
  replacementContent: Record<string, unknown>;
  evidenceRefs: string[];
  sourceEvidenceRefs: string[];
  answerEvidenceRefs: string[];
  previewApproval: {
    approvalId: string;
    approvedAt: string;
    expiresAt: string;
  };
  operationId: string;
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const clone = <T>(value: T): T => structuredClone(value);

const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const exactRecord = (value: unknown, keys: readonly string[], code: string): Record<string, unknown> => {
  const parsed = record(value);
  if (!parsed || Object.keys(parsed).some((key) => !keys.includes(key))) {
    throw new ActivityRevisionWorkerError(code);
  }
  return parsed;
};

const id = (value: unknown, code: string, pattern = ID): string => {
  if (typeof value !== 'string' || !pattern.test(value)) throw new ActivityRevisionWorkerError(code);
  return value;
};

const revision = (value: unknown, code: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ActivityRevisionWorkerError(code);
  }
  return value as number;
};

const evidenceRefs = (value: unknown, code: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)
    || value.length > BOOK_ACTIVITY_MAX_EVIDENCE_REFS
    || value.some((entry) => typeof entry !== 'string' || !BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(entry))
    || new Set(value).size !== value.length) {
    throw new ActivityRevisionWorkerError(code);
  }
  return [...value];
};

const previewApproval = (value: unknown): RevisionRequest['previewApproval'] => {
  const parsed = exactRecord(value, ['approvalId', 'approvedAt', 'expiresAt'], 'invalid_preview_approval');
  const approvalId = id(parsed.approvalId, 'invalid_preview_approval', FINGERPRINT_ID);
  const approvedAt = id(parsed.approvedAt, 'invalid_preview_approval', /^[0-9T:.Z+-]{20,40}$/u);
  const expiresAt = id(parsed.expiresAt, 'invalid_preview_approval', /^[0-9T:.Z+-]{20,40}$/u);
  const approvedAtMs = Date.parse(approvedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(approvedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= approvedAtMs) {
    throw new ActivityRevisionWorkerError('invalid_preview_approval');
  }
  return { approvalId, approvedAt, expiresAt };
};

const readBody = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ActivityRevisionWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new ActivityRevisionWorkerError('body_too_large', 413);
  }
  if (!request.body) throw new ActivityRevisionWorkerError('malformed_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY_BYTES) throw new ActivityRevisionWorkerError('body_too_large', 413);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ActivityRevisionWorkerError('malformed_json');
  }
};

const parseRequest = (body: unknown, request: Request): RevisionRequest => {
  const parsed = exactRecord(body, [
    'activityId',
    'candidateId',
    'expectedCandidateRevision',
    'expectedDraftRevision',
    'expectedCurrentActivityVersionId',
    'expectedCurrentActivityVersion',
    'expectedSourceContext',
    'replacementContent',
    'evidenceRefs',
    'sourceEvidenceRefs',
    'answerEvidenceRefs',
    'previewApproval',
    'operationId',
  ], 'invalid_request');
  const bodyOperationId = parsed.operationId;
  const headerOperationId = request.headers.get('Idempotency-Key') ?? undefined;
  if (bodyOperationId !== undefined && headerOperationId !== undefined && bodyOperationId !== headerOperationId) {
    throw new ActivityRevisionWorkerError('operation_id_mismatch');
  }
  const operationId = id(bodyOperationId ?? headerOperationId, 'invalid_operation_id', OPERATION_ID);
  const expectedCandidateRevision = parsed.expectedCandidateRevision === undefined
    ? parsed.expectedDraftRevision
    : parsed.expectedCandidateRevision;
  if (parsed.expectedCandidateRevision !== undefined && parsed.expectedDraftRevision !== undefined
    && parsed.expectedCandidateRevision !== parsed.expectedDraftRevision) {
    throw new ActivityRevisionWorkerError('revision_precondition_mismatch');
  }
  const expectedSourceContext = parsed.expectedSourceContext === null || parsed.expectedSourceContext === undefined
    ? null
    : exactRecord(parsed.expectedSourceContext, Object.keys(record(parsed.expectedSourceContext) ?? {}), 'invalid_source_context');
  const replacementContent = exactRecord(parsed.replacementContent, [
    'schemaVersion',
    'title',
    'taskProfile',
    'presentationMode',
    'contextRequirement',
    'instructions',
    'interaction',
    'answerRule',
    'stimulus',
    'assetRefs',
    'interactions',
    'scoring',
  ], 'invalid_replacement_content');
  if (jsonBytes(replacementContent) > MAX_BODY_BYTES) throw new ActivityRevisionWorkerError('replacement_too_large', 413);
  return {
    activityId: id(parsed.activityId, 'invalid_activity_id'),
    candidateId: id(parsed.candidateId, 'invalid_candidate_id'),
    expectedCandidateRevision: revision(expectedCandidateRevision, 'invalid_candidate_revision'),
    expectedCurrentActivityVersionId: id(parsed.expectedCurrentActivityVersionId, 'invalid_current_version_id', VERSION_ID),
    expectedCurrentActivityVersion: revision(parsed.expectedCurrentActivityVersion, 'invalid_current_version', 1),
    expectedSourceContext: expectedSourceContext ? clone(expectedSourceContext) : null,
    replacementContent: clone(replacementContent),
    evidenceRefs: evidenceRefs(parsed.evidenceRefs, 'invalid_evidence_refs'),
    sourceEvidenceRefs: evidenceRefs(parsed.sourceEvidenceRefs, 'invalid_source_evidence_refs'),
    answerEvidenceRefs: evidenceRefs(parsed.answerEvidenceRefs, 'invalid_answer_evidence_refs'),
    previewApproval: previewApproval(parsed.previewApproval),
    operationId,
  };
};

const hasSensitiveResponseKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveResponseKey);
  const parsed = record(value);
  return !!parsed && Object.entries(parsed).some(([key, child]) =>
    SENSITIVE_RESPONSE_KEYS.has(key) || hasSensitiveResponseKey(child));
};

const safeDiff = (value: unknown): ActivityDiff => {
  const parsed = exactRecord(value, ['classification', 'reasons', 'requiresRedo'], 'malformed_service_response');
  if (!['unchanged', 'display-only', 'regrade', 'redo-required', 'added', 'removed', 'reordered', 'presentation-context', 'unsupported'].includes(String(parsed.classification))
    || !Array.isArray(parsed.reasons)
    || parsed.reasons.some((reason) => typeof reason !== 'string' || reason.length > 160)
    || typeof parsed.requiresRedo !== 'boolean') {
    throw new ActivityRevisionWorkerError('malformed_service_response', 502);
  }
  return clone(parsed) as ActivityDiff;
};

const safeSuccess = (value: TrustedActivityRevisionSuccess): Record<string, unknown> => {
  if (hasSensitiveResponseKey(value) || jsonBytes(value) > MAX_RESPONSE_BYTES) {
    throw new ActivityRevisionWorkerError('malformed_service_response', 502);
  }
  const projection = record(value.projection);
  if (!projection || jsonBytes(projection) > MAX_RESPONSE_BYTES) {
    throw new ActivityRevisionWorkerError('malformed_service_response', 502);
  }
  const activityVersion = revision(value.activityVersion, 'malformed_service_response', 1);
  const candidateRevision = revision(value.candidateRevision, 'malformed_service_response');
  const placementIds = value.placementIds;
  if (value.status !== 'revised' && value.status !== 'replayed'
    || !ID.test(value.activityId)
    || !VERSION_ID.test(value.activityVersionId)
    || !VERSION_ID.test(value.predecessorActivityVersionId)
    || !ID.test(value.candidateId)
    || !Array.isArray(placementIds)
    || placementIds.some((placementId) => typeof placementId !== 'string' || !ID.test(placementId))
    || !value.diff) {
    throw new ActivityRevisionWorkerError('malformed_service_response', 502);
  }
  const output: Record<string, unknown> = {
    status: value.status,
    activityId: value.activityId,
    activityVersionId: value.activityVersionId,
    activityVersion,
    predecessorActivityVersionId: value.predecessorActivityVersionId,
    candidateId: value.candidateId,
    candidateRevision,
    placementIds: [...placementIds],
    diff: safeDiff(value.diff),
    projection: clone(projection),
  };
  if (value.impact !== undefined) {
    if (!record(value.impact) || jsonBytes(value.impact) > MAX_IMPACT_BYTES || hasSensitiveResponseKey(value.impact)) {
      throw new ActivityRevisionWorkerError('malformed_service_response', 502);
    }
    output.impact = clone(value.impact);
  }
  return output;
};

const statusForResult = (status: TrustedActivityRevisionResult['status']): number => {
  if (status === 'conflict' || status === 'idempotency-conflict') return 409;
  if (status === 'not-found') return 404;
  if (status === 'forbidden') return 403;
  if (status === 'invalid') return 422;
  if (status === 'malformed') return 502;
  return 200;
};

export const createBookActivityRevisionWorkerHandlers = (options: {
  readonly revisionService?: TrustedActivityRevisionService;
  readonly revisionServiceForEnv?: (
    env: BookActivityRevisionWorkerEnv,
  ) => TrustedActivityRevisionService;
  /** Canonical route must inject verified-token/owner authorization. */
  readonly authenticate?: (uid: string, env: BookActivityRevisionWorkerEnv) => Promise<void>;
}) => ({
  async publish(input: {
    readonly request: Request;
    readonly env: BookActivityRevisionWorkerEnv;
    readonly uid: string;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> {
    try {
      if (input.env.BOOK_ACTIVITY_REVISION_ENABLED !== 'true') {
        throw new ActivityRevisionWorkerError('activity_revision_disabled', 503);
      }
      if (typeof input.uid !== 'string' || input.uid.length === 0 || !ID.test(input.uid)) {
        throw new ActivityRevisionWorkerError('revision_unauthenticated', 401);
      }
      if (!options.authenticate) throw new ActivityRevisionWorkerError('revision_auth_unconfigured', 503);
      await options.authenticate(input.uid, input.env);
      const request = parseRequest(await readBody(input.request), input.request);
      const revisionService = options.revisionService
        ?? options.revisionServiceForEnv?.(input.env);
      if (!revisionService) {
        throw new ActivityRevisionWorkerError('revision_repository_unconfigured', 503);
      }
      const result = await revisionService.revalidateAndCommit({
        actorId: input.uid,
        ...request,
      });
      if (result.status === 'revised' || result.status === 'replayed') {
        const output = safeSuccess(result);
        return { body: output, init: { status: 200 } };
      }
      if (result.status === 'malformed') {
        return { body: { code: result.failureCode ?? 'malformed_service_response' }, init: { status: 502 } };
      }
      return {
        body: {
          status: result.status,
          ...(result.failureCode ? { failureCode: result.failureCode } : {}),
          ...(result.errors === undefined ? {} : { errors: clone(result.errors) }),
        },
        init: { status: statusForResult(result.status) },
      };
    } catch (error) {
      if (error instanceof ActivityRevisionWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'activity_revision_failed' }, init: { status: 500 } };
    }
  },
});
