import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, describe, it } from 'vitest';
import { createBookRuntimeRecoveryAdapter, createBookRuntimeRecoveryProjection, InMemoryBookRuntimeRecoveryProjectionStore } from '../services/book-activity/bookRuntime.recovery';
import { createBookUpdateRecoveryAdapter, createBookUpdateRecoveryProjection, InMemoryBookUpdateRecoveryProjectionStore } from '../services/book-delivery/bookUpdate.recovery';
import { createBookContextAdapterRegistry } from '../services/book-delivery/bookContextAdapterRegistry.service';
import { validateBookSourceRecoveryAuthority } from '../services/book-source-delivery/sourceRecovery.adapter';
import type { BookSourceUploadAccountState, BookSourceVersionStorageIdentity } from '../types/bookSource.types';
import { createContentCatalog, type ContentCatalogBookRecord, type ContentCatalogRepository } from '../services/materialCatalog/contentCatalog.service';
import { assertMaterialSummary } from '../services/materialCatalog/materialSummaryPort.service';
import { createLegacyTestMaterialSummary } from '../services/materialCatalog/legacyTestMaterialSummary.service';

const adapterDeclaration = {
  adapterId: 'public-reference-v1',
  adapterVersion: 1,
  contextKind: 'public-reference',
  contractVersion: 1,
  input: { version: 1, immutable: true, requiredFields: ['frozen-placement-binding', 'book-impact-classification'] },
  classification: { version: 1, supportedEffects: ['unchanged', 'invalidation', 'successor'] },
  sourceReplacement: { version: 1, mode: 'invalidation-only', automaticUpdate: false },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 1 },
} as const;

const metadataOnlyBook: ContentCatalogBookRecord = {
  bookId: 'book-legacy-1',
  title: 'Legacy metadata-only Book',
  publicTree: false,
  publication: 'trusted',
  source: 'blocked',
  capabilities: { preview: true, launch: true, sourceAssisted: false },
  nodes: [{
    nodeId: 'unit-legacy-1',
    parentNodeId: null,
    kind: 'unit',
    title: 'Legacy Unit',
    order: 1,
    activities: [],
  }],
};

const storageIdentity = (sourceVersionId = 'source-legacy-1'): BookSourceVersionStorageIdentity => ({
  bookId: 'book-legacy-1',
  sourceVersionId,
  storageLocationId: 'location-legacy-1',
  providerKind: 'b2',
  privateBucketId: 'bucket-legacy-1',
  providerObjectKey: `private/book-legacy-1/${sourceVersionId}.pdf`,
  providerFileId: 'file-legacy-1',
  providerFileVersionId: 'version-legacy-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  byteSize: 10,
});

const uploadAccount = (): BookSourceUploadAccountState => {
  const identity = storageIdentity();
  return {
    revision: 1,
    capacity: {
      trackedAccountBytes: 10,
      temporaryBytes: 0,
      providerReconciliation: {
        status: 'healthy',
        totalBytes: 10,
        objectCount: 1,
        completedAt: '2026-08-11T00:01:00.000Z',
      },
    },
    operations: {
      'reservation-legacy-1': {
        reservationId: 'reservation-legacy-1',
        bookId: identity.bookId,
        sourceVersionId: identity.sourceVersionId,
        sourceKey: 'full',
        ownerId: 'teacher-legacy-1',
        storageLocationId: identity.storageLocationId,
        providerKind: identity.providerKind,
        privateBucketId: identity.privateBucketId,
        providerObjectKey: identity.providerObjectKey,
        kind: 'initial',
        byteSize: identity.byteSize,
        originalFilename: 'legacy.pdf',
        expectedChecksum: identity.checksum,
        createdAt: '2026-08-11T00:00:00.000Z',
        expiresAt: '2026-08-11T00:05:00.000Z',
        status: 'verified_completed',
        verifiedStorage: identity,
        completedAt: '2026-08-11T00:01:00.000Z',
      },
    },
  };
};

const runtimeProjection = createBookRuntimeRecoveryProjection({
  recoveryOperationId: 'recovery-legacy-1',
  recordKind: 'submission',
  recordId: 'attempt-legacy-1',
  idempotencyKey: 'operation-legacy-1',
  recipientId: 'student-legacy-1',
  contextId: 'homework-legacy-1',
  contextKind: 'homework',
  ownerId: 'teacher-legacy-1',
  bindingId: 'binding-legacy-1',
  bindingRevision: 1,
  placementId: 'placement-legacy-1',
  activityId: 'activity-legacy-1',
  activityVersion: 1,
  activityVersionId: 'activity-legacy-1-v1',
  interactionId: 'interaction-legacy-1',
  feedbackPolicy: 'after-review',
  sourceProvenance: [{ sourceKey: 'full', sourceVersionId: 'source-legacy-1', pages: [1] }],
  metadata: {
    attemptId: 'attempt-legacy-1',
    status: 'submitted',
    feedbackRelease: 'pending',
    operationId: 'operation-legacy-1',
  },
  canonicalFingerprint: 'fnv1a64:legacy-recovery-1',
});

