import type { BookMetadataBackupInventory } from '../types';
import {
  createBookRuntimeRecoveryAdapter,
  createBookRuntimeRecoveryProjection,
  isBookRuntimeRecoveryContext,
  type BookRuntimeRecoveryAdapter,
  type BookRuntimeRecoveryContextKind,
  type BookRuntimeRecoveryDiagnostic,
  type BookRuntimeRecoveryProjection,
  type BookRuntimeRecoveryReport,
} from '../../../src/services/book-activity/bookRuntime.recovery';
import {
  isBookDeliveryRecoveryHold,
} from '../../../src/services/book-delivery/bookDelivery.recovery';
import {
  validateBookDeliveryBinding,
} from '../../../src/services/book-delivery/bookDelivery.schema';
import type { BookDeliveryBinding } from '../../../src/services/book-delivery/bookDelivery.types';
import type { BookSourceRecoveryAuthority } from '../../../src/services/book-source-delivery/sourceRecovery.adapter';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const SAFE_OPERATION = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTEXTS = new Set<BookRuntimeRecoveryContextKind>(['solo', 'homework', 'course', 'class']);
const TERMINAL_KEYS = new Set(['attempts', 'results', 'completions', 'indexes', 'operations']);

export interface BookRuntimeRestorePlan {
  readonly recoveryOperationId: string;
  readonly inventoryFingerprint: string;
  readonly projections: readonly BookRuntimeRecoveryProjection[];
  readonly diagnostics: readonly BookRuntimeRecoveryDiagnostic[];
  readonly report: BookRuntimeRecoveryReport;
  readonly productionWrites: 0;
  readonly commandExecutions: 0;
  readonly scoringCalls: 0;
  readonly gradingCalls: 0;
  readonly feedbackReleaseWrites: 0;
  readonly completionWrites: 0;
  readonly notificationWrites: 0;
  readonly providerOperations: 0;
  readonly recoveryWrites: number;
}

export class BookRuntimeRestoreValidationError extends Error {
  readonly name = 'BookRuntimeRestoreValidationError';

  constructor(readonly diagnostics: readonly BookRuntimeRecoveryDiagnostic[]) {
    super(diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join('; '));
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootData = (inventory: BookMetadataBackupInventory, path: string): Record<string, unknown> => {
  const root = inventory.roots.find((candidate) => candidate.path === path);
  return root?.present === true && isRecord(root.data) ? root.data : {};
};

const rootPresent = (inventory: BookMetadataBackupInventory, path: string): boolean => (
  inventory.roots.some((candidate) => candidate.path === path && candidate.present === true)
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprint = (value: unknown): string => {
  let state = 0xcbf29ce484222325n;
  for (const character of stable(value)) {
    state ^= BigInt(character.charCodeAt(0));
    state = BigInt.asUintN(64, state * 0x100000001b3n);
  }
  return `fnv1a64:${state.toString(16).padStart(16, '0')}`;
};

const clone = <T>(value: T): T => structuredClone(value);

const safeDate = (value: unknown): value is string => (
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value))
);

const nonNegativeInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const positiveInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

const readPath = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
};

const addDiagnostic = (
  diagnostics: BookRuntimeRecoveryDiagnostic[],
  diagnostic: BookRuntimeRecoveryDiagnostic,
): void => {
  if (!diagnostics.some((entry) => entry.code === diagnostic.code && entry.path === diagnostic.path)) {
    diagnostics.push(diagnostic);
  }
};

const asMap = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};

const contextPath = (recipientId: string, contextId: string): string => (
  `book_runtime/scopes/${recipientId}/${contextId}`
);

const deliveryScope = (
  deliveryScopes: Record<string, unknown>,
  recipientId: string,
  contextId: string,
): Record<string, unknown> | null => {
  const candidate = readPath(deliveryScopes, [recipientId, contextId]);
  return isRecord(candidate) ? candidate : null;
};

const activityVersion = (
  versions: Record<string, unknown>,
  activityId: string,
  activityVersionId: string,
): Record<string, unknown> | null => {
  const candidate = readPath(versions, [activityId, activityVersionId]);
  return isRecord(candidate) ? candidate : null;
};

const activityFeedbackPolicy = (version: Record<string, unknown>): 'none' | 'after-submit' | 'after-review' | null => {
  const projection = isRecord(version.projection) ? version.projection : null;
  const activity = isRecord(version.activity) ? version.activity : null;
  const scoring = isRecord(projection?.scoring)
    ? projection.scoring
    : isRecord(activity?.scoring)
      ? activity.scoring
      : isRecord(version.scoring) ? version.scoring : null;
  const policy = scoring?.feedbackVisibility;
  return policy === 'none' || policy === 'after-submit' || policy === 'after-review' ? policy : null;
};

