import { describe, expect, it, vi } from 'vitest';
import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';
import {
  createSourceUploadControl,
  SourceUploadControlError,
  type SourceUploadControlDependencies,
  type SourceUploadProviderPort,
} from './sourceUpload.service';
import { SourceUploadConflictError } from './sourceUpload.rtdbRepository';

const NOW = new Date('2026-07-26T10:00:00.000Z');
const CLAIM: SourceUploadInspectionClaim = Object.freeze({
  schemaVersion: 1,
  trust: 'browser-supplied-untrusted',
  state: 'complete',
  displayFilename: 'source.pdf',
  exactByteSize: 1024,
  sha256Hex: 'a'.repeat(64),
  physicalPageCount: 4,
  pdfType: 'application/pdf',
  readability: 'readable',
});
const BEGIN_INPUT = {
  actorId: 'teacher-1',
  bookId: 'book-1',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  sourceKey: 'main',
  kind: 'initial' as const,
  claim: CLAIM,
};
const completionInput = (reservationId: string) => ({
  actorId: BEGIN_INPUT.actorId,
  bookId: BEGIN_INPUT.bookId,
  reservationId,
  providerFileId: 'file-1',
  providerFileVersionId: 'version-1',
});

const cloneIdentity = (identity: BookSourceVersionStorageIdentity): BookSourceVersionStorageIdentity => ({
  ...identity,
  checksum: { ...identity.checksum },
});

const createHarness = (options: {
  readonly authority?: boolean;
  readonly gate?: boolean;
  readonly provider?: Partial<SourceUploadProviderPort>;
  readonly rolloutGate?: SourceUploadControlDependencies['rolloutGate'];
  readonly reserveError?: string;
  readonly staleCompletion?: boolean;
  readonly crashAfterCompletion?: boolean;
} = {}) => {
  let gateAllowed = options.gate ?? true;
  let state: BookSourceUploadAccountState = {
    revision: 0,
    capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
    operations: {},
  };
  const reserve = vi.fn(async (input: Parameters<NonNullable<SourceUploadControlDependencies['repository']>['reserve']>[0]) => {
    if (options.reserveError) throw new SourceUploadConflictError(options.reserveError);
    if (input.expectedRevision !== state.revision) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    const operation: BookSourceUploadOperation = {
      ...input,
      originalFilename: String(input.originalFilename),
      expectedChecksum: { ...input.expectedChecksum },
      status: 'reserved',
    };
    state = {
      revision: state.revision + 1,
      capacity: state.capacity,
      operations: { ...state.operations, [input.reservationId]: operation },
    };
    return state;
  });
  const completeVerified = vi.fn(async (input: Parameters<NonNullable<SourceUploadControlDependencies['repository']>['completeVerified']>[0]) => {
    if (options.staleCompletion) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    if (input.expectedRevision !== state.revision) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    const operation = state.operations[input.reservationId];
    if (!operation) throw new SourceUploadConflictError('upload reservation does not exist.');
    if (operation.status === 'verified_completed') return state;
    const completed: BookSourceUploadOperation = {
      ...operation,
      status: 'verified_completed',
      verifiedStorage: cloneIdentity(input.verifiedStorage),
      completedAt: input.verifiedAt,
    };
    state = {
      revision: state.revision + 1,
      capacity: { trackedAccountBytes: state.capacity.trackedAccountBytes + operation.byteSize, temporaryBytes: 0 },
      operations: { ...state.operations, [input.reservationId]: completed },
    };
    if (options.crashAfterCompletion) throw new Error('simulated response-path crash after atomic commit');
    return state;
  });
  let authorizationSequence = 0;
  const authorizeUpload = vi.fn(async (input: Parameters<SourceUploadProviderPort['authorizeUpload']>[0]) => {
    authorizationSequence += 1;
    return {
      authorizationId: `https://upload.example/exact-${encodeURIComponent(input.issuedAt ?? String(authorizationSequence))}`,
      expiresAt: input.expiresAt,
      storageLocationId: input.storageLocationId,
      providerKind: input.providerKind,
      privateBucketId: input.privateBucketId,
      providerObjectKey: input.providerObjectKey,
      requiredHeaders: {
        'content-type': 'application/pdf',
        'x-amz-content-sha256': input.expectedChecksum.value,
        'x-amz-meta-book-source-byte-size': String(input.expectedByteSize),
        'x-amz-meta-book-source-sha256': input.expectedChecksum.value,
      },
    };
  });
  const verifyCompletedObject = vi.fn(async ({ expected }: Parameters<SourceProviderPort['verifyCompletedObject']>[0]) => ({
    identity: cloneIdentity(expected),
    contentType: 'application/pdf' as const,
  }));
  const provider: SourceUploadProviderPort = {
    authorizeUpload: options.provider?.authorizeUpload ?? authorizeUpload,
    verifyCompletedObject: options.provider?.verifyCompletedObject ?? verifyCompletedObject,
  };
  const dependencies: SourceUploadControlDependencies = {
    bookManagementAuthority: { canManageBookSource: async () => options.authority ?? true },
    rolloutGate: options.rolloutGate ?? { isUploadAllowed: async () => gateAllowed },
    deployment: {
      accountId: 'account-1',
      storageLocationId: 'location-1',
      providerKind: 'provider-test',
      privateBucketId: 'bucket-1',
    },
    accountStateReader: { read: async () => state },
    repository: { reserve, completeVerified },
    provider,
    clock: { now: () => new Date(NOW) },
  };
  return {
    control: createSourceUploadControl(dependencies),
    state: () => state,
    reserve,
    completeVerified,
    authorizeUpload,
    verifyCompletedObject,
    setState: (next: BookSourceUploadAccountState) => {
      state = next;
    },
    setGate: (allowed: boolean) => {
      gateAllowed = allowed;
    },
  };
};

