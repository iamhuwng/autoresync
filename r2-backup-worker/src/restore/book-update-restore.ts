import type { BookMetadataBackupInventory } from '../types';
import {
  isBookRedoCheckpoint,
  type BookRedoCheckpoint,
} from '../../../src/services/book-activity/bookRedoCheckpointProjection.service';
import { parseNotificationMetadata } from '../../../src/services/notificationMetadata';
import {
  createBookUpdateRecoveryAdapter,
  bookUpdateRecoveryFingerprint,
  createBookUpdateRecoveryProjection,
  rebuildBookUpdateRecoveryProjections,
  type BookUpdateRecoveryAdapter,
  type BookUpdateRecoveryDiagnostic,
  type BookUpdateRecoveryProjection,
  type BookUpdateRecoveryProjectionStore,
} from '../../../src/services/book-delivery/bookUpdate.recovery';
import type { BookSourceRecoveryAuthority } from '../../../src/services/book-source-delivery/sourceRecovery.adapter';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const HASH = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const UPDATE_STATES = new Set(['accepted', 'applying', 'committed', 'notification-pending', 'completed', 'compensating', 'compensated', 'terminal-failure']);
const REPLACEMENT_STATES = new Set(['accepted', 'staging', 'staged', 'visible', 'contexts-pending', 'awaiting-retired-byte-deletion', 'compensating', 'compensated']);
const DELETE_STATES = new Set(['queued', 'preflighted', 'delete-started', 'absence-verified', 'settled']);

export interface BookUpdateRestorePlan {
  readonly recoveryOperationId: string;
  readonly inventoryFingerprint: string;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly expectedOwnerId?: string;
  readonly projections: readonly BookUpdateRecoveryProjection[];
  readonly diagnostics: readonly BookUpdateRecoveryDiagnostic[];
  readonly report: {
    readonly restored: number;
    readonly rebuilt: number;
    readonly skippedIdempotent: number;
    readonly invalid: number;
    readonly externallyMissing: number;
    readonly retryable: number;
    readonly terminal: number;
  };
  /** Recovery never writes production update/checkpoint/notification state. */
  readonly productionWrites: 0;
  readonly updateApplications: 0;
  readonly checkpointWrites: 0;
  readonly notificationWrites: 0;
  readonly replacementMutations: 0;
  readonly revocations: 0;
  readonly providerOperations: 0;
  readonly auditFanOut: 0;
  readonly recoveryWrites: number;
}

export class BookUpdateRestoreValidationError extends Error {
  readonly name = 'BookUpdateRestoreValidationError';

  constructor(readonly diagnostics: readonly BookUpdateRecoveryDiagnostic[]) {
    super(diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join('; '));
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const rootData = (inventory: BookMetadataBackupInventory, path: string): Record<string, unknown> => {
  const root = inventory.roots.find((candidate) => candidate.path === path);
  return root?.present && isRecord(root.data) ? root.data : {};
};

const rootPresent = (inventory: BookMetadataBackupInventory, path: string): boolean => (
  inventory.roots.some((candidate) => candidate.path === path && candidate.present === true)
);

const addDiagnostic = (
  diagnostics: BookUpdateRecoveryDiagnostic[],
  diagnostic: BookUpdateRecoveryDiagnostic,
): void => {
  if (!diagnostics.some((entry) => entry.code === diagnostic.code && entry.path === diagnostic.path)) diagnostics.push(diagnostic);
};

const ownerRecords = (root: Record<string, unknown>, path: string): Array<{ readonly ownerId: string; readonly recordId: string; readonly value: Record<string, unknown> }> => {
  const records: Array<{ readonly ownerId: string; readonly recordId: string; readonly value: Record<string, unknown> }> = [];
  for (const [ownerId, ownerValue] of Object.entries(root).sort(([left], [right]) => left.localeCompare(right))) {
    if (!SAFE_ID.test(ownerId) || !isRecord(ownerValue)) continue;
    for (const [recordId, value] of Object.entries(ownerValue).sort(([left], [right]) => left.localeCompare(right))) {
      if (SAFE_ID.test(recordId) && isRecord(value)) records.push({ ownerId, recordId, value });
    }
  }
  if (records.length === 0 && Object.values(root).some(isRecord)) {
    // Some canonical roots are keyed by a domain ID first and ownerId lives in
    // the record. Accept that shape only when the record carries its identity.
    for (const [recordId, value] of Object.entries(root).sort(([left], [right]) => left.localeCompare(right))) {
      if (SAFE_ID.test(recordId) && isRecord(value) && typeof value.ownerId === 'string') {
        records.push({ ownerId: value.ownerId, recordId, value });
      }
    }
  }
  return records;
};

const findById = (value: unknown, field: string, expected: string, seen = new WeakSet<object>()): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findById(child, field, expected, seen);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (value[field] === expected) return value;
  for (const child of Object.values(value)) {
    const found = findById(child, field, expected, seen);
    if (found) return found;
  }
  return null;
};

const stringArray = (value: unknown): value is readonly string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && SAFE_ID.test(entry))
);

