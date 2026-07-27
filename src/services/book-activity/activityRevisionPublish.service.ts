import type {
  ActivityDiff,
  ActivityIdProvider,
  ActivityValidationContext,
  EditableActivity,
  NormalizedActivity,
  StudentActivityProjection,
} from '../../types/bookActivity.types';
import {
  BOOK_ACTIVITY_EVIDENCE_REF_PATTERN,
  BOOK_ACTIVITY_MAX_EVIDENCE_REFS,
} from './activityCandidate.service';
import { cryptoActivityIdProvider, normalizeActivity } from './activityCanonical.service';
import { diffActivities } from './activityDiff.service';
import { projectStudentActivity } from './activityProjection.service';
import { validateEditableActivity } from './activitySchema.service';
export { buildActivityRevisionPrompt } from '../book-assembly/unitPrompt.service';

const ID = /^[A-Za-z0-9_-]{1,160}$/u;
const VERSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const FINGERPRINT_ID = /^fnv1a64:[0-9a-f]{16}$/u;
const MAX_CONTEXT_BYTES = 16 * 1024;
const MAX_CANDIDATE_BYTES = 256 * 1024;

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprint = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of stable(value)) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

const validId = (value: unknown, pattern = ID): value is string => (
  typeof value === 'string' && pattern.test(value)
);

const validRevision = (value: unknown, minimum = 0): value is number => (
  Number.isSafeInteger(value) && (value as number) >= minimum
);

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export interface ActivityRevisionSourceContext {
  readonly fingerprint: string;
  readonly sourceVersionId?: string;
  readonly pageGroupId?: string;
  readonly mappedBookPageRefs?: readonly string[];
  readonly [key: string]: unknown;
}

export interface ActivityRevisionCurrentPointer {
  readonly activityId: string;
  readonly versionId: string;
  readonly version: number;
  readonly contextFingerprint: string | null;
}

export interface ActivityRevisionVersionRecord {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly versionId: string;
  readonly version: number;
  readonly ownerId: string;
  readonly editable: EditableActivity;
  readonly activity: NormalizedActivity;
  readonly projection: StudentActivityProjection;
  readonly semanticImpact: ActivityDiff;
  readonly sourceContextFingerprint: string | null;
  readonly predecessorVersionId?: string;
  readonly placementIds?: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
  readonly answerEvidenceRefs: readonly string[];
  readonly createdByOperationId: string;
  readonly createdAt: string;
}

export interface ActivityRevisionOperationRecord {
  readonly ownerId: string;
  readonly fingerprint: string;
  readonly result: ActivityRevisionPublishResult;
  readonly createdAt: string;
}

export interface ActivityRevisionScope {
  readonly current?: ActivityRevisionCurrentPointer;
  readonly currentContext?: ActivityRevisionSourceContext | null;
  readonly versions: Record<string, ActivityRevisionVersionRecord>;
  readonly candidates?: Record<string, unknown>;
  readonly operations?: Record<string, ActivityRevisionOperationRecord>;
}

export interface ActivityRevisionRepository {
  readScope(): Promise<ActivityRevisionScope>;
  transaction<T>(
    activityId: string,
    mutate: (scope: ActivityRevisionScope) => {
      outcome: T;
      next?: ActivityRevisionScope;
      write: boolean;
    },
  ): Promise<T>;
}

export interface ActivityRevisionIdentityOptions {
  readonly idProvider?: ActivityIdProvider;
  readonly versionIdProvider?: ActivityIdProvider;
  readonly validationContext?: ActivityValidationContext;
}

export interface ActivityRevisionCandidate {
  readonly activityId: string;
  readonly ownerId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly expectedCurrentVersionId: string;
  readonly expectedCurrentVersion: number;
  readonly expectedContextFingerprint: string | null;
  readonly sourceContext: ActivityRevisionSourceContext | null;
  readonly normalized: NormalizedActivity;
  readonly editable: EditableActivity;
  readonly projection: StudentActivityProjection;
  readonly semanticImpact: ActivityDiff;
  readonly fingerprint: string;
  readonly placementIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
  readonly answerEvidenceRefs: readonly string[];
}

