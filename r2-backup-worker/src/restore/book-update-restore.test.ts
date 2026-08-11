import { describe, expect, it } from 'vitest';
import { prepareBookUpdateRestore } from './book-update-restore';

const ownerId = 'teacher-1';
const bookId = 'book-1';
const actionId = 'action-1';
const snapshotFingerprint = 'snapshot-fingerprint-1';

const root = (path: string, data: Record<string, unknown>) => ({
  path,
  order: 1,
  required: true as const,
  schemaVersion: 1 as const,
  present: true as const,
  restoreDisposition: 'delegated-validation-only' as const,
  delegatedOwner: '#124' as const,
  data,
  entityCount: Object.keys(data).length,
  contentFingerprint: `fingerprint-${path.replace(/[^A-Za-z0-9]/gu, '-')}`,
});

const inventory = (roots: readonly ReturnType<typeof root>[]) => ({
  kind: 'book-metadata-inventory' as const,
  inventoryVersion: 'prd0062-48b-v2' as const,
  schemaVersion: 1 as const,
  backupId: 'backup-1',
  firebaseProject: 'project-1',
  generatedAt: '2026-08-11T00:00:00.000Z',
  bytePolicy: 'metadata-only' as const,
  pdfBodyReads: 0 as const,
  pdfBodyWrites: 0 as const,
  pdfBodyBytes: 0 as const,
  rootCount: roots.length,
  roots,
  sourceVersionIds: ['source-old-1'],
  audit: { bounded: true as const, provenance: ['#124'] },
});

const updateAction = {
  schemaVersion: 1,
  actionId,
  ownerId,
  actorId: ownerId,
  bookId,
  snapshotId: 'snapshot-1',
  snapshotFingerprint,
  requestFingerprint: 'request-fingerprint-1',
  idempotencyKey: 'action-idempotency-1',
  state: 'committed',
  selections: [{ contextKey: 'homework:hw-1', placementId: 'placement-1', choice: 'redo' }],
  audit: {
    selectedContextKeys: ['homework:hw-1'],
    checkpointCount: 1,
    notificationCount: 1,
  },
};

const checkpointId = `${actionId}:homework:hw-1:student-1`;

const checkpoint = {
  schemaVersion: 1,
  checkpointId,
  actionId,
  ownerId,
  bookId,
  contextKey: 'homework:hw-1',
  contextId: 'hw-1',
  studentId: 'student-1',
  oldBindingId: 'binding-1',
  oldBindingRevision: 3,
  status: 'review-only',
  reason: 'book update recovery',
  activities: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    oldActivityVersionId: 'activity-version-1',
    oldSourceVersionIds: ['source-old-1'],
    priorStatus: 'submitted',
    priorAnswer: 'must not be copied into a projection',
    feedbackRelease: 'hidden',
  }],
  auditContext: {
    actionId,
    contextKey: 'homework:hw-1',
    contextId: 'hw-1',
    studentId: 'student-1',
    oldBindingId: 'binding-1',
    oldBindingRevision: 3,
    reason: 'book update recovery',
  },
  createdAt: '2026-08-11T00:00:00.000Z',
};