const validUpdateAction = (value: Record<string, unknown>, recordId: string, ownerId: string, expectedOwnerId?: string): boolean => {
  if (value.schemaVersion !== 1 || value.actionId !== recordId || value.ownerId !== ownerId
    || (expectedOwnerId !== undefined && ownerId !== expectedOwnerId)
    || typeof value.actorId !== 'string' || value.actorId !== ownerId
    || typeof value.bookId !== 'string' || !SAFE_ID.test(value.bookId)
    || typeof value.snapshotId !== 'string' || !SAFE_ID.test(value.snapshotId)
    || typeof value.snapshotFingerprint !== 'string' || !HASH.test(value.snapshotFingerprint)
    || typeof value.requestFingerprint !== 'string' || !HASH.test(value.requestFingerprint)
    || typeof value.idempotencyKey !== 'string' || !SAFE_ID.test(value.idempotencyKey)
    || typeof value.state !== 'string' || !UPDATE_STATES.has(value.state)
    || !Array.isArray(value.selections) || !isRecord(value.audit)) return false;
  const selections = value.selections;
  const selectionKeys = selections.map((selection) => isRecord(selection) && typeof selection.contextKey === 'string' && typeof selection.placementId === 'string'
    ? `${selection.contextKey}\u0000${selection.placementId}` : '');
  if (selectionKeys.some((key) => key === '') || new Set(selectionKeys).size !== selectionKeys.length) return false;
  const selectedContexts = value.audit.selectedContextKeys;
  return stringArray(selectedContexts)
    && new Set(selectedContexts).size === selectedContexts.length
    && selections.every((selection) => isRecord(selection) && selectedContexts.includes(String(selection.contextKey)))
    && typeof value.audit.checkpointCount === 'number' && Number.isSafeInteger(value.audit.checkpointCount) && value.audit.checkpointCount >= 0
    && typeof value.audit.notificationCount === 'number' && Number.isSafeInteger(value.audit.notificationCount) && value.audit.notificationCount >= 0;
};

const bookContextFromKey = (value: string): string | null => {
  const separator = value.indexOf(':');
  const contextId = separator >= 0 ? value.slice(separator + 1) : value;
  return SAFE_ID.test(contextId) ? contextId : null;
};

const asMetadata = (value: Record<string, string | number | boolean | null | readonly string[]>): Readonly<Record<string, string | number | boolean | null | readonly string[]>> => value;

const projectAudit = (input: {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly actionId: string;
  readonly sequence: number;
  readonly eventKind: string;
}): BookUpdateRecoveryProjection => createBookUpdateRecoveryProjection({
  recoveryOperationId: input.operationId,
  recordKind: 'audit',
  recordId: `audit-${input.actionId}`,
  idempotencyKey: `audit-${input.actionId}`,
  ownerId: input.ownerId,
  bookId: input.bookId,
  scopeKey: `audit-${input.actionId}`,
  metadata: asMetadata({
    auditId: `audit-${input.actionId}`,
    actionId: input.actionId,
    sequence: input.sequence,
    eventKind: input.eventKind,
    provenance: 'recovery',
    fanout: 'held',
  }),
  canonicalFingerprint: bookUpdateRecoveryFingerprint({ actionId: input.actionId, eventKind: input.eventKind, sequence: input.sequence }),
});