const expectCode = async (promise: Promise<unknown>, code: SourceUploadControlError['code']) => {
  await expect(promise).rejects.toMatchObject({ name: 'SourceUploadControlError', code });
};

describe('provider-neutral Source Upload control domain', () => {
  it('is idempotent and keeps begin responses browser-safe', async () => {
    const harness = createHarness();
    const first = await harness.control.begin(BEGIN_INPUT);
    const replay = await harness.control.begin(BEGIN_INPUT);

    expect(replay.reservationId).toBe(first.reservationId);
    expect(replay.sourceVersionId).toBe(first.sourceVersionId);
    expect(harness.reserve).toHaveBeenCalledTimes(2);
    expect(harness.authorizeUpload).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('reserved');
    expect(replay.status).toBe('replayed');
    expect(replay.uploadUrl).toBe(first.uploadUrl);
    expect(Object.keys(first).sort()).toEqual(['expiresAt', 'requiredHeaders', 'reservationId', 'sourceVersionId', 'status', 'uploadUrl']);
    expect(JSON.stringify(first)).not.toMatch(/(?:bucket|location|objectKey|credential|secret|bytes)/iu);
  });

  it('never reauthorizes or completes an operation after cleanup begins', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const state = harness.state();
    harness.setState({
      ...state,
      operations: {
        ...state.operations,
        [begin.reservationId]: {
          ...state.operations[begin.reservationId]!,
          status: 'cleanup_pending',
          cleanup: {
            reason: 'cancel_requested',
            requestedAt: NOW.toISOString(),
            attempt: 0,
            nextRetryAt: NOW.toISOString(),
          },
        },
      },
    });
    await expectCode(harness.control.begin(BEGIN_INPUT), 'cleanup_pending');
    await expectCode(harness.control.complete(completionInput(begin.reservationId)), 'cleanup_pending');
    expect(harness.authorizeUpload).toHaveBeenCalledTimes(1);
    expect(harness.verifyCompletedObject).not.toHaveBeenCalled();
  });

  it('requires current management authority and the begin-only rollout gate', async () => {
    await expectCode(createHarness({ authority: false }).control.begin(BEGIN_INPUT), 'authority_denied');
    await expectCode(createHarness({ gate: false }).control.begin(BEGIN_INPUT), 'rollout_denied');
    const harness = createHarness({ gate: false });
    await harness.control.begin(BEGIN_INPUT).catch(() => undefined);
    expect(harness.reserve).not.toHaveBeenCalled();
    await expectCode(createHarness({
      rolloutGate: { authorizeUpload: async () => undefined as never },
    }).control.begin(BEGIN_INPUT), 'rollout_denied');
    await expect(createHarness({
      rolloutGate: {
        authorizeUpload: async () => ({ decision: { allowed: true } }),
      },
    }).control.begin(BEGIN_INPUT)).resolves.toMatchObject({ status: 'reserved' });
  });

  it('fails closed before provider authorization when the reconciliation snapshot is unavailable', async () => {
    const harness = createHarness({
      reserveError: 'current healthy provider reconciliation is required before upload authorization.',
    });
    await expectCode(harness.control.begin(BEGIN_INPUT), 'account_state_unavailable');
    expect(harness.authorizeUpload).not.toHaveBeenCalled();
  });

  it('rejects stale or incompletely bound provider upload authority', async () => {
    const authorization = (input: Parameters<SourceUploadProviderPort['authorizeUpload']>[0]) => ({
      authorizationId: 'https://upload.example/exact',
      expiresAt: input.expiresAt,
      storageLocationId: input.storageLocationId,
      providerKind: input.providerKind,
      privateBucketId: input.privateBucketId,
      providerObjectKey: input.providerObjectKey,
      requiredHeaders: { 'content-type': 'application/pdf' },
    });
    await expectCode(createHarness({
      provider: { authorizeUpload: vi.fn(async (input) => authorization(input)) },
    }).control.begin(BEGIN_INPUT), 'provider_authorization_mismatch');
    await expectCode(createHarness({
      provider: {
        authorizeUpload: vi.fn(async (input) => ({
          ...authorization(input),
          requiredHeaders: {
            'content-type': 'application/pdf',
            'x-amz-content-sha256': input.expectedChecksum.value,
            'x-amz-meta-book-source-byte-size': String(input.expectedByteSize),
            'x-amz-meta-book-source-sha256': input.expectedChecksum.value,
            authorization: 'reusable-provider-credential',
          },
        })),
      },
    }).control.begin(BEGIN_INPUT), 'provider_authorization_mismatch');
    await expectCode(createHarness({
      provider: { authorizeUpload: vi.fn(async () => null as never) },
    }).control.begin(BEGIN_INPUT), 'provider_authorization_mismatch');
    await expectCode(createHarness({
      provider: {
        authorizeUpload: vi.fn(async (input) => ({
          ...authorization(input),
          expiresAt: '2026-07-26T09:59:59.000Z',
        })),
      },
    }).control.begin(BEGIN_INPUT), 'provider_authorization_mismatch');
  });

  it('keeps trusted completion available after the begin gate returns to deny', async () => {
    const harness = createHarness();
    const reserved = await harness.control.begin(BEGIN_INPUT);
    harness.setGate(false);

    await expect(harness.control.complete(completionInput(reserved.reservationId)))
      .resolves.toMatchObject({ status: 'verified_completed' });
  });

  it('rejects malformed, stale, non-PDF, unreadable, and invalid PDF claims', async () => {
    for (const patch of [
      { trust: 'trusted' },
      { state: 'partial' },
      { pdfType: 'text/plain' },
      { readability: 'unreadable' },
      { physicalPageCount: 0 },
      { exactByteSize: BOOK_SOURCE_MAX_PDF_BYTES + 1 },
      { sha256Hex: 'not-a-sha' },
      { extra: 'rejected' },
    ]) {
      const claim = { ...CLAIM, ...patch } as unknown as SourceUploadInspectionClaim;
      await expectCode(createHarness().control.begin({ ...BEGIN_INPUT, claim }), 'invalid_claim');
    }
  });

  it('rejects a second active matching artifact while CAS remains repository-owned', async () => {
    const harness = createHarness();
    await harness.control.begin(BEGIN_INPUT);
    await expectCode(harness.control.begin({
      ...BEGIN_INPUT,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      sourceKey: 'different-source',
    }), 'active_artifact_conflict');
    expect(harness.reserve).toHaveBeenCalledTimes(1);
  });

  it('verifies exact provider metadata, PDF type, and immutable completion identity', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const completed = await harness.control.complete({
      actorId: BEGIN_INPUT.actorId,
      bookId: BEGIN_INPUT.bookId,
      reservationId: begin.reservationId,
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
    expect(completed).toMatchObject({
      reservationId: begin.reservationId,
      sourceVersionId: begin.sourceVersionId,
      status: 'verified_completed',
    });
    expect(JSON.stringify(completed)).not.toMatch(/(?:bucket|location|objectKey|credential|secret|bytes|providerFile)/iu);
    expect(harness.verifyCompletedObject).toHaveBeenCalledWith({
      expected: expect.objectContaining({ providerFileId: 'file-1', providerFileVersionId: 'version-1' }),
    });
  });

  it.each([
    ['wrong provider file identity', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, providerFileId: 'other-file' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong source identity', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, sourceVersionId: 'other-version' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong Book identity', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, bookId: 'other-book' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong location', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, storageLocationId: 'other-location' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong provider', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, providerKind: 'other-provider' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong private bucket', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, privateBucketId: 'other-bucket' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong object key', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, providerObjectKey: 'book-source/other.pdf' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong byte size', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, byteSize: expected.byteSize + 1 }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong checksum', async (expected: BookSourceVersionStorageIdentity) => ({ identity: { ...expected, checksum: { algorithm: 'sha-256' as const, value: 'b'.repeat(64) } }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['non-PDF object', async (expected: BookSourceVersionStorageIdentity) => ({ identity: expected, contentType: 'text/plain' as never }), 'provider_not_pdf'],
  ])('rejects completion mismatch: %s', async (_label, output, code) => {
    const harness = createHarness({ provider: { verifyCompletedObject: vi.fn(output) } });
    const begin = await harness.control.begin(BEGIN_INPUT);
    await expectCode(harness.control.complete(completionInput(begin.reservationId)), code as SourceUploadControlError['code']);
    expect(harness.completeVerified).not.toHaveBeenCalled();
  });

  it('maps stale completion CAS and preserves duplicate completion replay', async () => {
    const stale = createHarness({ staleCompletion: true });
    const staleBegin = await stale.control.begin(BEGIN_INPUT);
    await expectCode(stale.control.complete(completionInput(staleBegin.reservationId)), 'stale_cas');

    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const input = completionInput(begin.reservationId);
    const first = await harness.control.complete(input);
    const replay = await harness.control.complete(input);
    expect(replay).toEqual(first);
    expect(harness.completeVerified).toHaveBeenCalledTimes(1);
  });

  it('fails closed for wrong owner and safely recovers after a response-path crash', async () => {
    const wrongOwner = createHarness();
    const ownerBegin = await wrongOwner.control.begin(BEGIN_INPUT);
    await expectCode(wrongOwner.control.complete({
      ...completionInput(ownerBegin.reservationId),
      actorId: 'teacher-2',
    }), 'reservation_not_found');
    expect(wrongOwner.completeVerified).not.toHaveBeenCalled();

    const crashed = createHarness({ crashAfterCompletion: true });
    const crashBegin = await crashed.control.begin(BEGIN_INPUT);
    const input = completionInput(crashBegin.reservationId);
    await expectCode(crashed.control.complete(input), 'reservation_conflict');
    expect(crashed.state().operations[crashBegin.reservationId]?.status).toBe('verified_completed');
    await expect(crashed.control.complete(input)).resolves.toMatchObject({
      status: 'verified_completed',
      reservationId: crashBegin.reservationId,
    });
    expect(crashed.completeVerified).toHaveBeenCalledTimes(1);
  });

  it('sanitizes provider authorization and verification failures', async () => {
    const authFailure = createHarness({
      provider: { authorizeUpload: vi.fn(async () => { throw { code: 'timeout', retryable: true }; }) },
    });
    await expectCode(authFailure.control.begin(BEGIN_INPUT), 'provider_timeout');

    const verifyFailure = createHarness({
      provider: { verifyCompletedObject: vi.fn(async () => { throw { code: 'not_found', retryable: false }; }) },
    });
    const begin = await verifyFailure.control.begin(BEGIN_INPUT);
    await expectCode(verifyFailure.control.complete(completionInput(begin.reservationId)), 'provider_not_found');
  });
});