const bindingForScope = (
  scope: Record<string, unknown>,
  delivery: Record<string, unknown>,
  recipientId: string,
  contextId: string,
  expectedOwnerId: string | undefined,
  diagnostics: BookRuntimeRecoveryDiagnostic[],
  path: string,
): BookDeliveryBinding | null => {
  const hold = readPath(delivery, ['recovery', 'hold']);
  if (!isBookDeliveryRecoveryHold(hold)
    || hold.recipientId !== recipientId
    || hold.contextId !== contextId
    || hold.deliveryState !== 'unavailable'
    || hold.readDenied !== true
    || hold.activation !== 'held-for-reconciliation') {
    addDiagnostic(diagnostics, {
      code: 'binding-mismatch', path: `${path}/delivery/recovery/hold`,
      message: 'The accepted Delivery recovery hold is absent or does not fail closed.',
    });
    return null;
  }

  const runtimeRows = [
    scope.draft,
    ...Object.values(asMap(scope.attempts)),
    ...Object.values(asMap(scope.results)),
    ...Object.values(asMap(scope.completions)),
    ...Object.values(asMap(scope.indexes)),
  ].filter(isRecord);
  const bindingIds = new Set(runtimeRows.map((row) => row.bindingId).filter((value): value is string => typeof value === 'string'));
  const records = asMap(delivery.records);
  const candidates = Object.values(records).filter(isRecord).map((record) => record.binding).filter(isRecord);
  const selected = candidates.find((candidate) => (
    (bindingIds.size === 0 || bindingIds.has(candidate.bindingId as string))
    && candidate.recipient && isRecord(candidate.recipient)
    && candidate.context && isRecord(candidate.context)
    && candidate.recipient.recipientId === recipientId
    && candidate.context.contextId === contextId
  ));
  if (!selected) {
    addDiagnostic(diagnostics, {
      code: 'binding-mismatch', path: `${path}/delivery/records`,
      message: 'Runtime rows do not resolve to one canonical Delivery binding.',
    });
    return null;
  }
  const validated = validateBookDeliveryBinding(selected);
  if (!validated.valid) {
    addDiagnostic(diagnostics, {
      code: 'binding-mismatch', path: `${path}/delivery/records/${String(selected.bindingId)}`,
      message: validated.errors[0]?.message ?? 'Delivery binding validation failed.',
    });
    return null;
  }
  const binding = selected as unknown as BookDeliveryBinding;
  const current = delivery.current;
  if (!isRecord(current)
    || current.bindingId !== binding.bindingId
    || current.bindingRevision !== binding.revision
    || current.recipientId !== recipientId
    || current.contextId !== contextId
    || current.status !== 'active'
    || binding.status !== 'active'
    || binding.recipient.recipientId !== recipientId
    || binding.context.recipientId !== recipientId
    || binding.context.contextId !== contextId
    || (expectedOwnerId !== undefined && binding.issuer.ownerId !== expectedOwnerId)) {
    addDiagnostic(diagnostics, {
      code: 'binding-mismatch', path: `${path}/delivery/current`,
      message: 'Delivery current pointer, owner, recipient, or revision is stale.',
    });
    return null;
  }
  if (!CONTEXTS.has(binding.context.kind as BookRuntimeRecoveryContextKind)) {
    addDiagnostic(diagnostics, {
      code: 'context-mismatch', path: `${path}/delivery/context/kind`,
      message: 'Preview and future-live contexts are unavailable to runtime recovery.',
    });
    return null;
  }
  return binding;
};

interface RuntimeTarget {
  readonly binding: BookDeliveryBinding;
  readonly contextKind: BookRuntimeRecoveryContextKind;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  readonly interactionId: string;
  readonly feedbackPolicy: 'none' | 'after-submit' | 'after-review';
  readonly sourceProvenance: readonly { sourceKey: string; sourceVersionId: string; pages: readonly number[] }[];
}

