import { describe, expect, it } from 'vitest';

import {
  BOOK_METADATA_CANONICAL_ROOTS,
  BOOK_METADATA_ROOT_COUNT,
  buildBookMetadataRestorePreview,
  createBookMetadataBackupInventory,
  fingerprintBookMetadata,
  prepareBookSourceRestore,
  restoreBookMetadataRoots,
  validateBookMetadataBackupInventory,
} from './book-source-restore';

const emptyCaptures = (presentPath?: string, data: Record<string, unknown> = {}) => (
  BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
    path,
    present: path === presentPath,
    data: path === presentPath ? data : {},
  }))
);

const makeInventory = (presentPath?: string, data: Record<string, unknown> = {}) => (
  createBookMetadataBackupInventory({
    backupId: 'BK-120',
    firebaseProject: 'project-120',
    generatedAt: '2026-08-11T00:00:00.000Z',
    roots: emptyCaptures(presentPath, data),
  })
);

const makeVerifiedSourceInventory = () => createBookMetadataBackupInventory({
  backupId: 'BK-120-source-proof',
  firebaseProject: 'project-120',
  generatedAt: '2026-08-11T00:00:00.000Z',
  roots: BOOK_METADATA_CANONICAL_ROOTS.map((path) => {
    if (path === 'book_delivery/current') {
      return {
        path,
        present: true,
        data: {
          'binding-1': {
            bindingId: 'binding-1',
            bookId: 'book-1',
            ownerId: 'teacher-1',
            sourceVersionId: 'source-1',
            revision: 1,
          },
        },
      };
    }
    if (path === 'material_catalog/books') {
      return {
        path,
        present: true,
        data: {
          'book-1': { bookId: 'book-1', ownerId: 'teacher-1', revision: 1 },
        },
      };
    }
    if (path === 'book_source_upload_accounts') {
      const storage = {
        bookId: 'book-1',
        sourceVersionId: 'source-1',
        storageLocationId: 'location-1',
        providerKind: 'b2',
        privateBucketId: 'bucket-1',
        providerObjectKey: 'private/book-1/source-1.pdf',
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        byteSize: 10,
      };
      return {
        path,
        present: true,
        data: {
          'account-1': {
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
              'reservation-1': {
                reservationId: 'reservation-1',
                bookId: 'book-1',
                sourceVersionId: 'source-1',
                sourceKey: 'unit-1',
                ownerId: 'teacher-1',
                storageLocationId: 'location-1',
                providerKind: 'b2',
                privateBucketId: 'bucket-1',
                providerObjectKey: 'private/book-1/source-1.pdf',
                kind: 'initial',
                byteSize: 10,
                originalFilename: 'lesson.pdf',
                expectedChecksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
                createdAt: '2026-08-11T00:00:00.000Z',
                expiresAt: '2026-08-11T00:05:00.000Z',
                status: 'verified_completed',
                verifiedStorage: storage,
                completedAt: '2026-08-11T00:01:00.000Z',
              },
            },
          },
        },
      };
    }
    return { path, present: false, data: {} };
  }),
});

