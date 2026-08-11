import { describe, expect, it } from 'vitest';

import {
  BOOK_METADATA_CANONICAL_ROOTS,
  BOOK_METADATA_ROOT_COUNT,
  buildBookMetadataRestorePreview,
  createBookMetadataBackupInventory,
  fingerprintBookMetadata,
  prepareBookSourceRestore,
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