const targetFor = (
  binding: BookDeliveryBinding,
  scope: Record<string, unknown>,
  placementId: string,
  interactionId: string,
  versions: Record<string, unknown>,
  sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>,
  diagnostics: BookRuntimeRecoveryDiagnostic[],
  path: string,
): RuntimeTarget | null => {
  const placement = binding.placements.find((candidate) => candidate.placementId === placementId);
  if (!placement || !SAFE_ID.test(interactionId)) {
    addDiagnostic(diagnostics, { code: 'activity-mismatch', path, message: 'Placement or interaction is not pinned by Delivery.' });
    return null;
  }
  const version = activityVersion(versions, placement.activityId, placement.activityVersionId);
  if (!version
    || version.activityId !== placement.activityId
    || (version.activityVersionId ?? version.versionId) !== placement.activityVersionId
    || version.activityVersion !== placement.activityVersion
    || version.lifecycle !== 'published'
    || version.ownerId !== binding.issuer.ownerId) {
    addDiagnostic(diagnostics, { code: 'activity-mismatch', path: `${path}/activity-version`, message: 'Pinned Activity revision is unavailable, unpublished, or owned by another issuer.' });
    return null;
  }
  const feedbackPolicy = activityFeedbackPolicy(version);
  if (!feedbackPolicy) {
    addDiagnostic(diagnostics, { code: 'feedback-policy-invalid', path: `${path}/activity-version/scoring`, message: 'Canonical Activity feedback policy is missing or invalid.' });
    return null;
  }
  const sourceProvenance: { sourceKey: string; sourceVersionId: string; pages: readonly number[] }[] = [];
  for (const sourceScope of placement.sourcePageScopes) {
    const source = binding.sourceSet.sources.find((candidate) => candidate.sourceKey === sourceScope.sourceKey);
    const authority = source ? sourceAuthorities.get(source.sourceVersionId) : undefined;
    if (!source || !authority || authority.bookId !== binding.book.bookId || authority.sourceKey !== source.sourceKey
      || authority.sourceVersionId !== source.sourceVersionId || authority.ownerId !== binding.issuer.ownerId || !authority.available) {
      addDiagnostic(diagnostics, { code: 'source-unavailable', path: `${path}/source/${sourceScope.sourceKey}`, message: 'Pinned Source authority is missing, mismatched, or unavailable.' });
      return null;
    }
    sourceProvenance.push({ sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId, pages: [...sourceScope.pages] });
  }
  if (scope.activityId !== undefined && scope.activityId !== placement.activityId) {
    addDiagnostic(diagnostics, { code: 'activity-mismatch', path, message: 'Runtime scope activity does not match Delivery placement.' });
    return null;
  }
  return {
    binding,
    contextKind: binding.context.kind as BookRuntimeRecoveryContextKind,
    placementId,
    activityId: placement.activityId,
    activityVersion: placement.activityVersion,
    activityVersionId: placement.activityVersionId,
    interactionId,
    feedbackPolicy,
    sourceProvenance,
  };
};

const identityMatches = (
  value: Record<string, unknown>,
  target: RuntimeTarget,
  recipientId: string,
  contextId: string,
  path: string,
  diagnostics: BookRuntimeRecoveryDiagnostic[],
): boolean => {
  const valid = value.schemaVersion === 1
    && value.bindingId === target.binding.bindingId
    && value.bindingRevision === target.binding.revision
    && value.recipientId === recipientId
    && value.contextId === contextId
    && value.placementId === target.placementId
    && value.activityId === target.activityId
    && value.activityVersion === target.activityVersion
    && value.activityVersionId === target.activityVersionId
    && value.interactionId === target.interactionId;
  if (!valid) addDiagnostic(diagnostics, { code: 'context-mismatch', path, message: 'Runtime record identity does not match its pinned context and Activity revision.' });
  return valid;
};

const provenanceMatches = (
  value: unknown,
  target: RuntimeTarget,
  path: string,
  diagnostics: BookRuntimeRecoveryDiagnostic[],
): boolean => {
  if (!Array.isArray(value) || !same(value, target.sourceProvenance)) {
    addDiagnostic(diagnostics, { code: 'activity-mismatch', path, message: 'Terminal Source provenance does not match the pinned Delivery placement.' });
    return false;
  }
  return true;
};

type MutableRecoveryReport = { -readonly [K in keyof BookRuntimeRecoveryReport]: number };

const reportFor = (): MutableRecoveryReport => ({
  restored: 0, rebuilt: 0, skippedIdempotent: 0, invalid: 0, unavailable: 0, retryable: 0, terminal: 0,
});

const addProjection = (
  projections: BookRuntimeRecoveryProjection[],
  seen: Map<string, string>,
  input: Parameters<typeof createBookRuntimeRecoveryProjection>[0],
  report: MutableRecoveryReport,
  diagnostics: BookRuntimeRecoveryDiagnostic[],
  path: string,
): void => {
  try {
    const value = createBookRuntimeRecoveryProjection(input);
    const prior = seen.get(value.projectionKey);
    if (prior !== undefined) {
      if (prior !== value.canonicalFingerprint) {
        report.terminal += 1;
        addDiagnostic(diagnostics, { code: 'duplicate-conflict', path, message: 'Duplicate terminal/idempotency key conflicts with canonical metadata.' });
      } else report.skippedIdempotent += 1;
      return;
    }
    seen.set(value.projectionKey, value.canonicalFingerprint);
    projections.push(value);
    report.rebuilt += 1;
  } catch {
    report.invalid += 1;
    addDiagnostic(diagnostics, { code: 'invalid-record', path, message: 'Canonical runtime metadata could not be converted to a safe recovery projection.' });
  }
};