describe('Book metadata backup/restore inventory', () => {
  it('is explicit, ordered, exhaustive, and metadata-only', () => {
    const inventory = makeInventory('book_delivery/current', {
      revision: 3,
    });

    expect(inventory.rootCount).toBe(BOOK_METADATA_ROOT_COUNT);
    expect(inventory.roots.map((root) => root.path)).toEqual([...BOOK_METADATA_CANONICAL_ROOTS]);
    expect(inventory.roots.map((root) => root.order)).toEqual(
      [...BOOK_METADATA_CANONICAL_ROOTS.keys()],
    );
    expect(inventory.roots.every((root) => !root.path.includes('*') && !root.path.includes('$'))).toBe(true);
    expect(inventory.bytePolicy).toBe('metadata-only');
    expect(inventory.pdfBodyReads).toBe(0);
    expect(inventory.pdfBodyWrites).toBe(0);
    expect(inventory.pdfBodyBytes).toBe(0);
    expect(validateBookMetadataBackupInventory(inventory).valid).toBe(true);
  });

  it('inventories the #121 recovery ledger roots with stable count and fingerprints', () => {
    const inventory = makeInventory('book_recovery/operations', {
      operationId: 'operation-121',
      state: 'previewed',
      stateRevision: 0,
    });
    const paths = inventory.roots.map((root) => root.path);
    const recoveryOperation = inventory.roots.find((root) => root.path === 'book_recovery/operations');
    const recoveryIndex = inventory.roots.find((root) => root.path === 'book_recovery/indexes/by_snapshot_idempotency');

    expect(inventory.inventoryVersion).toBe('prd0062-48b-v2');
    expect(BOOK_METADATA_ROOT_COUNT).toBe(69);
    expect(inventory.rootCount).toBe(BOOK_METADATA_ROOT_COUNT);
    expect(paths.slice(-3)).toEqual([
      'book_recovery/operations',
      'book_recovery/indexes/by_snapshot_idempotency',
      'notifications',
    ]);
    expect(recoveryOperation?.contentFingerprint).toBe(
      fingerprintBookMetadata(recoveryOperation?.data),
    );
    expect(recoveryIndex?.contentFingerprint).toBe(
      fingerprintBookMetadata(recoveryIndex?.data),
    );
    expect(validateBookMetadataBackupInventory(inventory).valid).toBe(true);

    const incompleteV1 = { ...inventory, inventoryVersion: 'prd0062-48b-v1' };
    const incompleteResult = validateBookMetadataBackupInventory(incompleteV1);
    expect(incompleteResult.valid).toBe(false);
    expect(incompleteResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-version' }),
    ]));
  });

  it('denies an omitted root and a body-payload field before planning writes', () => {
    const inventory = makeInventory();
    const omitted = JSON.parse(JSON.stringify(inventory)) as { roots: unknown[]; rootCount: number };
    omitted.roots = omitted.roots.slice(1);
    omitted.rootCount -= 1;
    const omittedResult = validateBookMetadataBackupInventory(omitted);
    expect(omittedResult.valid).toBe(false);
    expect(omittedResult.diagnostics.some((entry) => entry.code === 'missing-required-root')).toBe(true);

    const withBody = JSON.parse(JSON.stringify(inventory)) as {
      roots: Array<{ data: Record<string, unknown>; contentFingerprint: string }>;
    };
    withBody.roots[0].data.pdfBytes = 'must-not-be-backed-up';
    const bodyResult = validateBookMetadataBackupInventory(withBody);
    expect(bodyResult.valid).toBe(false);
    expect(bodyResult.diagnostics.some((entry) => entry.code === 'pdf-body-field')).toBe(true);
  });

  it('reports an unavailable external Source Version exactly and remains write-free', () => {
    const inventory = JSON.parse(JSON.stringify(makeInventory())) as {
      roots: Array<{ path: string; data: Record<string, unknown>; contentFingerprint: string }>;
      sourceVersionIds: string[];
    };
    const deliveryRoot = inventory.roots.find((root) => root.path === 'book_delivery/current')!;
    deliveryRoot.data = {
      bookId: 'book-1',
      ownerId: 'owner-1',
      sourceVersionId: 'source-1',
    };
    deliveryRoot.contentFingerprint = fingerprintBookMetadata(deliveryRoot.data);
    inventory.sourceVersionIds = ['source-1'];

    expect(() => prepareBookSourceRestore({ snapshot: inventory })).toThrow(/source-1/);
    const result = validateBookMetadataBackupInventory(inventory);
    expect(result.missingSourceVersionIds).toEqual(['source-1']);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-version-missing', path: expect.stringContaining('source-1') }),
    ]));
  });

  it('requires explicit external Source Version proof and accepts complete true proof only', () => {
    const inventory = makeVerifiedSourceInventory();
    const currentRoots = BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
      path,
      etag: `etag:${path}`,
      revision: 1,
    }));

    const noProof = validateBookMetadataBackupInventory(inventory);
    expect(noProof.valid).toBe(false);
    expect(noProof.missingSourceVersionIds).toEqual(['source-1']);
    expect(noProof.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'availability-proof-missing', path: expect.stringContaining('source-1') }),
    ]));
    expect(buildBookMetadataRestorePreview(inventory, 'BK-120-source-proof', currentRoots).allowed).toBe(false);
    expect(buildBookMetadataRestorePreview(inventory, 'BK-120-source-proof', currentRoots, {
      requireExternalSourceVersionProof: false,
    }).allowed).toBe(false);

    const partialProof = validateBookMetadataBackupInventory(inventory, {
      sourceVersionAvailability: { 'other-source': true },
    });
    expect(partialProof.valid).toBe(false);
    expect(partialProof.missingSourceVersionIds).toEqual(['source-1']);
    expect(partialProof.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-version-missing', path: expect.stringContaining('source-1') }),
    ]));

    const falseProof = validateBookMetadataBackupInventory(inventory, {
      sourceVersionAvailability: { 'source-1': false },
    });
    expect(falseProof.valid).toBe(false);
    expect(falseProof.missingSourceVersionIds).toEqual(['source-1']);

    const completeProof = validateBookMetadataBackupInventory(inventory, {
      sourceVersionAvailability: { 'source-1': true },
    });
    expect(completeProof.valid).toBe(true);
    expect(buildBookMetadataRestorePreview(inventory, 'BK-120-source-proof', currentRoots, {
      sourceVersionAvailability: { 'source-1': true },
    }).allowed).toBe(true);

    const recoveryPlan = prepareBookSourceRestore({
      snapshot: inventory,
      sourceVersionAvailability: { 'source-1': true },
      recoveryOperationId: 'recovery-122',
    });
    expect(recoveryPlan.orderedWrites.map((write) => write.path)).not.toContain('book_delivery/current');
    expect(recoveryPlan.orderedWrites.map((write) => write.path)).not.toContain('book_delivery/records');
  });

  it('captures and fences shared notifications but never includes them in restore writes', async () => {
    const inventory = createBookMetadataBackupInventory({
      backupId: 'BK-120-notifications',
      firebaseProject: 'project-120',
      generatedAt: '2026-08-11T00:00:00.000Z',
      roots: BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
        path,
        present: path === 'notifications',
        data: path === 'notifications' ? {
          'recipient-1': {
            'operation-1': {
              id: 'operation-1',
              type: 'info',
              title: 'Book update',
              message: 'A Book update is available.',
              read: false,
              createdAt: 1,
              metadata: {
                schemaVersion: 1,
                kind: 'book',
                contextType: 'book',
                contextId: 'book-1',
                updateActionId: 'action-1',
                checkpointAvailable: true,
                deadlineClass: 'none',
                actionClass: 'open',
              },
            },
          },
        } : {},
      })),
    });
    const plan = prepareBookSourceRestore({ snapshot: inventory });
    expect(inventory.roots.find((root) => root.path === 'notifications')).toMatchObject({
      restoreDisposition: 'delegated-validation-only',
      delegatedOwner: '#124',
    });
    expect(plan.delegatedRoots).toEqual(['notifications']);
    expect(plan.orderedWrites).toEqual([]);

    const preview = buildBookMetadataRestorePreview(
      inventory,
      'BK-120-notifications',
      BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({ path, etag: `etag:${path}`, revision: 1 })),
    );
    expect(preview.delegatedRoots).toEqual(['notifications']);
    expect(preview.rootFences.notifications).toEqual({ etag: 'etag:notifications', revision: 1 });
    const writes: string[] = [];
    const result = await restoreBookMetadataRoots(
      'https://db.example.test',
      'token',
      plan,
      preview.rootFences,
      async (input) => {
        writes.push(new URL(String(input)).pathname);
        return new Response('{}', { status: 200 });
      },
    );
    expect(writes).toEqual([]);
    expect(result.restoredRoots).toBe(0);
  });

  it('builds deterministic ETag fences without touching a provider or reading a body', () => {
    const inventory = makeInventory();
    const currentRoots = BOOK_METADATA_CANONICAL_ROOTS.map((path) => ({
      path,
      etag: `etag:${path}`,
      revision: 1,
    }));
    const preview = buildBookMetadataRestorePreview(
      inventory,
      'BK-120',
      currentRoots,
    );

    expect(preview.allowed).toBe(true);
    expect(preview.valid).toBe(true);
    expect(Object.keys(preview.rootFences)).toHaveLength(BOOK_METADATA_ROOT_COUNT);
    expect(preview.zeroByteProof).toEqual({
      pdfBodyReads: 0,
      pdfBodyWrites: 0,
      providerOperations: 0,
    });
  });
});