describe('Book update restore adapter', () => {
  it('validates exact action/checkpoint/recipient identities and stages held metadata only', () => {
    const result = prepareBookUpdateRestore({
      inventory: inventory([
        root('book_update_actions/records', { [ownerId]: { [actionId]: updateAction } }),
        root('book_impact_snapshots/records', { [ownerId]: { 'snapshot-1': {
          snapshotId: 'snapshot-1', ownerId, bookId, inputFingerprint: snapshotFingerprint,
        } } }),
        root('book_update_checkpoints/records', { [ownerId]: { [checkpointId]: checkpoint } }),
        root('notifications', { 'student-1': { 'notification-1': {
          id: 'notification-1',
          metadata: {
            schemaVersion: 1,
            kind: 'book',
            contextType: 'book-homework',
            contextId: 'hw-1',
            updateActionId: actionId,
            checkpointAvailable: true,
            deadlineClass: 'none',
            actionClass: 'review',
          },
        } } }),
        root('book_replacement_sagas', { [ownerId]: { 'saga-1': {
          schemaVersion: 1,
          sagaId: 'saga-1',
          ownerId,
          bookId,
          sourceVersionIds: ['source-old-1'],
          state: 'contexts-pending',
          contexts: { 'homework:hw-1': {
            contextKey: 'homework:hw-1', operationId: 'saga-operation-1', state: 'pending', stateRevision: 1,
          } },
        } } }),
        root('book_retired_byte_deletions/records', { [ownerId]: { 'delete-1': {
          schemaVersion: 1,
          deletionId: 'delete-1',
          ownerId,
          bookId,
          sagaId: 'saga-1',
          sourceVersionId: 'source-old-1',
          state: 'queued',
          deleteIdentity: {
            kind: 'retired-byte-exact-version',
            serviceIdentity: 'book_retired_byte_deletion_service',
            deletionId: 'delete-1',
          },
          recovery: { metadataOnly: true },
          contextPins: [{
            contextKey: 'homework:hw-1',
            operationId: 'saga-operation-1',
            sourceVersionIds: ['source-old-1'],
          }],
        } } }),
      ]),
      inventoryFingerprint: 'inventory-fingerprint-1',
      recoveryOperationId: 'recovery-124',
      sourceAuthorities: new Map(),
      expectedOwnerId: ownerId,
    });

    expect(result.report).toMatchObject({ invalid: 0, externallyMissing: 1, retryable: 0, terminal: 0 });
    expect(result.productionWrites).toBe(0);
    expect(result.updateApplications).toBe(0);
    expect(result.checkpointWrites).toBe(0);
    expect(result.notificationWrites).toBe(0);
    expect(result.replacementMutations).toBe(0);
    expect(result.revocations).toBe(0);
    expect(result.providerOperations).toBe(0);
    expect(result.auditFanOut).toBe(0);
    expect(result.projections.map((projection) => projection.recordKind)).toEqual(expect.arrayContaining([
      'update-action', 'audit', 'review-checkpoint', 'notification', 'replacement', 'delete', 'revocation',
    ]));
    expect(result.projections.every((projection) => (
      projection.state === 'held'
      && projection.deliveryState === 'unavailable'
      && projection.readDenied === true
      && projection.activation === 'held-for-reconciliation'
    ))).toBe(true);
    expect(JSON.stringify(result.projections)).not.toContain('must not be copied');
    expect(JSON.stringify(result.projections)).not.toContain('source-old-1');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-unavailable' }),
    ]));
  });

  it('rejects wrong-owner and wrong-action checkpoint/notification records without broadening scope', () => {
    const result = prepareBookUpdateRestore({
      inventory: inventory([
        root('book_update_actions/records', { [ownerId]: { [actionId]: updateAction } }),
        root('book_impact_snapshots/records', { [ownerId]: { 'snapshot-1': {
          snapshotId: 'snapshot-1', ownerId, bookId, inputFingerprint: snapshotFingerprint,
        } } }),
        root('book_update_checkpoints/records', { 'other-owner': { [checkpointId]: { ...checkpoint, ownerId: 'other-owner' } } }),
        root('notifications', { 'student-2': { 'notification-2': {
          id: 'notification-2',
          metadata: {
            schemaVersion: 1, kind: 'book', contextType: 'book-homework', contextId: 'hw-2',
            updateActionId: 'other-action', checkpointAvailable: false, deadlineClass: 'none', actionClass: 'open',
          },
        } } }),
      ]),
      inventoryFingerprint: 'inventory-fingerprint-1',
      recoveryOperationId: 'recovery-124',
      sourceAuthorities: new Map(),
      expectedOwnerId: ownerId,
    });
    expect(result.projections.filter((projection) => projection.recordKind === 'review-checkpoint')).toHaveLength(0);
    expect(result.projections.filter((projection) => projection.recordKind === 'notification')).toHaveLength(0);
    expect(result.report.invalid).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'owner-mismatch' }),
    ]));
  });
});