const projectRuntimeScope = (input: {
  readonly recoveryOperationId: string;
  readonly scope: Record<string, unknown>;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly interactionId: string;
  readonly target: RuntimeTarget;
  readonly projections: BookRuntimeRecoveryProjection[];
  readonly seen: Map<string, string>;
  readonly report: MutableRecoveryReport;
  readonly diagnostics: BookRuntimeRecoveryDiagnostic[];
}): void => {
  const { recoveryOperationId, scope, recipientId, contextId, placementId, interactionId, target, projections, seen, report, diagnostics } = input;
  for (const key of Object.keys(scope)) {
    if (!['draft', ...TERMINAL_KEYS].includes(key)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-scope', path: contextPath(recipientId, contextId), message: `Unsupported runtime scope child ${key}.` });
    }
  }
  const identity = (row: Record<string, unknown>, path: string): boolean => (
    identityMatches(row, target, recipientId, contextId, path, diagnostics)
    && (row.sourceProvenance === undefined || provenanceMatches(row.sourceProvenance, target, `${path}.sourceProvenance`, diagnostics))
  );
  const common = (row: Record<string, unknown>, recordKind: Parameters<typeof createBookRuntimeRecoveryProjection>[0]['recordKind'], recordId: string, idempotencyKey: string, metadata: Parameters<typeof createBookRuntimeRecoveryProjection>[0]['metadata'], path: string): void => {
    if (!identity(row, path) || !SAFE_ID.test(recordId) || !SAFE_ID.test(idempotencyKey)) {
      report.invalid += 1;
      return;
    }
    addProjection(projections, seen, {
      recoveryOperationId,
      recordKind, recordId, idempotencyKey,
      recipientId, contextId, contextKind: target.contextKind,
      ownerId: target.binding.issuer.ownerId,
      bindingId: target.binding.bindingId, bindingRevision: target.binding.revision,
      placementId, activityId: target.activityId, activityVersion: target.activityVersion,
      activityVersionId: target.activityVersionId, interactionId,
      feedbackPolicy: target.feedbackPolicy, sourceProvenance: target.sourceProvenance,
      metadata, canonicalFingerprint: fingerprint({ recordKind, recordId, idempotencyKey, metadata }),
    }, report, diagnostics, path);
  };
  const operation = (row: Record<string, unknown>): string | null => typeof row.operationId === 'string' ? row.operationId : null;
  const opId = (row: Record<string, unknown>): string | null => {
    const value = operation(row) ?? (typeof row.createdByOperationId === 'string' ? row.createdByOperationId : null)
      ?? (typeof row.updatedByOperationId === 'string' ? row.updatedByOperationId : null);
    return value && SAFE_ID.test(value) ? value : null;
  };
  const draft = scope.draft;
  if (isRecord(draft)) {
    const id = opId(draft);
    if (!id || !safeDate(draft.updatedAt) || !nonNegativeInt(draft.revision)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-record', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/draft`, message: 'Autosave metadata is malformed.' });
    } else {
      common(draft, 'autosave', `${placementId}:${interactionId}:draft`, id, { revision: draft.revision, updatedAt: draft.updatedAt, operationId: id }, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/draft`);
    }
  }
  for (const [attemptId, row] of Object.entries(asMap(scope.attempts))) {
    if (!isRecord(row) || row.attemptId !== attemptId || !positiveInt(row.attemptNumber) || !safeDate(row.createdAt)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-record', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/attempts/${attemptId}`, message: 'Attempt metadata is malformed.' });
      continue;
    }
    const id = opId(row);
    if (!id || row.feedbackRelease !== 'pending') { report.invalid += 1; continue; }
    common(row, 'attempt', attemptId, id, { attemptId, attemptNumber: row.attemptNumber, updatedAt: row.createdAt, feedbackRelease: 'pending', operationId: id }, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/attempts/${attemptId}`);
  }
  for (const [resultId, row] of Object.entries(asMap(scope.results))) {
    if (!isRecord(row) || row.resultId !== resultId || typeof row.attemptId !== 'string' || !safeDate(row.createdAt)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-record', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/results/${resultId}`, message: 'Result metadata is malformed.' });
      continue;
    }
    const id = opId(row);
    if (!id || !['pending_review', 'submitted'].includes(String(row.status)) || row.feedbackRelease !== 'pending') { report.invalid += 1; continue; }
    common(row, 'result', resultId, id, { attemptId: row.attemptId, resultId, status: row.status as 'pending_review' | 'submitted', feedbackRelease: 'pending', operationId: id }, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/results/${resultId}`);
    common(row, 'submission', row.attemptId, id, { attemptId: row.attemptId, resultId, status: row.status as 'pending_review' | 'submitted', feedbackRelease: 'pending', operationId: id }, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/results/${resultId}/submission`);
  }
  for (const [completionId, row] of Object.entries(asMap(scope.completions))) {
    if (!isRecord(row) || row.completionId !== completionId || typeof row.attemptId !== 'string' || !safeDate(row.createdAt)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-record', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/completions/${completionId}`, message: 'Completion metadata is malformed.' });
      continue;
    }
    const id = opId(row);
    if (!id || row.status !== 'completed') { report.invalid += 1; continue; }
    common(row, 'completion', completionId, id, { attemptId: row.attemptId, completionId, status: 'completed', operationId: id }, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/completions/${completionId}`);
  }
  for (const [operationId, row] of Object.entries(asMap(scope.operations))) {
    if (!isRecord(row) || row.operationId !== operationId || !SAFE_ID.test(operationId) || !safeDate(row.createdAt)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'invalid-operation', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/operations/${operationId}`, message: 'Operation receipt metadata is malformed.' });
      continue;
    }
    const relatedAttempt = typeof row.attemptId === 'string'
      ? asMap(scope.attempts)[row.attemptId]
      : undefined;
    const operationStatus = String(row.status);
    const operationIdentityValid = (row.bindingId === undefined || row.bindingId === target.binding.bindingId)
      && (row.recipientId === undefined || row.recipientId === recipientId)
      && (row.contextId === undefined || row.contextId === contextId)
      && (row.placementId === undefined || row.placementId === placementId)
      && (row.activityId === undefined || row.activityId === target.activityId)
      && (row.activityVersion === undefined || row.activityVersion === target.activityVersion)
      && (row.activityVersionId === undefined || row.activityVersionId === target.activityVersionId)
      && (row.interactionId === undefined || row.interactionId === interactionId)
      && (row.attemptId === undefined
        || (isRecord(relatedAttempt)
          && relatedAttempt.createdByOperationId === operationId
          && identity(relatedAttempt, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/attempts/${String(row.attemptId)}`)));
    if (!operationIdentityValid || (operationStatus === 'accepted' || operationStatus === 'replayed') && row.attemptId !== undefined && !isRecord(relatedAttempt)) {
      report.invalid += 1;
      addDiagnostic(diagnostics, { code: 'context-mismatch', path: `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/operations/${operationId}`, message: 'Operation receipt is not bound to the canonical runtime context and attempt.' });
      continue;
    }
    const status: 'replayed' | 'denied' = ['accepted', 'replayed', 'conflict', 'denied'].includes(String(row.status)) ? 'replayed' : 'denied';
    const metadata = { operationId, status, attemptId: typeof row.attemptId === 'string' ? row.attemptId : undefined, attemptNumber: nonNegativeInt(row.attemptNumber) ? row.attemptNumber : undefined };
    addProjection(projections, seen, {
      recoveryOperationId, recordKind: 'operation', recordId: operationId, idempotencyKey: operationId,
      recipientId, contextId, contextKind: target.contextKind, ownerId: target.binding.issuer.ownerId,
      bindingId: target.binding.bindingId, bindingRevision: target.binding.revision, placementId,
      activityId: target.activityId, activityVersion: target.activityVersion, activityVersionId: target.activityVersionId,
      interactionId, feedbackPolicy: target.feedbackPolicy, sourceProvenance: target.sourceProvenance,
      metadata, canonicalFingerprint: fingerprint(metadata),
    }, report, diagnostics, `${contextPath(recipientId, contextId)}/${placementId}/${interactionId}/operations/${operationId}`);
  }
};

const projectEvaluationScopes = (input: {
  readonly evaluations: Record<string, unknown>;
  readonly targets: Map<string, RuntimeTarget>;
  readonly recoveryOperationId: string;
  readonly projections: BookRuntimeRecoveryProjection[];
  readonly seen: Map<string, string>;
  readonly report: MutableRecoveryReport;
  readonly diagnostics: BookRuntimeRecoveryDiagnostic[];
}): void => {
  const walk = (value: unknown, path: string, ids: readonly string[]): void => {
    if (!isRecord(value)) return;
    const target = value.target;
    if (isRecord(target) && typeof target.attemptId === 'string') {
      const targetIdentity = target;
      const hasTargetIdentity = [
        'recipientId', 'contextId', 'placementId', 'activityId', 'activityVersionId', 'interactionId', 'resultId', 'bindingId',
      ].every((key) => typeof targetIdentity[key] === 'string');
      if (!hasTargetIdentity) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'terminal-mismatch', path, message: 'Evaluation target identity is malformed.' });
        return;
      }
      const attemptId = targetIdentity.attemptId as string;
      const key = [targetIdentity.recipientId, targetIdentity.contextId, targetIdentity.placementId, targetIdentity.activityId, targetIdentity.activityVersionId, targetIdentity.interactionId].join('/');
      const runtimeTarget = input.targets.get(key);
      if (!runtimeTarget
        || targetIdentity.bindingId !== runtimeTarget.binding.bindingId
        || targetIdentity.activityVersion !== runtimeTarget.activityVersion
        || targetIdentity.activityVersionId !== runtimeTarget.activityVersionId
        || targetIdentity.resultId !== `${attemptId}:result`) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'terminal-mismatch', path, message: 'Evaluation target does not match a canonical runtime attempt.' });
        return;
      }
      const revisionValue = nonNegativeInt(value.revision)
        ? value.revision
        : isRecord(value.current) && nonNegativeInt(value.current.revision)
          ? value.current.revision
          : null;
      const revision = revisionValue ?? 0;
      const suppliedOperationId = value.operationId;
      if ((suppliedOperationId !== undefined && (typeof suppliedOperationId !== 'string' || !SAFE_ID.test(suppliedOperationId))) || revisionValue === null) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'invalid-record', path, message: 'Evaluation history metadata is malformed.' });
        return;
      }
      const operationId = typeof suppliedOperationId === 'string'
        ? suppliedOperationId
        : fingerprint({ kind: 'grading-history', attemptId, revision });
      const metadata = { attemptId, resultId: targetIdentity.resultId as string, evaluationRevision: revision, historyCount: isRecord(value.history) ? Object.keys(value.history).length : 0, feedbackRelease: 'pending' as const, operationId };
      addProjection(input.projections, input.seen, {
        recoveryOperationId: input.recoveryOperationId, recordKind: 'grading-history', recordId: `${attemptId}:evaluation:${revision}`, idempotencyKey: operationId,
        recipientId: targetIdentity.recipientId as string, contextId: targetIdentity.contextId as string, contextKind: runtimeTarget.contextKind,
        ownerId: runtimeTarget.binding.issuer.ownerId, bindingId: runtimeTarget.binding.bindingId, bindingRevision: runtimeTarget.binding.revision,
        placementId: runtimeTarget.placementId, activityId: runtimeTarget.activityId, activityVersion: runtimeTarget.activityVersion, activityVersionId: runtimeTarget.activityVersionId, interactionId: runtimeTarget.interactionId,
        feedbackPolicy: runtimeTarget.feedbackPolicy, sourceProvenance: runtimeTarget.sourceProvenance, metadata,
        canonicalFingerprint: fingerprint(metadata),
      }, input.report, input.diagnostics, path);
      addProjection(input.projections, input.seen, {
        recoveryOperationId: input.recoveryOperationId, recordKind: 'feedback-release', recordId: `${attemptId}:feedback`, idempotencyKey: `${operationId}:feedback`,
        recipientId: targetIdentity.recipientId as string, contextId: targetIdentity.contextId as string, contextKind: runtimeTarget.contextKind,
        ownerId: runtimeTarget.binding.issuer.ownerId, bindingId: runtimeTarget.binding.bindingId, bindingRevision: runtimeTarget.binding.revision,
        placementId: runtimeTarget.placementId, activityId: runtimeTarget.activityId, activityVersion: runtimeTarget.activityVersion, activityVersionId: runtimeTarget.activityVersionId, interactionId: runtimeTarget.interactionId,
        feedbackPolicy: runtimeTarget.feedbackPolicy, sourceProvenance: runtimeTarget.sourceProvenance,
        metadata: { attemptId, resultId: targetIdentity.resultId as string, feedbackRelease: runtimeTarget.feedbackPolicy === 'none' ? 'not-applicable' : 'pending', operationId: fingerprint({ kind: 'feedback-release', operationId }) },
        canonicalFingerprint: fingerprint({ target: targetIdentity, revision, feedbackPolicy: runtimeTarget.feedbackPolicy }),
      }, input.report, input.diagnostics, `${path}/feedback-release`);
      return;
    }
    Object.entries(value).forEach(([key, child]) => walk(child, `${path}/${key}`, [...ids, key]));
  };
  walk(input.evaluations, 'book_activity_evaluations/scopes', []);
};

const projectCompletionScopes = (input: {
  readonly completions: Record<string, unknown>;
  readonly targets: Map<string, RuntimeTarget>;
  readonly recoveryOperationId: string;
  readonly projections: BookRuntimeRecoveryProjection[];
  readonly seen: Map<string, string>;
  readonly report: MutableRecoveryReport;
  readonly diagnostics: BookRuntimeRecoveryDiagnostic[];
}): void => {
  for (const [recipientId, contexts] of Object.entries(input.completions)) {
    if (!isRecord(contexts)) continue;
    for (const [contextId, raw] of Object.entries(contexts)) {
      if (!isRecord(raw) || !SAFE_ID.test(recipientId) || !SAFE_ID.test(contextId)) continue;
      const facts = isRecord(raw.facts) ? raw.facts : null;
      const projection = isRecord(raw.projection) ? raw.projection : null;
      const bindingId = typeof raw.bindingId === 'string' ? raw.bindingId : typeof facts?.bindingId === 'string' ? facts.bindingId : null;
      const target = [...input.targets.values()].find((candidate) => candidate.binding.bindingId === bindingId
        && candidate.binding.context.recipientId === recipientId
        && candidate.binding.context.contextId === contextId);
      if (!target || target.contextKind !== 'homework') {
        input.report.unavailable += 1;
        addDiagnostic(input.diagnostics, { code: 'context-mismatch', path: `book_runtime/homework_completion/${recipientId}/${contextId}`, message: 'Homework completion projection has no matching held runtime context.' });
        continue;
      }
      const source = projection ?? facts;
      const completion = isRecord(source?.completion) ? source.completion : source;
      const submittedCount = nonNegativeInt(completion?.submittedCount) ? completion.submittedCount : null;
      const requiredCount = nonNegativeInt(completion?.requiredCount) ? completion.requiredCount : null;
      const status = ['not_started', 'in_progress', 'completed'].includes(String(completion?.status)) ? completion?.status as 'not_started' | 'in_progress' | 'completed' : null;
      if (!status || submittedCount === null || requiredCount === null) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'invalid-record', path: `book_runtime/homework_completion/${recipientId}/${contextId}`, message: 'Homework completion metadata is malformed.' });
        continue;
      }
      if (submittedCount > requiredCount) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'terminal-mismatch', path: `book_runtime/homework_completion/${recipientId}/${contextId}`, message: 'Completion metadata exceeds its canonical required count.' });
        continue;
      }
      const suppliedOperationId = raw.operationId;
      if (suppliedOperationId !== undefined && (typeof suppliedOperationId !== 'string' || !SAFE_ID.test(suppliedOperationId))) {
        input.report.invalid += 1;
        addDiagnostic(input.diagnostics, { code: 'invalid-operation', path: `book_runtime/homework_completion/${recipientId}/${contextId}/operationId`, message: 'Completion projection operation identity is malformed.' });
        continue;
      }
      const metadata = {
        submittedCount,
        requiredCount,
        completionStatus: status,
        operationId: typeof suppliedOperationId === 'string'
          ? suppliedOperationId
          : fingerprint({ kind: 'completion-projection', recipientId, contextId }),
      };
      addProjection(input.projections, input.seen, {
        recoveryOperationId: input.recoveryOperationId, recordKind: 'completion-projection', recordId: `${recipientId}:${contextId}:completion`, idempotencyKey: metadata.operationId,
        recipientId, contextId, contextKind: target.contextKind, ownerId: target.binding.issuer.ownerId, bindingId: target.binding.bindingId, bindingRevision: target.binding.revision,
        placementId: target.placementId, activityId: target.activityId, activityVersion: target.activityVersion, activityVersionId: target.activityVersionId, interactionId: target.interactionId,
        feedbackPolicy: target.feedbackPolicy, sourceProvenance: target.sourceProvenance, metadata, canonicalFingerprint: fingerprint(metadata),
      }, input.report, input.diagnostics, `book_runtime/homework_completion/${recipientId}/${contextId}`);
    }
  }
};

export const prepareBookRuntimeRestore = (input: {
  readonly inventory: unknown;
  readonly inventoryFingerprint: string;
  readonly recoveryOperationId: string;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly expectedOwnerId?: string;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookRuntimeRestorePlan => {
  const diagnostics: BookRuntimeRecoveryDiagnostic[] = [];
  const report = reportFor();
  if (!SAFE_OPERATION.test(input.recoveryOperationId)) {
    throw new BookRuntimeRestoreValidationError([{ code: 'invalid-operation', path: '$.recoveryOperationId', message: 'Runtime recovery requires a bounded operation ID.' }]);
  }
  if (!isRecord(input.inventory) || input.inventory.kind !== 'book-metadata-inventory' || !Array.isArray(input.inventory.roots)) {
    throw new BookRuntimeRestoreValidationError([{ code: 'invalid-record', path: '$.inventory', message: 'Runtime recovery requires the validated metadata inventory.' }]);
  }
  const inventory = input.inventory as unknown as BookMetadataBackupInventory;
  if (['book_runtime/attempts', 'book_runtime/results', 'book_runtime/completions'].some((path) => rootPresent(inventory, path))) {
    throw new BookRuntimeRestoreValidationError([{ code: 'invalid-scope', path: 'book_runtime', message: 'Runtime recovery rejects legacy flat runtime roots.' }]);
  }
  const runtimeScopes = rootData(inventory, 'book_runtime/scopes');
  const deliveryScopes = rootData(inventory, 'book_delivery/scopes');
  const versions = rootData(inventory, 'book_activity/versions');
  const evaluations = rootData(inventory, 'book_activity_evaluations/scopes');
  const completionScopes = rootData(inventory, 'book_runtime/homework_completion');
  const projections: BookRuntimeRecoveryProjection[] = [];
  const seen = new Map<string, string>();
  const targets = new Map<string, RuntimeTarget>();
  for (const [recipientId, contexts] of Object.entries(runtimeScopes).sort(([a], [b]) => a.localeCompare(b))) {
    if (!SAFE_ID.test(recipientId) || !isRecord(contexts)) { report.invalid += 1; continue; }
    for (const [contextId, placements] of Object.entries(contexts).sort(([a], [b]) => a.localeCompare(b))) {
      const basePath = contextPath(recipientId, contextId);
      if (!SAFE_ID.test(contextId) || !isRecord(placements)) { report.invalid += 1; continue; }
      const delivery = deliveryScope(deliveryScopes, recipientId, contextId);
      if (!delivery) { report.unavailable += 1; addDiagnostic(diagnostics, { code: 'binding-mismatch', path: `${basePath}/delivery`, message: 'Canonical Delivery scope is unavailable.' }); continue; }
      for (const [placementId, interactions] of Object.entries(placements)) {
        if (!SAFE_ID.test(placementId) || !isRecord(interactions)) { report.invalid += 1; continue; }
        for (const [interactionId, scopeValue] of Object.entries(interactions)) {
          const path = `${basePath}/${placementId}/${interactionId}`;
          if (!SAFE_ID.test(interactionId) || !isRecord(scopeValue)) { report.invalid += 1; continue; }
          const binding = bindingForScope(scopeValue, delivery, recipientId, contextId, input.expectedOwnerId, diagnostics, path);
          if (!binding) { report.unavailable += 1; continue; }
          const target = targetFor(binding, scopeValue, placementId, interactionId, versions, input.sourceAuthorities, diagnostics, path);
          if (!target) { report.unavailable += 1; continue; }
          targets.set(`${recipientId}/${contextId}/${placementId}/${target.activityId}/${target.activityVersionId}/${target.interactionId}`, target);
          projectRuntimeScope({ recoveryOperationId: input.recoveryOperationId, scope: scopeValue, recipientId, contextId, placementId, interactionId, target, projections, seen, report, diagnostics });
        }
      }
    }
  }
  projectEvaluationScopes({ evaluations, targets, recoveryOperationId: input.recoveryOperationId, projections, seen, report, diagnostics });
  projectCompletionScopes({ completions: completionScopes, targets, recoveryOperationId: input.recoveryOperationId, projections, seen, report, diagnostics });
  const filtered = input.completedProjectionKeys ? projections.filter((projection) => !input.completedProjectionKeys!.has(projection.projectionKey)) : projections;
  report.skippedIdempotent += projections.length - filtered.length;
  report.rebuilt = filtered.length;
  return Object.freeze({
    recoveryOperationId: input.recoveryOperationId,
    inventoryFingerprint: input.inventoryFingerprint,
    projections: Object.freeze(filtered), diagnostics: Object.freeze(diagnostics), report: Object.freeze(report),
    productionWrites: 0, commandExecutions: 0, scoringCalls: 0, gradingCalls: 0, feedbackReleaseWrites: 0,
    completionWrites: 0, notificationWrites: 0, providerOperations: 0, recoveryWrites: 0,
  });
};

export const rebuildBookRuntimeProjections = (input: { readonly plan: BookRuntimeRestorePlan; readonly completedProjectionKeys?: ReadonlySet<string> }): BookRuntimeRestorePlan => {
  if (input.plan.productionWrites !== 0 || input.plan.commandExecutions !== 0 || input.plan.scoringCalls !== 0 || input.plan.gradingCalls !== 0 || input.plan.feedbackReleaseWrites !== 0 || input.plan.completionWrites !== 0 || input.plan.notificationWrites !== 0 || input.plan.providerOperations !== 0) {
    throw new BookRuntimeRestoreValidationError([{ code: 'invalid-record', path: '$.plan', message: 'Runtime recovery rebuild cannot authorize terminal side effects.' }]);
  }
  if (!input.completedProjectionKeys || input.completedProjectionKeys.size === 0) return input.plan;
  const projections = input.plan.projections.filter((projection) => !input.completedProjectionKeys!.has(projection.projectionKey));
  return Object.freeze({ ...input.plan, projections: Object.freeze(projections), report: Object.freeze({ ...input.plan.report, rebuilt: projections.length, skippedIdempotent: input.plan.report.skippedIdempotent + input.plan.projections.length - projections.length }) });
};

export const persistBookRuntimeRecovery = async (input: { readonly plan: BookRuntimeRestorePlan; readonly adapter: BookRuntimeRecoveryAdapter }): Promise<BookRuntimeRestorePlan> => {
  if (!isBookRuntimeRecoveryContext({ recoveryOperationId: input.plan.recoveryOperationId, phase: 'rebuilding' })) throw new BookRuntimeRestoreValidationError([{ code: 'invalid-operation', path: '$.plan.recoveryOperationId', message: 'Recovery operation context is invalid.' }]);
  const result = await input.adapter.rebuild({ projections: input.plan.projections });
  return Object.freeze({
    ...input.plan,
    projections: result.projections,
    report: Object.freeze({
      ...input.plan.report,
      restored: result.report.restored,
      rebuilt: result.report.rebuilt,
      skippedIdempotent: input.plan.report.skippedIdempotent + result.report.skippedIdempotent,
    }),
    recoveryWrites: result.report.restored,
  });
};

export { createBookRuntimeRecoveryAdapter };