export type ActivityRevisionPreviewResult =
  | { readonly status: 'ready'; readonly candidate: ActivityRevisionCandidate }
  | { readonly status: 'conflict' | 'invalid' | 'forbidden' | 'not-found'; readonly failureCode: string; readonly errors?: readonly string[] };

export interface ActivityRevisionPreviewInput {
  readonly activityId: string;
  readonly ownerId: string;
  readonly candidateId?: string;
  readonly candidateRevision?: number;
  readonly expectedCurrentVersionId: string;
  readonly expectedCurrentVersion?: number;
  readonly expectedContextFingerprint: string | null;
  readonly sourceContext?: ActivityRevisionSourceContext | null;
  readonly placementIds?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly sourceEvidenceRefs?: readonly string[];
  readonly answerEvidenceRefs?: readonly string[];
  readonly replacement: unknown;
}

export interface ActivityRevisionPublishInput {
  readonly operationId: string;
  readonly ownerId: string;
  readonly candidate: ActivityRevisionCandidate;
  readonly previewApproval: {
    readonly approvalId: string;
    readonly approvedAt: string;
    readonly expiresAt: string;
  };
  readonly now?: string;
}

export type ActivityRevisionPublishResult =
  | {
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
      readonly impact: {
        readonly classification: ActivityDiff['classification'];
        readonly affectedInteractionIds: readonly string[];
      };
    }
  | { readonly status: 'conflict' | 'idempotency-conflict' | 'invalid' | 'forbidden' | 'not-found' | 'rolled-back'; readonly failureCode: string };

export interface ActivityRevisionRollbackInput {
  readonly operationId: string;
  readonly ownerId: string;
  readonly activityId: string;
  readonly expectedCurrentVersionId: string;
  readonly targetVersionId: string;
  readonly now?: string;
}

export interface ActivityRevisionPublishService {
  preview(input: ActivityRevisionPreviewInput): Promise<ActivityRevisionPreviewResult>;
  loadCandidate(candidateId: string): Promise<ActivityRevisionCandidate | null>;
  publish(input: ActivityRevisionPublishInput): Promise<ActivityRevisionPublishResult>;
  rollback(input: ActivityRevisionRollbackInput): Promise<ActivityRevisionPublishResult>;
}

/**
 * 12B exact-preservation boundary: only an exact canonical topology preserves
 * hidden identities. Any count, order, prompt/item, variant, rule, or shape
 * change remints the affected Activity identities; no fuzzy matching.
 */
const normalizeWithLineage = (
  value: EditableActivity,
  previous: NormalizedActivity,
  idProvider: ActivityIdProvider,
  validationContext: ActivityValidationContext,
): NormalizedActivity => normalizeActivity(value, idProvider, previous, validationContext);

const currentVersion = (scope: ActivityRevisionScope): ActivityRevisionVersionRecord | undefined => (
  scope.current ? scope.versions[scope.current.versionId] : undefined
);

const validContext = (value: ActivityRevisionSourceContext | null | undefined): boolean => (
  value === null || value === undefined || bytes(value) <= MAX_CONTEXT_BYTES
);

const validEvidenceRefs = (value: unknown): value is readonly string[] => (
  Array.isArray(value)
  && value.length <= BOOK_ACTIVITY_MAX_EVIDENCE_REFS
  && value.every((entry) => typeof entry === 'string' && BOOK_ACTIVITY_EVIDENCE_REF_PATTERN.test(entry))
  && new Set(value).size === value.length
);

const evidenceRefs = (value: readonly string[] | undefined): readonly string[] => (
  value === undefined ? [] : [...value]
);

const currentContextFingerprint = (scope: ActivityRevisionScope): string | null => (
  scope.currentContext?.fingerprint ?? null
);

