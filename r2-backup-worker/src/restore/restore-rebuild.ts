import type { BookMetadataBackupInventory } from '../types';
import {
  BOOK_METADATA_CANONICAL_ROOTS,
  fingerprintBookMetadata,
  prepareBookSourceRestore,
  validateBookMetadataBackupInventory,
  type BookMetadataRestorePlan,
  type BookMetadataValidationOptions,
} from './book-source-restore';
import {
  prepareBookDeliveryRestore,
  rebuildBookDeliveryProjections,
  type BookDeliveryRestorePlan,
} from './book-delivery-restore';
import {
  prepareBookRuntimeRestore,
  rebuildBookRuntimeProjections,
  type BookRuntimeRestorePlan,
} from './book-runtime-restore';
import {
  prepareBookUpdateRestore,
  rebuildBookUpdateRestore,
  type BookUpdateRestorePlan,
} from './book-update-restore';
import {
  validateBookSourceRecoveryAuthority,
  type BookSourceRecoveryAuthority,
} from '../../../src/services/book-source-delivery/sourceRecovery.adapter';
import {
  emptyRecoveryCounts,
  RECOVERY_RECONCILIATION_PHASES,
  stableRecoveryHash,
  type RecoveryReconciliationCounts,
  type RecoveryReconciliationPhase,
  type RecoveryReconciliationPhaseReport,
  type RecoverySideEffectReport,
  zeroRecoverySideEffects,
} from './recovery-report';

const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export interface RecoveryRebuildDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface RecoveryRebuildRecord {
  readonly phase: RecoveryReconciliationPhase;
  readonly key: string;
  readonly fingerprint: string;
  readonly status: 'pending' | 'completed';
}

export interface RecoveryRebuildInput extends BookMetadataValidationOptions {
  readonly inventory: unknown;
  /** The envelope-bound canonical inventory fingerprint. */
  readonly inventoryFingerprint: string;
  readonly recoveryOperationId: string;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}

export class RecoveryRebuildValidationError extends Error {
  readonly name = 'RecoveryRebuildValidationError';

  constructor(readonly diagnostics: readonly RecoveryRebuildDiagnostic[]) {
    super(diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join('; '));
  }
}