export const prepareBookUpdateRestore = (input: {
  readonly inventory: unknown;
  readonly inventoryFingerprint: string;
  readonly recoveryOperationId: string;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly expectedOwnerId?: string;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookUpdateRestorePlan => {
  const diagnostics: BookUpdateRecoveryDiagnostic[] = [];
  const candidates: BookUpdateRecoveryProjection[] = [];
  let invalid = 0;
  let externallyMissing = 0;
  if (!isRecord(input.inventory) || input.inventory.kind !== 'book-metadata-inventory' || !Array.isArray(input.inventory.roots)) {
    throw new BookUpdateRestoreValidationError([{ code: 'invalid-record', path: '$.inventory', message: 'Update recovery requires the validated metadata inventory.' }]);
  }
  if (!SAFE_ID.test(input.recoveryOperationId)) {
    throw new BookUpdateRestoreValidationError([{ code: 'invalid-record', path: '$.recoveryOperationId', message: 'Update recovery requires a bounded operation ID.' }]);
  }
  const inventory = input.inventory as unknown as BookMetadataBackupInventory;
  if (rootPresent(inventory, 'book_update_actions/records')) {
    const actionsRoot = rootData(inventory, 'book_update_actions/records');
    for (const { ownerId, recordId, value } of ownerRecords(actionsRoot, 'book_update_actions/records')) {
      const path = `book_update_actions/records/${ownerId}/${recordId}`;
      if (!validUpdateAction(value, recordId, ownerId, input.expectedOwnerId)) {
        invalid += 1;
        addDiagnostic(diagnostics, { code: input.expectedOwnerId !== undefined && ownerId !== input.expectedOwnerId ? 'owner-mismatch' : 'identity-mismatch', path, message: 'Book update action identity, state, selections, or audit counts are invalid.' });
        continue;
      }
      const snapshotRoot = rootData(inventory, 'book_impact_snapshots/records');
      const snapshot = findById(snapshotRoot, 'snapshotId', String(value.snapshotId));
      if (!snapshot || snapshot.ownerId !== ownerId || snapshot.bookId !== value.bookId || snapshot.inputFingerprint !== value.snapshotFingerprint) {
        invalid += 1;
        addDiagnostic(diagnostics, { code: 'identity-mismatch', path: `${path}/snapshotId`, message: 'Update action does not match its canonical impact snapshot.' });
        continue;
      }
      const selectedContexts = (value.audit as Record<string, unknown>).selectedContextKeys as readonly string[];
      const selectionCount = Array.isArray(value.selections) ? value.selections.length : 0;
      const metadata = asMetadata({
        actionState: String(value.state), actionId: recordId, snapshotId: String(value.snapshotId), snapshotFingerprint: String(value.snapshotFingerprint), requestFingerprint: String(value.requestFingerprint),
        selectedContextKeys: [...selectedContexts].sort(), selectionCount,
        checkpointCount: Number((value.audit as Record<string, unknown>).checkpointCount), notificationCount: Number((value.audit as Record<string, unknown>).notificationCount),
      });
      candidates.push(createBookUpdateRecoveryProjection({
        recoveryOperationId: input.recoveryOperationId, recordKind: 'update-action', recordId, idempotencyKey: String(value.idempotencyKey), ownerId, bookId: String(value.bookId), scopeKey: `update-${recordId}`, metadata,
        canonicalFingerprint: bookUpdateRecoveryFingerprint({ action: value, selectedContexts }),
      }));
      candidates.push(projectAudit({ operationId: input.recoveryOperationId, ownerId, bookId: String(value.bookId), actionId: recordId, sequence: candidates.length + 1, eventKind: 'update-action' }));
    }
  }

  const actionById = new Map(candidates.filter((projection) => projection.recordKind === 'update-action').map((projection) => [projection.recordId, projection]));
  if (rootPresent(inventory, 'book_update_checkpoints/records')) {
    const checkpointRoot = rootData(inventory, 'book_update_checkpoints/records');
    for (const { ownerId, recordId, value } of ownerRecords(checkpointRoot, 'book_update_checkpoints/records')) {
      const path = `book_update_checkpoints/records/${ownerId}/${recordId}`;
      if (!isBookRedoCheckpoint(value) || value.checkpointId !== recordId || value.ownerId !== ownerId || (input.expectedOwnerId !== undefined && ownerId !== input.expectedOwnerId)) {
        invalid += 1;
        addDiagnostic(diagnostics, { code: 'identity-mismatch', path, message: 'Review Checkpoint identity or owner scope is invalid.' });
        continue;
      }
      const action = actionById.get(value.actionId);
      if (!action || action.bookId !== value.bookId || action.ownerId !== ownerId) {
        invalid += 1;
        addDiagnostic(diagnostics, { code: 'context-mismatch', path, message: 'Review Checkpoint is not bound to the restored update action.' });
        continue;
      }
      candidates.push(createBookUpdateRecoveryProjection({
        recoveryOperationId: input.recoveryOperationId, recordKind: 'review-checkpoint', recordId, ownerId, bookId: value.bookId, scopeKey: `checkpoint-${recordId}`, recipientId: value.studentId, contextId: value.contextId,
        metadata: asMetadata({ checkpointId: recordId, actionId: value.actionId, contextKey: value.contextKey, contextId: value.contextId, studentId: value.studentId, oldBindingId: value.oldBindingId, oldBindingRevision: value.oldBindingRevision, activityCount: value.activities.length }),
        canonicalFingerprint: bookUpdateRecoveryFingerprint({ checkpointId: recordId, actionId: value.actionId, contextKey: value.contextKey, activityCount: value.activities.length }),
      }));
    }
  }

  if (rootPresent(inventory, 'notifications')) {
    const notificationRoot = rootData(inventory, 'notifications');
    const seenNotificationCase = new Set<string>();
    for (const [recipientId, recipientValue] of Object.entries(notificationRoot).sort(([left], [right]) => left.localeCompare(right))) {
      if (!SAFE_ID.test(recipientId) || !isRecord(recipientValue)) { invalid += 1; continue; }
      for (const [notificationId, raw] of Object.entries(recipientValue).sort(([left], [right]) => left.localeCompare(right))) {
        const path = `notifications/${recipientId}/${notificationId}`;
        if (!SAFE_ID.test(notificationId) || !isRecord(raw) || raw.id !== notificationId) { invalid += 1; addDiagnostic(diagnostics, { code: 'identity-mismatch', path, message: 'Notification identity does not match its recipient scope.' }); continue; }
        const metadataResult = parseNotificationMetadata(raw.metadata);
        if (metadataResult.kind !== 'book') { invalid += 1; addDiagnostic(diagnostics, { code: 'invalid-record', path, message: 'Only structured Book notification metadata can be held by #124.' }); continue; }
        const metadata = metadataResult.metadata;
        if (metadata.contextType !== 'book-homework' || metadata.contextId === '' || metadata.updateActionId === '') { invalid += 1; continue; }
        const action = actionById.get(metadata.updateActionId);
        if (!action || action.ownerId !== input.expectedOwnerId && input.expectedOwnerId !== undefined) { invalid += 1; addDiagnostic(diagnostics, { code: 'owner-mismatch', path, message: 'Notification action is outside the recovery owner scope.' }); continue; }
        const notificationCase = `${metadata.updateActionId}~${recipientId}~${metadata.contextId}`;
        if (seenNotificationCase.has(notificationCase)) { invalid += 1; addDiagnostic(diagnostics, { code: 'duplicate-record', path, message: 'One update action/context/recipient may stage at most one notification.' }); continue; }
        seenNotificationCase.add(notificationCase);
        candidates.push(createBookUpdateRecoveryProjection({
          recoveryOperationId: input.recoveryOperationId, recordKind: 'notification', recordId: notificationId, ownerId: action.ownerId, bookId: action.bookId, scopeKey: `notification-${recipientId}-${notificationId}`, recipientId, contextId: metadata.contextId,
          metadata: asMetadata({ notificationId, updateActionId: metadata.updateActionId, recipientId, contextId: metadata.contextId, case: metadata.actionClass, checkpointAvailable: metadata.checkpointAvailable, dispatch: 'held' }),
          canonicalFingerprint: bookUpdateRecoveryFingerprint({ notificationId, recipientId, metadata }),
        }));
      }
    }
  }

  if (rootPresent(inventory, 'book_replacement_sagas')) {
    const replacementRoot = rootData(inventory, 'book_replacement_sagas');
    for (const { ownerId, recordId, value } of ownerRecords(replacementRoot, 'book_replacement_sagas')) {
      const path = `book_replacement_sagas/${ownerId}/${recordId}`;
      if (value.schemaVersion !== 1 || value.sagaId !== recordId || value.ownerId !== ownerId || typeof value.bookId !== 'string' || !SAFE_ID.test(value.bookId) || !REPLACEMENT_STATES.has(String(value.state)) || !isRecord(value.contexts) || (input.expectedOwnerId !== undefined && ownerId !== input.expectedOwnerId)) {
        invalid += 1; addDiagnostic(diagnostics, { code: 'identity-mismatch', path, message: 'Replacement saga identity or state is invalid.' }); continue;
      }
      for (const [contextKey, contextValue] of Object.entries(value.contexts).sort(([left], [right]) => left.localeCompare(right))) {
        if (!SAFE_ID.test(contextKey) || !isRecord(contextValue) || contextValue.contextKey !== contextKey || !SAFE_ID.test(String(contextValue.operationId)) || !['pending', 'retired-revoked'].includes(String(contextValue.state))) {
          invalid += 1; addDiagnostic(diagnostics, { code: 'context-mismatch', path: `${path}/contexts/${contextKey}`, message: 'Replacement context identity is invalid.' }); continue;
        }
        const sourceVersionIds = value.sourceVersionIds;
        if (!stringArray(sourceVersionIds)) { invalid += 1; continue; }
        const unavailableSourceVersionIds = sourceVersionIds.filter(
          (sourceVersionId) => input.sourceAuthorities.get(sourceVersionId)?.available !== true,
        );
        if (unavailableSourceVersionIds.length > 0) {
          externallyMissing += 1;
          addDiagnostic(diagnostics, {
            code: 'source-unavailable',
            path: `${path}/sourceVersionIds`,
            message: 'Old source bytes remain unavailable; replacement recovery stages metadata only.',
          });
        }
        candidates.push(createBookUpdateRecoveryProjection({
          recoveryOperationId: input.recoveryOperationId, recordKind: 'replacement', recordId: `${recordId}-${contextKey}`, ownerId, bookId: String(value.bookId), scopeKey: `replacement-${recordId}-${contextKey}`,
          metadata: asMetadata({ sagaId: recordId, contextKey, contextId: bookContextFromKey(contextKey) ?? contextKey, sourceVersionIds: [], state: String(value.state), choice: 'held', oldSourceAvailable: false, mutation: 'suppressed' }),
          canonicalFingerprint: bookUpdateRecoveryFingerprint({ sagaId: recordId, contextKey, state: value.state, contextRevision: contextValue.stateRevision }),
        }));
      }
    }
  }

  if (rootPresent(inventory, 'book_retired_byte_deletions/records')) {
    const deleteRoot = rootData(inventory, 'book_retired_byte_deletions/records');
    for (const { ownerId, recordId, value } of ownerRecords(deleteRoot, 'book_retired_byte_deletions/records')) {
      const path = `book_retired_byte_deletions/records/${ownerId}/${recordId}`;
      const identity = isRecord(value.deleteIdentity) ? value.deleteIdentity : null;
      if (value.schemaVersion !== 1 || value.deletionId !== recordId || value.ownerId !== ownerId || typeof value.bookId !== 'string' || !SAFE_ID.test(value.bookId) || typeof value.sagaId !== 'string' || !SAFE_ID.test(value.sagaId) || typeof value.sourceVersionId !== 'string' || !SAFE_ID.test(value.sourceVersionId) || !DELETE_STATES.has(String(value.state)) || !identity || identity.kind !== 'retired-byte-exact-version' || identity.serviceIdentity !== 'book_retired_byte_deletion_service' || identity.deletionId !== recordId || (input.expectedOwnerId !== undefined && ownerId !== input.expectedOwnerId)) {
        invalid += 1; addDiagnostic(diagnostics, { code: 'identity-mismatch', path, message: 'Retired-byte deletion identity or state is invalid.' }); continue;
      }
      if (isRecord(value.recovery) && value.recovery.metadataOnly !== true) { invalid += 1; addDiagnostic(diagnostics, { code: 'invalid-record', path: `${path}/recovery`, message: 'Recovery delete metadata must remain metadata-only.' }); continue; }
      candidates.push(createBookUpdateRecoveryProjection({
        recoveryOperationId: input.recoveryOperationId, recordKind: 'delete', recordId, ownerId, bookId: String(value.bookId), scopeKey: `delete-${recordId}`,
        metadata: asMetadata({ deletionId: recordId, sagaId: String(value.sagaId), state: String(value.state), deleteIdentityKind: 'retired-byte-exact-version' }),
        canonicalFingerprint: bookUpdateRecoveryFingerprint({ deletionId: recordId, sourceVersionId: value.sourceVersionId, state: value.state }),
      }));
      const contextPins = Array.isArray(value.contextPins) ? value.contextPins : [];
      for (const [index, contextPin] of contextPins.entries()) {
        if (!isRecord(contextPin) || typeof contextPin.contextKey !== 'string' || !SAFE_ID.test(contextPin.contextKey) || !stringArray(contextPin.sourceVersionIds)) { invalid += 1; continue; }
        candidates.push(createBookUpdateRecoveryProjection({
          recoveryOperationId: input.recoveryOperationId, recordKind: 'revocation', recordId: `${recordId}-${index}`, ownerId, bookId: String(value.bookId), scopeKey: `revocation-${recordId}-${contextPin.contextKey}`,
          metadata: asMetadata({ sagaId: String(value.sagaId), contextKey: contextPin.contextKey, contextId: bookContextFromKey(contextPin.contextKey) ?? contextPin.contextKey, bindingIds: [], status: 'revoked-held', mutation: 'suppressed' }),
          canonicalFingerprint: bookUpdateRecoveryFingerprint({ deletionId: recordId, contextKey: contextPin.contextKey, operationId: contextPin.operationId }),
        }));
      }
    }
  }

  const rebuilt = rebuildBookUpdateRecoveryProjections({ recoveryContext: { recoveryOperationId: input.recoveryOperationId, phase: 'rebuilding' }, projections: candidates, completedProjectionKeys: input.completedProjectionKeys });
  const report = { ...rebuilt.report, invalid: rebuilt.report.invalid + invalid, externallyMissing: rebuilt.report.externallyMissing + externallyMissing, restored: 0 };
  return Object.freeze({
    recoveryOperationId: input.recoveryOperationId, inventoryFingerprint: input.inventoryFingerprint, sourceAuthorities: input.sourceAuthorities, expectedOwnerId: input.expectedOwnerId,
    projections: rebuilt.projections, diagnostics: Object.freeze([...diagnostics, ...rebuilt.diagnostics]), report: Object.freeze(report),
    productionWrites: 0, updateApplications: 0, checkpointWrites: 0, notificationWrites: 0, replacementMutations: 0, revocations: 0, providerOperations: 0, auditFanOut: 0, recoveryWrites: 0,
  });
};

export const rebuildBookUpdateRestore = (input: { readonly plan: BookUpdateRestorePlan; readonly completedProjectionKeys?: ReadonlySet<string> }): BookUpdateRestorePlan => {
  if (input.plan.productionWrites !== 0 || input.plan.updateApplications !== 0 || input.plan.checkpointWrites !== 0 || input.plan.notificationWrites !== 0 || input.plan.replacementMutations !== 0 || input.plan.revocations !== 0 || input.plan.providerOperations !== 0 || input.plan.auditFanOut !== 0) throw new BookUpdateRestoreValidationError([{ code: 'invalid-record', path: '$.plan', message: 'Update recovery cannot authorize production side effects.' }]);
  if (!input.completedProjectionKeys || input.completedProjectionKeys.size === 0) return input.plan;
  const result = rebuildBookUpdateRecoveryProjections({ recoveryContext: { recoveryOperationId: input.plan.recoveryOperationId, phase: 'rebuilding' }, projections: input.plan.projections, completedProjectionKeys: input.completedProjectionKeys });
  return Object.freeze({ ...input.plan, projections: result.projections, diagnostics: Object.freeze([...input.plan.diagnostics, ...result.diagnostics]), report: Object.freeze({ ...input.plan.report, rebuilt: result.report.rebuilt, skippedIdempotent: input.plan.report.skippedIdempotent + result.report.skippedIdempotent }) });
};

export const persistBookUpdateRecovery = async (input: { readonly plan: BookUpdateRestorePlan; readonly adapter: BookUpdateRecoveryAdapter }): Promise<BookUpdateRestorePlan> => {
  if (input.plan.productionWrites !== 0) throw new BookUpdateRestoreValidationError([{ code: 'invalid-record', path: '$.plan.productionWrites', message: 'Recovery update persistence cannot authorize production writes.' }]);
  const result = await input.adapter.rebuild({ projections: input.plan.projections });
  return Object.freeze({ ...input.plan, projections: result.projections, diagnostics: Object.freeze([...input.plan.diagnostics, ...result.diagnostics]), report: Object.freeze({ ...input.plan.report, restored: result.report.rebuilt, rebuilt: result.report.rebuilt, skippedIdempotent: input.plan.report.skippedIdempotent + result.report.skippedIdempotent }), recoveryWrites: result.report.rebuilt });
};

export { createBookUpdateRecoveryAdapter };
export type { BookUpdateRecoveryProjectionStore };