const candidateRecord = (scope: ActivityRevisionScope, candidateId: string): ActivityRevisionCandidate | null => {
  const candidate = scope.candidates?.[candidateId];
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ActivityRevisionCandidate;
};

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const candidateFingerprint = (
  candidate: Omit<ActivityRevisionCandidate, 'fingerprint'>,
): string => fingerprint({
  activityId: candidate.activityId,
  ownerId: candidate.ownerId,
  candidateId: candidate.candidateId,
  candidateRevision: candidate.candidateRevision,
  expectedCurrentVersionId: candidate.expectedCurrentVersionId,
  expectedCurrentVersion: candidate.expectedCurrentVersion,
  expectedContextFingerprint: candidate.expectedContextFingerprint,
  sourceContext: candidate.sourceContext,
  editable: candidate.editable,
  normalized: candidate.normalized,
  placementIds: candidate.placementIds,
  evidenceRefs: candidate.evidenceRefs,
  sourceEvidenceRefs: candidate.sourceEvidenceRefs,
  answerEvidenceRefs: candidate.answerEvidenceRefs,
});

const invalid = (failureCode: string, errors?: readonly string[]): ActivityRevisionPreviewResult => ({
  status: 'invalid',
  failureCode,
  ...(errors ? { errors } : {}),
});