export interface RecoveryRebuildPlan {
  readonly recoveryOperationId: string;
  readonly inventory: BookMetadataBackupInventory;
  readonly inventoryFingerprint: string;
  readonly canonicalAuthority: BookMetadataRestorePlan;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly delivery: BookDeliveryRestorePlan;
  readonly runtime: BookRuntimeRestorePlan;
  readonly updates: BookUpdateRestorePlan;
  /** Full deterministic inventory of work, including records already done. */
  readonly records: readonly RecoveryRebuildRecord[];
  /** Pending records only; these are the only records a resuming caller may process. */
  readonly pendingRecordKeys: readonly string[];
  readonly phases: readonly RecoveryReconciliationPhaseReport[];
  readonly diagnostics: readonly RecoveryRebuildDiagnostic[];
  readonly sideEffects: RecoverySideEffectReport;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const compareStrings = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const rootRecord = (inventory: BookMetadataBackupInventory, path: string): Record<string, unknown> | undefined => {
  const root = inventory.roots.find((candidate) => candidate.path === path);
  return root?.present === true && isRecord(root.data) ? root.data : undefined;
};

/**
 * Normalize only transport enumeration. Root identity, root order metadata,
 * duplicate detection, and missing-root validation remain authoritative.
 */
export const normalizeRecoveryInventoryEnumeration = (value: unknown): unknown => {
  if (!isRecord(value) || !Array.isArray(value.roots)) return value;
  const rootIndexes = new Map<string, number>(
    BOOK_METADATA_CANONICAL_ROOTS.map((path, index): [string, number] => [path, index]),
  );
  const paths = value.roots.map((root) => isRecord(root) && typeof root.path === 'string' ? root.path : null);
  const complete = paths.length === BOOK_METADATA_CANONICAL_ROOTS.length
    && paths.every((path): path is string => path !== null && rootIndexes.has(path))
    && new Set(paths).size === paths.length;
  if (!complete) return value;
  const roots = [...value.roots].sort((left, right) => {
    const leftPath = isRecord(left) && typeof left.path === 'string' ? left.path : '';
    const rightPath = isRecord(right) && typeof right.path === 'string' ? right.path : '';
    return (rootIndexes.get(leftPath) ?? Number.MAX_SAFE_INTEGER) - (rootIndexes.get(rightPath) ?? Number.MAX_SAFE_INTEGER);
  });
  return { ...value, roots };
};

const toDiagnostics = (entries: readonly { readonly code: string; readonly path: string; readonly message: string }[]): RecoveryRebuildDiagnostic[] => (
  entries.map((entry) => ({ code: entry.code, path: entry.path, message: entry.message }))
);

const sortedDiagnostics = (entries: readonly RecoveryRebuildDiagnostic[]): readonly RecoveryRebuildDiagnostic[] => (
  Object.freeze([...entries].sort((left, right) => compareStrings(
    `${left.path}\u0000${left.code}\u0000${left.message}`,
    `${right.path}\u0000${right.code}\u0000${right.message}`,
  )))
);

const assertSafeInput = (input: RecoveryRebuildInput): void => {
  const diagnostics: RecoveryRebuildDiagnostic[] = [];
  if (!SAFE_OPERATION_ID.test(input.recoveryOperationId)) diagnostics.push({ code: 'invalid-operation', path: '$.recoveryOperationId', message: 'Recovery operation ID is unsafe.' });
  if (typeof input.inventoryFingerprint !== 'string' || input.inventoryFingerprint.length === 0) diagnostics.push({ code: 'invalid-fingerprint', path: '$.inventoryFingerprint', message: 'The envelope-bound inventory fingerprint is required.' });
  if (input.completedProjectionKeys) {
    for (const key of input.completedProjectionKeys) {
      if (typeof key !== 'string' || key.length === 0) diagnostics.push({ code: 'invalid-completed-key', path: '$.completedProjectionKeys', message: 'Completed recovery keys must be bounded non-empty strings.' });
    }
  }
  if (diagnostics.length > 0) throw new RecoveryRebuildValidationError(diagnostics);
};

export interface ValidatedRecoveryInventory {
  readonly inventory: BookMetadataBackupInventory;
  readonly inventoryFingerprint: string;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
}

export const validateRecoveryInventory = (input: RecoveryRebuildInput): ValidatedRecoveryInventory => {
  assertSafeInput(input);
  const candidate = normalizeRecoveryInventoryEnumeration(input.inventory);
  const validation = validateBookMetadataBackupInventory(candidate, {
    expectedFirebaseProject: input.expectedFirebaseProject,
    expectedOwnerId: input.expectedOwnerId,
    availableSourceVersionIds: input.availableSourceVersionIds,
    sourceVersionAvailability: input.sourceVersionAvailability,
    sourceVersionAvailabilityEvidence: input.sourceVersionAvailabilityEvidence,
    requireExternalSourceVersionProof: true,
  });
  if (!validation.valid || !validation.inventory) {
    throw new RecoveryRebuildValidationError(toDiagnostics(validation.diagnostics));
  }
  const inventory = validation.inventory;
  const calculatedFingerprint = fingerprintBookMetadata(inventory);
  if (calculatedFingerprint !== input.inventoryFingerprint) {
    throw new RecoveryRebuildValidationError([{
      code: 'inventory-fingerprint-mismatch',
      path: '$.inventoryFingerprint',
      message: 'The validated inventory fingerprint does not match the envelope-bound identity.',
    }]);
  }

  const sourceRoot = rootRecord(inventory, 'book_source_upload_accounts');
  const retiredDeletionRoot = rootRecord(inventory, 'book_retired_byte_deletions/records');
  const availability = input.sourceVersionAvailabilityEvidence
    ?? input.sourceVersionAvailability
    ?? (input.availableSourceVersionIds
      ? Object.fromEntries([...input.availableSourceVersionIds].map((sourceVersionId) => [sourceVersionId, true]))
      : undefined);
  const sourceValidation = validateBookSourceRecoveryAuthority({
    uploadAccounts: sourceRoot ?? {},
    retiredByteDeletions: retiredDeletionRoot ?? {},
    sourceVersionIds: inventory.sourceVersionIds,
    expectedOwnerId: input.expectedOwnerId,
    availability,
    requireAvailabilityProof: true,
  });
  if (sourceValidation.diagnostics.length > 0 || sourceValidation.missingSourceVersionIds.length > 0) {
    throw new RecoveryRebuildValidationError([
      ...toDiagnostics(sourceValidation.diagnostics),
      ...sourceValidation.missingSourceVersionIds.map((sourceVersionId) => ({
        code: 'source-version-missing',
        path: `sourceVersionIds/${sourceVersionId}`,
        message: 'Source Version authority is incomplete or externally unavailable.',
      })),
    ]);
  }
  return Object.freeze({ inventory, inventoryFingerprint: calculatedFingerprint, sourceAuthorities: sourceValidation.authorities });
};

const projectionKey = (value: { readonly projectionKey: string }): string => value.projectionKey;

const phaseRecord = (
  phase: RecoveryReconciliationPhase,
  key: string,
  fingerprint: string,
  completed: ReadonlySet<string>,
): RecoveryRebuildRecord => ({
  phase,
  key,
  fingerprint,
  status: completed.has(key) ? 'completed' : 'pending',
});

const countsFor = (
  records: readonly RecoveryRebuildRecord[],
  extra: Partial<RecoveryReconciliationCounts> = {},
): RecoveryReconciliationCounts => {
  const counts = emptyRecoveryCounts();
  const completed = records.filter((record) => record.status === 'completed').length;
  return Object.freeze({
    ...counts,
    total: records.length + (extra.invalid ?? 0) + (extra.unavailable ?? 0) + (extra.externallyMissing ?? 0) + (extra.retryable ?? 0) + (extra.terminal ?? 0),
    pending: records.length - completed,
    completed,
    invalid: extra.invalid ?? 0,
    unavailable: extra.unavailable ?? 0,
    externallyMissing: extra.externallyMissing ?? 0,
    retryable: extra.retryable ?? 0,
    terminal: extra.terminal ?? 0,
  });
};

const phaseReport = (
  phase: RecoveryReconciliationPhase,
  records: readonly RecoveryRebuildRecord[],
  extra: Partial<RecoveryReconciliationCounts> = {},
): RecoveryReconciliationPhaseReport => {
  const ordered = [...records].sort((left, right) => compareStrings(left.key, right.key));
  const counts = countsFor(ordered, extra);
  return Object.freeze({
    phase,
    stableHash: stableRecoveryHash(ordered.map((record) => ({ key: record.key, fingerprint: record.fingerprint, status: record.status }))),
    counts,
  });
};

const canonicalPlanWithCompleted = (
  plan: BookMetadataRestorePlan,
  completed: ReadonlySet<string>,
): BookMetadataRestorePlan => ({
  ...plan,
  orderedWrites: Object.freeze(plan.orderedWrites.filter((write) => !completed.has(`canonical:${write.path}`))),
});

const authorityRecords = (
  authorities: ReadonlyMap<string, BookSourceRecoveryAuthority>,
  completed: ReadonlySet<string>,
): RecoveryRebuildRecord[] => [...authorities.values()]
  .sort((left, right) => compareStrings(left.sourceVersionId, right.sourceVersionId))
  .map((authority) => phaseRecord(
    'source-delivery',
    `source-authority:${authority.sourceVersionId}`,
    stableRecoveryHash({
      sourceVersionId: authority.sourceVersionId,
      bookId: authority.bookId,
      sourceKey: authority.sourceKey,
      ownerId: authority.ownerId,
      available: authority.available,
    }),
    completed,
  ));

const planProjectionRecords = (
  phase: RecoveryReconciliationPhase,
  projections: readonly { readonly projectionKey: string; readonly canonicalFingerprint?: string }[],
  completed: ReadonlySet<string>,
): RecoveryRebuildRecord[] => [...projections]
  .sort((left, right) => compareStrings(left.projectionKey, right.projectionKey))
  .map((projection) => phaseRecord(
    phase,
    projection.projectionKey,
    projection.canonicalFingerprint ?? stableRecoveryHash(projection),
    completed,
  ));

const ensureCompletedKeysKnown = (completed: ReadonlySet<string>, known: ReadonlySet<string>): void => {
  const unknown = [...completed].filter((key) => !known.has(key)).sort(compareStrings);
  if (unknown.length > 0) {
    throw new RecoveryRebuildValidationError([{
      code: 'completed-key-mismatch',
      path: '$.completedProjectionKeys',
      message: `Completed recovery key(s) are not present in the validated inventory: ${unknown.join(', ')}.`,
    }]);
  }
};

const sortedPlanDiagnostics = (
  ...diagnosticLists: readonly (readonly { readonly code: string; readonly path: string; readonly message: string }[])[]
): readonly RecoveryRebuildDiagnostic[] => sortedDiagnostics(toDiagnostics(diagnosticLists.flat()));

const assertPlanSideEffects = (
  delivery: BookDeliveryRestorePlan,
  runtime: BookRuntimeRestorePlan,
  updates: BookUpdateRestorePlan,
): void => {
  const values: Readonly<Record<string, number>> = {
    deliveryProductionWrites: delivery.productionWrites,
    runtimeProductionWrites: runtime.productionWrites,
    runtimeCommandExecutions: runtime.commandExecutions,
    runtimeScoringCalls: runtime.scoringCalls,
    runtimeGradingCalls: runtime.gradingCalls,
    runtimeCompletionWrites: runtime.completionWrites,
    runtimeNotificationWrites: runtime.notificationWrites,
    runtimeProviderOperations: runtime.providerOperations,
    updateProductionWrites: updates.productionWrites,
    updateApplications: updates.updateApplications,
    updateCheckpointWrites: updates.checkpointWrites,
    updateNotificationWrites: updates.notificationWrites,
    updateReplacementMutations: updates.replacementMutations,
    updateRevocations: updates.revocations,
    updateProviderOperations: updates.providerOperations,
    updateAuditFanOut: updates.auditFanOut,
  };
  const nonZero = Object.entries(values).filter(([, value]) => value !== 0);
  if (nonZero.length > 0) {
    throw new RecoveryRebuildValidationError([{
      code: 'side-effect-authorized',
      path: '$.recovery',
      message: `Recovery rebuild received an effect-authorizing plan: ${nonZero.map(([key, value]) => `${key}=${String(value)}`).join(', ')}.`,
    }]);
  }
};

/**
 * Build all recovery projections without invoking a persistence adapter. This
 * is the shared deterministic seam used by both independent #125 passes.
 */
export const buildRecoveryRebuildPlan = (input: RecoveryRebuildInput): RecoveryRebuildPlan => {
  const validated = validateRecoveryInventory(input);
  const completed = input.completedProjectionKeys ?? new Set<string>();
  const inventory = validated.inventory;
  const canonicalFull = prepareBookSourceRestore({
    snapshot: inventory,
    recoveryOperationId: input.recoveryOperationId,
    expectedFirebaseProject: input.expectedFirebaseProject,
    expectedOwnerId: input.expectedOwnerId,
    availableSourceVersionIds: input.availableSourceVersionIds,
    sourceVersionAvailability: input.sourceVersionAvailability,
    sourceVersionAvailabilityEvidence: input.sourceVersionAvailabilityEvidence,
    requireExternalSourceVersionProof: true,
  });
  const deliveryFull = prepareBookDeliveryRestore({
    inventory,
    inventoryFingerprint: validated.inventoryFingerprint,
    recoveryOperationId: input.recoveryOperationId,
    sourceAuthorities: validated.sourceAuthorities,
    expectedOwnerId: input.expectedOwnerId,
  });
  const runtimeFull = prepareBookRuntimeRestore({
    inventory,
    inventoryFingerprint: validated.inventoryFingerprint,
    recoveryOperationId: input.recoveryOperationId,
    sourceAuthorities: validated.sourceAuthorities,
    expectedOwnerId: input.expectedOwnerId,
  });
  const updatesFull = prepareBookUpdateRestore({
    inventory,
    inventoryFingerprint: validated.inventoryFingerprint,
    recoveryOperationId: input.recoveryOperationId,
    sourceAuthorities: validated.sourceAuthorities,
    expectedOwnerId: input.expectedOwnerId,
  });
  assertPlanSideEffects(deliveryFull, runtimeFull, updatesFull);

  const fullCanonicalKeys = canonicalFull.orderedWrites.map((write) => `canonical:${write.path}`);
  const fullSourceRecords = authorityRecords(validated.sourceAuthorities, new Set());
  const fullDeliveryRecords = planProjectionRecords('source-delivery', deliveryFull.projections, new Set());
  const fullRuntimeRecords = planProjectionRecords('runtime-results-completion', runtimeFull.projections, new Set());
  const fullUpdateRecords = planProjectionRecords('updates-checkpoints-notifications-replacement-audit', updatesFull.projections, new Set());
  const knownKeys = new Set([
    ...fullCanonicalKeys,
    ...fullSourceRecords.map((record) => record.key),
    ...fullDeliveryRecords.map((record) => record.key),
    ...fullRuntimeRecords.map((record) => record.key),
    ...fullUpdateRecords.map((record) => record.key),
  ]);
  ensureCompletedKeysKnown(completed, knownKeys);

  const canonicalAuthority = canonicalPlanWithCompleted(canonicalFull, completed);
  const delivery = rebuildBookDeliveryProjections({ plan: deliveryFull, completedProjectionKeys: completed });
  const runtime = rebuildBookRuntimeProjections({ plan: runtimeFull, completedProjectionKeys: completed });
  const updates = rebuildBookUpdateRestore({ plan: updatesFull, completedProjectionKeys: completed });

  const canonicalRecords = fullCanonicalKeys
    .sort(compareStrings)
    .map((key) => phaseRecord(
      'canonical-authority',
      key,
      stableRecoveryHash({
        path: key.slice('canonical:'.length),
        contentFingerprint: canonicalFull.orderedWrites.find((write) => `canonical:${write.path}` === key)?.data,
      }),
      completed,
    ));
  const sourceRecords = authorityRecords(validated.sourceAuthorities, completed);
  const deliveryRecords = planProjectionRecords('source-delivery', deliveryFull.projections, completed);
  const runtimeRecords = planProjectionRecords('runtime-results-completion', runtimeFull.projections, completed);
  const updateRecords = planProjectionRecords('updates-checkpoints-notifications-replacement-audit', updatesFull.projections, completed);
  const reconciliationRecord: RecoveryRebuildRecord = {
    phase: 'reconciliation-ledger-completion',
    key: 'reconciliation:ledger-completion',
    fingerprint: stableRecoveryHash({
      inventoryFingerprint: validated.inventoryFingerprint,
      sideEffects: zeroRecoverySideEffects(),
      activation: 'absent',
    }),
    status: 'pending',
  };
  const records = Object.freeze([
    ...canonicalRecords,
    ...sourceRecords,
    ...deliveryRecords,
    ...runtimeRecords,
    ...updateRecords,
    reconciliationRecord,
  ]);
  const phases = Object.freeze([
    phaseReport('canonical-authority', canonicalRecords),
    phaseReport('source-delivery', [...sourceRecords, ...deliveryRecords], {
      invalid: delivery.report.invalid,
      externallyMissing: delivery.report.externallyMissing,
      retryable: delivery.report.retryable,
      terminal: delivery.report.terminal,
    }),
    phaseReport('runtime-results-completion', runtimeRecords, {
      invalid: runtime.report.invalid,
      unavailable: runtime.report.unavailable,
      retryable: runtime.report.retryable,
      terminal: runtime.report.terminal,
    }),
    phaseReport('updates-checkpoints-notifications-replacement-audit', updateRecords, {
      invalid: updates.report.invalid,
      externallyMissing: updates.report.externallyMissing,
      retryable: updates.report.retryable,
      terminal: updates.report.terminal,
    }),
    phaseReport('reconciliation-ledger-completion', [reconciliationRecord]),
  ]);
  const diagnostics = sortedPlanDiagnostics(
    delivery.diagnostics,
    runtime.diagnostics,
    updates.diagnostics,
  );
  const sideEffects = zeroRecoverySideEffects();
  return Object.freeze({
    recoveryOperationId: input.recoveryOperationId,
    inventory,
    inventoryFingerprint: validated.inventoryFingerprint,
    canonicalAuthority,
    sourceAuthorities: validated.sourceAuthorities,
    delivery,
    runtime,
    updates,
    records,
    pendingRecordKeys: Object.freeze(records.filter((record) => record.status === 'pending').map((record) => record.key)),
    phases,
    diagnostics,
    sideEffects,
  });
};

export const rebuildRecovery = buildRecoveryRebuildPlan;

/** A compact identity for comparing two independent rebuild passes. */
export const recoveryRebuildSignature = (plan: RecoveryRebuildPlan): Readonly<{
  readonly inventoryFingerprint: string;
  readonly phaseOrder: readonly RecoveryReconciliationPhase[];
  readonly phases: readonly RecoveryReconciliationPhaseReport[];
  readonly sideEffects: RecoverySideEffectReport;
}> => ({
  inventoryFingerprint: plan.inventoryFingerprint,
  phaseOrder: RECOVERY_RECONCILIATION_PHASES,
  phases: plan.phases,
  sideEffects: plan.sideEffects,
});