describe('PRD0062 AC-LR-001 legacy, metadata-only, and deterministic recovery', () => {
  it('runs the one campaign-owned two-pass recovery and writes only a scoped evidence artifact', async () => {
    const legacySummary = createLegacyTestMaterialSummary('legacy-material-1', {
      ownerId: 'teacher-legacy-1',
      title: 'Legacy Grammar Material',
      skill: 'IELTS',
      testType: 'generic-test',
      isPublic: true,
      questions: [{ id: 'question-1' }],
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    expect(() => assertMaterialSummary(legacySummary)).not.toThrow();
    expect(legacySummary.lifecycleState).toBe('active');
    expect(createLegacyTestMaterialSummary('legacy-material-1', {
      ownerId: 'teacher-legacy-1',
      title: 'Legacy Grammar Material',
      updatedAt: '2026-08-11T00:00:00.000Z',
    }, 'removed').lifecycleState).toBe('removed');

    const repository: ContentCatalogRepository = {
      listPublicBooks: async () => [metadataOnlyBook],
      readPublicBook: async () => metadataOnlyBook,
      resolveEntitlement: async () => 'active',
    };
    const catalog = createContentCatalog({
      repository,
      adapterRegistry: createBookContextAdapterRegistry([adapterDeclaration]),
      adapterId: adapterDeclaration.adapterId,
    });
    const metadataSelection = await catalog.resolveSelection(
      { kind: 'book', bookId: metadataOnlyBook.bookId },
      { actorId: 'teacher-legacy-1' },
    );
    expect(metadataSelection.state).toBe('metadata-only');
    const metadataPreview = await catalog.resolveSelection(
      { kind: 'book', bookId: metadataOnlyBook.bookId },
      { actorId: 'teacher-legacy-1', intent: 'preview' },
    );
    expect(metadataPreview).toMatchObject({
      state: 'metadata-only',
      readiness: { source: 'blocked' },
      capabilities: { preview: true, sourceAssisted: false },
    });
    expect(metadataPreview.state).not.toBe('playable');
    expect(JSON.stringify(metadataSelection)).not.toMatch(/provider|objectKey|answerKey|pdf|bytes/iu);
    expect(JSON.stringify(metadataPreview)).not.toMatch(/provider|objectKey|answerKey|pdf|bytes/iu);

    const available = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-legacy-1': uploadAccount() },
      sourceVersionIds: ['source-legacy-1'],
      expectedOwnerId: 'teacher-legacy-1',
      availability: { 'source-legacy-1': { available: true, identity: storageIdentity() } },
    });
    expect(available.missingSourceVersionIds).toEqual([]);
    expect(available.authorities.get('source-legacy-1')?.storage).toEqual(storageIdentity());
    const unavailable = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-legacy-1': uploadAccount() },
      sourceVersionIds: ['source-legacy-1'],
      expectedOwnerId: 'teacher-legacy-1',
      availability: { 'source-legacy-1': false },
    });
    expect(unavailable.missingSourceVersionIds).toEqual(['source-legacy-1']);
    expect(unavailable.authorities.get('source-legacy-1')?.available).toBe(false);

    const runtimeStore = new InMemoryBookRuntimeRecoveryProjectionStore();
    const runtimeAdapter = createBookRuntimeRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-legacy-1', phase: 'rebuilding' },
      store: runtimeStore,
    });
    await expect(runtimeAdapter.rebuild({ projections: [runtimeProjection] }))
      .resolves.toMatchObject({ report: { restored: 1, rebuilt: 1, skippedIdempotent: 0 } });
    await expect(runtimeAdapter.rebuild({ projections: [runtimeProjection] }))
      .resolves.toMatchObject({ report: { restored: 0, rebuilt: 1, skippedIdempotent: 1 } });
    expect(await runtimeStore.readHold({ recipientId: 'student-legacy-1', contextId: 'homework-legacy-1' }))
      .toMatchObject({ deliveryState: 'unavailable', readDenied: true });

    const updateProjection = createBookUpdateRecoveryProjection({
      recoveryOperationId: 'recovery-legacy-1',
      recordKind: 'notification',
      recordId: 'notification-legacy-1',
      ownerId: 'teacher-legacy-1',
      bookId: 'book-legacy-1',
      scopeKey: 'notification-legacy-1',
      recipientId: 'student-legacy-1',
      contextId: 'homework-legacy-1',
      metadata: {
        notificationId: 'notification-legacy-1',
        updateActionId: 'action-legacy-1',
        recipientId: 'student-legacy-1',
        contextId: 'homework-legacy-1',
        case: 'review-checkpoint',
        checkpointAvailable: true,
        dispatch: 'held',
      },
      canonicalFingerprint: 'fnv1a64:legacy-notification-1',
    });
    const updateStore = new InMemoryBookUpdateRecoveryProjectionStore();
    const updateAdapter = createBookUpdateRecoveryAdapter({
      context: { recoveryOperationId: 'recovery-legacy-1', phase: 'rebuilding' },
      store: updateStore,
    });
    await expect(updateAdapter.rebuild({ projections: [updateProjection] }))
      .resolves.toMatchObject({ report: { rebuilt: 1, skippedIdempotent: 0 } });
    await expect(updateAdapter.rebuild({ projections: [updateProjection] }))
      .resolves.toMatchObject({ report: { rebuilt: 0, skippedIdempotent: 1 } });

    const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
    const artifactDirectory = path.resolve(`artifacts/prd0062-acceptance/AC-LR-001/${executionId}`);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(path.join(artifactDirectory, 'result.json'), JSON.stringify({
      caseId: 'AC-LR-001',
      status: 'PASS_LOCAL_RECOVERY_ASSERTIONS',
      proof: [
        'legacy Mode 1 summary and removed tombstone',
        'metadata-only preview remains source-blocked and non-launchable',
        'source identity and explicit availability fencing without PDF bytes',
        'runtime and update recovery replay/idempotency with held unavailable rows',
      ],
      baselineIdentical118Cases: [
        'LEGACY-118-MATERIAL-CATALOG-SUMMARY',
        'LEGACY-118-READING-V2-SOFT-REMOVE-WITHOUT-CLEANUP',
        'LEGACY-118-READING-V2-THIN-MASTER-SOFT-REMOVE',
      ],
      readingV2: 'read-only evidence classification only; no Reading V2 source or test changes',
      activation: 'not claimed; this local fixture neither authorizes nor proves production activation',
    }, null, 2));
  });
});