export const createActivityRevisionPublishService = (
  repository: ActivityRevisionRepository,
  options: ActivityRevisionIdentityOptions = {},
): ActivityRevisionPublishService => {
  const idProvider = options.idProvider ?? cryptoActivityIdProvider;
  const versionIdProvider = options.versionIdProvider ?? cryptoActivityIdProvider;
  const validationContext = options.validationContext ?? {};

  const preview = async (input: ActivityRevisionPreviewInput): Promise<ActivityRevisionPreviewResult> => {
    if (!validId(input.activityId) || !validId(input.ownerId) || !validId(input.expectedCurrentVersionId, VERSION_ID)) return invalid('invalid-precondition');
    if (input.expectedCurrentVersion !== undefined && !validRevision(input.expectedCurrentVersion, 1)) return invalid('invalid-precondition');
    if (!validContext(input.sourceContext) || input.expectedContextFingerprint !== null && !validId(input.expectedContextFingerprint, VERSION_ID)) return invalid('invalid-context');
    if (input.candidateId !== undefined && !validId(input.candidateId)) return invalid('invalid-candidate');
    if (input.candidateRevision !== undefined && !validRevision(input.candidateRevision)) return invalid('invalid-candidate');
    if (input.evidenceRefs !== undefined && !validEvidenceRefs(input.evidenceRefs)) return invalid('invalid-evidence-refs');
    if (input.sourceEvidenceRefs !== undefined && !validEvidenceRefs(input.sourceEvidenceRefs)) return invalid('invalid-source-evidence-refs');
    if (input.answerEvidenceRefs !== undefined && !validEvidenceRefs(input.answerEvidenceRefs)) return invalid('invalid-answer-evidence-refs');
    if (bytes(input.replacement) > MAX_CANDIDATE_BYTES) return invalid('replacement-too-large');

    const scope = await repository.readScope();
    const pointer = scope.current;
    const current = currentVersion(scope);
    if (!pointer || !current) return { status: 'not-found', failureCode: 'current-version-not-found' };
    if (pointer.activityId !== input.activityId || current.activityId !== input.activityId || current.ownerId !== input.ownerId) {
      return { status: 'forbidden', failureCode: 'activity-owner-mismatch' };
    }
    if (pointer.versionId !== input.expectedCurrentVersionId
      || (input.expectedCurrentVersion !== undefined && pointer.version !== input.expectedCurrentVersion)
      || pointer.contextFingerprint !== input.expectedContextFingerprint
      || currentContextFingerprint(scope) !== input.expectedContextFingerprint) {
      return { status: 'conflict', failureCode: 'stale-current-activity-version' };
    }
    const trustedSourceContext = scope.currentContext ?? null;
    const requestedSourceContext = input.sourceContext === undefined
      ? trustedSourceContext
      : input.sourceContext;
    if (stable(requestedSourceContext) !== stable(trustedSourceContext)) {
      return { status: 'conflict', failureCode: 'stale-source-context' };
    }
    const trustedPlacementIds = [...(current.placementIds ?? [])];
    if (input.placementIds !== undefined && !sameStringArray(input.placementIds, trustedPlacementIds)) {
      return { status: 'conflict', failureCode: 'placement-lineage-mismatch' };
    }

    const validated = validateEditableActivity(input.replacement, validationContext);
    if (!validated.valid) return invalid('invalid-replacement', validated.errors.map((error) => `${error.path}:${error.code}`));
    let normalized: NormalizedActivity;
    try {
      normalized = normalizeWithLineage(validated.value, current.activity, idProvider, validationContext);
    } catch (error) {
      return invalid('invalid-replacement', [error instanceof Error ? error.message : 'normalization-failed']);
    }
    const projection = projectStudentActivity(normalized);
    const semanticImpact = diffActivities(current.activity, normalized);
    const sourceContext = clone(requestedSourceContext);
    const candidateWithoutFingerprint: Omit<ActivityRevisionCandidate, 'fingerprint'> = {
      activityId: input.activityId,
      ownerId: input.ownerId,
      candidateId: input.candidateId ?? `revision-${input.activityId}`,
      candidateRevision: input.candidateRevision ?? 1,
      expectedCurrentVersionId: input.expectedCurrentVersionId,
      expectedCurrentVersion: pointer.version,
      expectedContextFingerprint: input.expectedContextFingerprint,
      sourceContext,
      editable: clone(validated.value),
      normalized,
      projection,
      semanticImpact,
      placementIds: trustedPlacementIds,
      evidenceRefs: evidenceRefs(input.evidenceRefs),
      sourceEvidenceRefs: evidenceRefs(input.sourceEvidenceRefs),
      answerEvidenceRefs: evidenceRefs(input.answerEvidenceRefs),
    };
    const candidate: ActivityRevisionCandidate = {
      ...candidateWithoutFingerprint,
      fingerprint: candidateFingerprint(candidateWithoutFingerprint),
    };
    return repository.transaction<ActivityRevisionPreviewResult>(input.activityId, (nextScope) => {
      const nextPointer = nextScope.current;
      const nextCurrent = currentVersion(nextScope);
      if (!nextPointer || !nextCurrent) {
        return { outcome: { status: 'not-found', failureCode: 'current-version-not-found' }, write: false };
      }
      if (nextPointer.versionId !== candidate.expectedCurrentVersionId
        || nextPointer.version !== candidate.expectedCurrentVersion
        || nextPointer.contextFingerprint !== candidate.expectedContextFingerprint
        || currentContextFingerprint(nextScope) !== candidate.expectedContextFingerprint
        || stable(nextScope.currentContext ?? null) !== stable(candidate.sourceContext)
        || !sameStringArray(
          nextCurrent.placementIds ?? [],
          candidate.placementIds,
        )) {
        return { outcome: { status: 'conflict', failureCode: 'stale-current-activity-version' }, write: false };
      }
      const previousCandidate = candidateRecord(nextScope, candidate.candidateId);
      if (previousCandidate && previousCandidate.ownerId !== input.ownerId) {
        return { outcome: { status: 'forbidden', failureCode: 'candidate-owner-mismatch' }, write: false };
      }
      if (previousCandidate
        && previousCandidate.fingerprint !== candidate.fingerprint
        && previousCandidate.candidateRevision >= candidate.candidateRevision) {
        return { outcome: { status: 'conflict', failureCode: 'stale-candidate-revision' }, write: false };
      }
      const outcome: ActivityRevisionPreviewResult = { status: 'ready', candidate: clone(candidate) };
      return {
        outcome,
        next: {
          ...nextScope,
          candidates: {
            ...(nextScope.candidates ?? {}),
            [candidate.candidateId]: clone(candidate),
          },
        },
        write: true,
      };
    });
  };

  const loadCandidate = async (candidateId: string): Promise<ActivityRevisionCandidate | null> => {
    if (!validId(candidateId)) return null;
    const scope = await repository.readScope();
    const candidate = candidateRecord(scope, candidateId);
    if (!candidate || candidateFingerprint(candidate) !== candidate.fingerprint) return null;
    return clone(candidate);
  };

  const publish = async (input: ActivityRevisionPublishInput): Promise<ActivityRevisionPublishResult> => {
    const now = input.now ?? new Date().toISOString();
    if (!validId(input.ownerId) || !validId(input.candidate.activityId) || !validId(input.operationId, OPERATION_ID)) return { status: 'invalid', failureCode: 'invalid-publish-input' };
    if (!validId(input.candidate.expectedCurrentVersionId, VERSION_ID) || !validRevision(input.candidate.expectedCurrentVersion, 1)) return { status: 'invalid', failureCode: 'invalid-publish-input' };
    if (!input.previewApproval
      || input.previewApproval.approvalId !== input.candidate.fingerprint
      || !validId(input.previewApproval.approvalId, FINGERPRINT_ID)
      || input.previewApproval.expiresAt <= now
      || input.previewApproval.approvedAt > now) return { status: 'invalid', failureCode: 'preview-approval-invalid' };
    return repository.transaction<ActivityRevisionPublishResult>(input.candidate.activityId, (scope) => {
      const previousOperation = scope.operations?.[input.operationId];
      if (previousOperation) {
        if (previousOperation.ownerId !== input.ownerId || previousOperation.fingerprint !== input.candidate.fingerprint) {
          return { outcome: { status: 'idempotency-conflict', failureCode: 'operation-reused-with-different-input' }, write: false };
        }
        const replayed = previousOperation.result.status === 'revised' || previousOperation.result.status === 'replayed'
          ? { ...previousOperation.result, status: 'replayed' as const }
          : previousOperation.result;
        return { outcome: replayed, write: false };
      }
      const pointer = scope.current;
      const previous = currentVersion(scope);
      if (!pointer || !previous) return { outcome: { status: 'not-found', failureCode: 'current-version-not-found' }, write: false };
      const storedCandidate = candidateRecord(scope, input.candidate.candidateId);
      if (!storedCandidate) return { outcome: { status: 'not-found', failureCode: 'candidate-not-found' }, write: false };
      if (storedCandidate.ownerId !== input.ownerId || storedCandidate.activityId !== input.candidate.activityId) {
        return { outcome: { status: 'forbidden', failureCode: 'candidate-owner-mismatch' }, write: false };
      }
      if (storedCandidate.fingerprint !== input.candidate.fingerprint) {
        return { outcome: { status: 'conflict', failureCode: 'candidate-reload-required' }, write: false };
      }
      if (candidateFingerprint(storedCandidate) !== storedCandidate.fingerprint) {
        return { outcome: { status: 'conflict', failureCode: 'candidate-integrity-failed' }, write: false };
      }
      if (pointer.activityId !== storedCandidate.activityId || previous.activityId !== storedCandidate.activityId || previous.ownerId !== input.ownerId) {
        return { outcome: { status: 'forbidden', failureCode: 'activity-owner-mismatch' }, write: false };
      }
      if (pointer.versionId !== storedCandidate.expectedCurrentVersionId
        || pointer.version !== storedCandidate.expectedCurrentVersion
        || pointer.contextFingerprint !== storedCandidate.expectedContextFingerprint
        || currentContextFingerprint(scope) !== storedCandidate.expectedContextFingerprint
        || stable(scope.currentContext ?? null) !== stable(storedCandidate.sourceContext)
        || !sameStringArray(previous.placementIds ?? [], storedCandidate.placementIds)) {
        return { outcome: { status: 'conflict', failureCode: 'stale-current-activity-version' }, write: false };
      }
      const versionId = versionIdProvider.createId();
      const nextVersion = previous.version + 1;
      const record: ActivityRevisionVersionRecord = {
        schemaVersion: 1,
        activityId: storedCandidate.activityId,
        versionId,
        version: nextVersion,
        ownerId: input.ownerId,
        editable: clone(storedCandidate.editable),
        activity: clone(storedCandidate.normalized),
        projection: clone(storedCandidate.projection),
        semanticImpact: clone(storedCandidate.semanticImpact),
        sourceContextFingerprint: storedCandidate.expectedContextFingerprint,
        predecessorVersionId: previous.versionId,
        placementIds: [...storedCandidate.placementIds],
        evidenceRefs: [...storedCandidate.evidenceRefs],
        sourceEvidenceRefs: [...storedCandidate.sourceEvidenceRefs],
        answerEvidenceRefs: [...storedCandidate.answerEvidenceRefs],
        createdByOperationId: input.operationId,
        createdAt: now,
      };
      const result: ActivityRevisionPublishResult = {
        status: 'revised',
        activityId: storedCandidate.activityId,
        activityVersionId: versionId,
        activityVersion: nextVersion,
        predecessorActivityVersionId: previous.versionId,
        candidateId: storedCandidate.candidateId,
        candidateRevision: storedCandidate.candidateRevision,
        placementIds: [...storedCandidate.placementIds],
        diff: clone(storedCandidate.semanticImpact),
        projection: clone(storedCandidate.projection),
        impact: {
          classification: storedCandidate.semanticImpact.classification,
          affectedInteractionIds: storedCandidate.normalized.interactions.map((interaction) => interaction.interactionId),
        },
      };
      const next: ActivityRevisionScope = {
        ...scope,
        current: {
          activityId: storedCandidate.activityId,
          versionId,
          version: nextVersion,
          contextFingerprint: pointer.contextFingerprint,
        },
        versions: { ...scope.versions, [versionId]: record },
        ...(scope.operations
          ? { operations: { ...scope.operations, [input.operationId]: { ownerId: input.ownerId, fingerprint: storedCandidate.fingerprint, result, createdAt: now } } }
          : { operations: { [input.operationId]: { ownerId: input.ownerId, fingerprint: storedCandidate.fingerprint, result, createdAt: now } } }),
      };
      return { outcome: result, next, write: true };
    });
  };

  const rollback = async (input: ActivityRevisionRollbackInput): Promise<ActivityRevisionPublishResult> => {
    const now = input.now ?? new Date().toISOString();
    if (!validId(input.operationId, OPERATION_ID) || !validId(input.ownerId) || !validId(input.activityId) || !validId(input.expectedCurrentVersionId, VERSION_ID) || !validId(input.targetVersionId, VERSION_ID)) return { status: 'invalid', failureCode: 'invalid-rollback-input' };
    return repository.transaction(input.activityId, (scope) => {
      const pointer = scope.current;
      const target = scope.versions[input.targetVersionId];
      if (!pointer || !target) return { outcome: { status: 'not-found', failureCode: 'target-version-not-found' }, write: false };
      if (pointer.versionId !== input.expectedCurrentVersionId) return { outcome: { status: 'conflict', failureCode: 'stale-current-activity-version' }, write: false };
      if (target.activityId !== input.activityId || target.ownerId !== input.ownerId) return { outcome: { status: 'forbidden', failureCode: 'activity-owner-mismatch' }, write: false };
      const next: ActivityRevisionScope = {
        ...scope,
        current: {
          activityId: target.activityId,
          versionId: target.versionId,
          version: target.version,
          contextFingerprint: target.sourceContextFingerprint,
        },
      };
      const result: ActivityRevisionPublishResult = {
        status: 'rolled-back',
        failureCode: `rollback:${target.versionId}:${now}`,
      };
      return {
        outcome: result,
        next: {
          ...next,
          operations: {
            ...(scope.operations ?? {}),
            [input.operationId]: {
              ownerId: input.ownerId,
              fingerprint: fingerprint({ action: 'rollback', activityId: input.activityId, targetVersionId: input.targetVersionId }),
              result,
              createdAt: now,
            },
          },
        },
        write: true,
      };
    });
  };

  return { preview, loadCandidate, publish, rollback };
};
