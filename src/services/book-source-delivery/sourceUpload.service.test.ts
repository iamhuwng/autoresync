import { describe, expect, it, vi } from 'vitest';
import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';
import type { BookSourceRecoveryContext } from './sourceRecovery.adapter';
import {
  createBookSourceUploadControl,
  listBookSourceProjections,
  SourceUploadControlError,
  type BookSourceUploadControlDependencies,
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
  purpose: 'book-source' as const,
  claim: CLAIM,
};
const completionInput = (reservationId: string) => ({
  actorId: BEGIN_INPUT.actorId,
  bookId: BEGIN_INPUT.bookId,
  reservationId,
  operationId: BEGIN_INPUT.idempotencyKey,
});

const cloneIdentity = (identity: BookSourceVersionStorageIdentity): BookSourceVersionStorageIdentity => ({
  ...identity,
  checksum: { ...identity.checksum },
});

const createHarness = (options: {
  readonly authority?: boolean;
  readonly authorizedActor?: string;
  readonly decisionAuthority?: boolean;
  readonly authorizedDecisionActor?: string;
  readonly gate?: boolean;
  readonly provider?: Partial<SourceUploadProviderPort>;
  readonly pageCount?: BookSourceUploadControlDependencies['pageCount'];
  readonly releaseAuthorization?: BookSourceUploadControlDependencies['releaseAuthorization'];
  readonly reserveError?: string;
  readonly staleCompletion?: boolean;
  readonly crashAfterCompletion?: boolean;
  readonly recoveryContext?: BookSourceRecoveryContext;
} = {}) => {
  let gateAllowed = options.gate ?? true;
  let state: BookSourceUploadAccountState = {
    revision: 0,
    capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
    operations: {},
    assemblyBooks: {},
  };
  const reserve = vi.fn(async (input: Parameters<BookSourceUploadControlDependencies['repository']['reserve']>[0]) => {
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
  const completeVerified = vi.fn(async (input: Parameters<BookSourceUploadControlDependencies['repository']['completeVerified']>[0]) => {
    if (options.staleCompletion) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    if (input.expectedRevision !== state.revision) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    const operation = state.operations[input.reservationId];
    if (!operation) throw new SourceUploadConflictError('upload reservation does not exist.');
    if (operation.status === 'verified_completed') {
      const existing = state.assemblyBooks?.[operation.bookId]?.[operation.sourceVersionId];
      if (existing
        && existing.sourceVersionId === operation.sourceVersionId
        && existing.ownerId === operation.ownerId
        && existing.checksum?.algorithm === operation.expectedChecksum.algorithm
        && existing.checksum?.value === operation.expectedChecksum.value
        && existing.physicalPageCount === operation.physicalPageCount
        && existing.verifiedUsable === true) return state;
      state = {
        ...state,
        revision: state.revision + 1,
        assemblyBooks: {
          ...(state.assemblyBooks ?? {}),
          [operation.bookId]: {
            ...(state.assemblyBooks?.[operation.bookId] ?? {}),
            [operation.sourceVersionId]: {
              ownerId: operation.ownerId,
              bookId: operation.bookId,
              sourceKey: operation.sourceKey,
              sourceVersionId: operation.sourceVersionId,
              checksum: operation.expectedChecksum,
              purpose: operation.purpose,
              studentSafeStatus: operation.purpose === 'student-document' ? 'ready' : operation.studentSafeStatus,
              ...(operation.studentSafeDecision === undefined ? {} : {
                studentSafeDecision: operation.studentSafeDecision,
              }),
              physicalPageCount: operation.physicalPageCount!,
              verifiedUsable: true,
            },
          },
        },
      };
      return state;
    }
    const completed: BookSourceUploadOperation = {
      ...operation,
      status: 'verified_completed',
      ...(operation.purpose === 'student-document' ? { studentSafeStatus: 'ready' as const } : {}),
      verifiedStorage: cloneIdentity(input.verifiedStorage),
      physicalPageCount: input.physicalPageCount,
      completedAt: input.verifiedAt,
    };
    state = {
      revision: state.revision + 1,
      capacity: { trackedAccountBytes: state.capacity.trackedAccountBytes + operation.byteSize, temporaryBytes: 0 },
      operations: { ...state.operations, [input.reservationId]: completed },
      assemblyBooks: {
        ...(state.assemblyBooks ?? {}),
        [operation.bookId]: {
          ...(state.assemblyBooks?.[operation.bookId] ?? {}),
          [operation.sourceVersionId]: {
            ownerId: operation.ownerId,
            bookId: operation.bookId,
            sourceKey: operation.sourceKey,
            sourceVersionId: operation.sourceVersionId,
            checksum: operation.expectedChecksum,
            purpose: operation.purpose,
            studentSafeStatus: operation.purpose === 'student-document' ? 'ready' : operation.studentSafeStatus,
            ...(operation.studentSafeDecision === undefined ? {} : {
              studentSafeDecision: operation.studentSafeDecision,
            }),
            physicalPageCount: input.physicalPageCount,
            verifiedUsable: true,
          },
        },
      },
    };
    if (options.crashAfterCompletion) throw new Error('simulated response-path crash after atomic commit');
    return state;
  });
  const decideStudentSafeSource = vi.fn(async (input: Parameters<NonNullable<BookSourceUploadControlDependencies['repository']['decideStudentSafeSource']>>[0]) => {
    if (input.expectedRevision !== state.revision) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
    const operation = state.operations[input.reservationId];
    if (!operation || operation.bookId !== input.bookId
      || operation.status !== 'verified_completed') {
      throw new SourceUploadConflictError('student-safe decision authority is unavailable.');
    }
    if (operation.studentSafeStatus !== 'unreviewed') throw new SourceUploadConflictError('student-safe decision is immutable.');
    const decided = { ...operation, studentSafeStatus: input.studentSafeStatus, studentSafeDecision: input.studentSafeDecision };
    state = {
      ...state,
      revision: state.revision + 1,
      operations: { ...state.operations, [input.reservationId]: decided },
      assemblyBooks: {
        ...(state.assemblyBooks ?? {}),
        [operation.bookId]: {
          ...(state.assemblyBooks?.[operation.bookId] ?? {}),
          [operation.sourceVersionId]: {
            ...state.assemblyBooks?.[operation.bookId]?.[operation.sourceVersionId],
            purpose: operation.purpose,
            studentSafeStatus: decided.studentSafeStatus,
            studentSafeDecision: decided.studentSafeDecision,
          },
        },
      },
    };
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
  const resolveCompletedObject = vi.fn(async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({
    identity: {
      ...expected,
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
      checksum: { ...expected.checksum },
    },
    contentType: 'application/pdf' as const,
  }));
  const provider: SourceUploadProviderPort = {
    authorizeUpload: options.provider?.authorizeUpload ?? authorizeUpload,
    resolveCompletedObject: options.provider?.resolveCompletedObject ?? resolveCompletedObject,
    readBounded: options.provider?.readBounded ?? vi.fn(async () => ({
      bytes: new Uint8Array([1]), totalByteSize: 1, offset: 0,
    })),
  };
  const pageCount = options.pageCount ?? { countVerifiedPages: vi.fn(async () => 4) };
  const dependencies: BookSourceUploadControlDependencies = {
    bookManagementAuthority: { canManageBookSource: async ({ actorId }) =>
      (options.authority ?? true) && (options.authorizedActor === undefined || options.authorizedActor === actorId),
    canDecideStudentSafeSource: async ({ actorId }) =>
      (options.decisionAuthority ?? true)
      && (options.authorizedDecisionActor === undefined || options.authorizedDecisionActor === actorId) },
    releaseAuthorization: options.releaseAuthorization ?? { authorizeUpload: async () => gateAllowed },
    deployment: {
      accountId: 'account-1',
      storageLocationId: 'location-1',
      providerKind: 'provider-test',
      privateBucketId: 'bucket-1',
    },
    accountStateReader: { read: async () => state },
    repository: { reserve, completeVerified, decideStudentSafeSource },
    provider,
    pageCount,
    clock: { now: () => new Date(NOW) },
    recoveryContext: options.recoveryContext,
  };
  return {
    control: createBookSourceUploadControl(dependencies),
    state: () => state,
    reserve,
    completeVerified,
    decideStudentSafeSource,
    authorizeUpload,
    resolveCompletedObject,
    pageCount,
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
    await expect(harness.control.begin({
      ...BEGIN_INPUT,
      claim: { ...CLAIM, physicalPageCount: CLAIM.physicalPageCount + 1 },
    })).resolves.toMatchObject({ status: 'replayed' });
    expect(Object.keys(first).sort()).toEqual(['expiresAt', 'purpose', 'requiredHeaders', 'reservationId', 'sourceVersionId', 'status', 'studentSafeStatus', 'uploadUrl']);
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
    expect(harness.resolveCompletedObject).not.toHaveBeenCalled();
  });

  it('requires the original upload operation identity for safety decisions', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    await harness.control.complete(completionInput(begin.reservationId));

    await expectCode(harness.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: begin.reservationId,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    } as never), 'invalid_input');
    await expectCode(harness.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: begin.reservationId,
      operationId: '00000000-0000-4000-8000-000000000002',
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }), 'reservation_conflict');
  });

  it('fails closed before provider authorization or verification in recovery context', async () => {
    const harness = createHarness({
      recoveryContext: { recoveryOperationId: 'recovery-122', phase: 'restoring_canonical_authority' },
    });

    await expectCode(harness.control.begin(BEGIN_INPUT), 'recovery_suppressed');
    await expectCode(harness.control.complete(completionInput('reservation-1')), 'recovery_suppressed');
    expect(harness.authorizeUpload).not.toHaveBeenCalled();
    expect(harness.resolveCompletedObject).not.toHaveBeenCalled();
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.completeVerified).not.toHaveBeenCalled();
  });

  it('requires current management authority and the begin-only rollout gate', async () => {
    await expectCode(createHarness({ authority: false }).control.begin(BEGIN_INPUT), 'authority_denied');
    await expectCode(createHarness({ gate: false }).control.begin(BEGIN_INPUT), 'rollout_denied');
    const harness = createHarness({ gate: false });
    await harness.control.begin(BEGIN_INPUT).catch(() => undefined);
    expect(harness.reserve).not.toHaveBeenCalled();
    await expectCode(createHarness({
      releaseAuthorization: { authorizeUpload: async () => undefined as never },
    }).control.begin(BEGIN_INPUT), 'rollout_denied');
    await expect(createHarness({
      releaseAuthorization: { authorizeUpload: async () => true },
    }).control.begin(BEGIN_INPUT)).resolves.toMatchObject({ status: 'reserved' });
  });

  it('fails closed without a reservation when the reconciliation snapshot is unavailable', async () => {
    const harness = createHarness({
      reserveError: 'current healthy provider reconciliation is required before upload authorization.',
    });
    await expectCode(harness.control.begin(BEGIN_INPUT), 'account_state_unavailable');
    expect(harness.authorizeUpload).toHaveBeenCalledTimes(1);
    expect(harness.state().operations).toEqual({});
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
      operationId: BEGIN_INPUT.idempotencyKey,
    });
    expect(completed).toMatchObject({
      reservationId: begin.reservationId,
      sourceVersionId: begin.sourceVersionId,
      checksum: { algorithm: 'sha-256', value: CLAIM.sha256Hex },
      status: 'verified_completed',
    });
    expect(JSON.stringify(completed)).not.toMatch(/(?:bucket|location|objectKey|credential|secret|bytes|providerFile)/iu);
    expect(harness.resolveCompletedObject).toHaveBeenCalledWith({
      expected: expect.not.objectContaining({ providerFileId: expect.anything(), providerFileVersionId: expect.anything() }),
    });
  });

  it('passes request cancellation and deadline through trusted completion only', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const signal = new AbortController().signal;
    const deadlineAt = Date.now() + 10_000;
    const deferCleanup = vi.fn();

    await harness.control.complete(completionInput(begin.reservationId), { signal, deadlineAt, deferCleanup });

    expect(harness.resolveCompletedObject).toHaveBeenCalledWith(
      expect.anything(),
      { signal, deadlineAt },
    );
    expect(harness.pageCount.countVerifiedPages).toHaveBeenCalledWith(expect.objectContaining({
      signal,
      deadlineAt,
      deferCleanup,
    }));
  });

  it.each([
    ['wrong source identity', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', sourceVersionId: 'other-version' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong Book identity', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', bookId: 'other-book' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong location', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', storageLocationId: 'other-location' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong provider', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', providerKind: 'other-provider' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong private bucket', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', privateBucketId: 'other-bucket' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong object key', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', providerObjectKey: 'book-source/other.pdf' }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong byte size', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', byteSize: expected.byteSize + 1 }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['wrong checksum', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1', checksum: { algorithm: 'sha-256' as const, value: 'b'.repeat(64) } }, contentType: 'application/pdf' as const }), 'provider_identity_mismatch'],
    ['non-PDF object', async ({ expected }: Parameters<SourceProviderPort['resolveCompletedObject']>[0]) => ({ identity: { ...expected, providerFileId: 'file-1', providerFileVersionId: 'version-1' }, contentType: 'text/plain' as never }), 'provider_not_pdf'],
  ])('rejects completion mismatch: %s', async (_label, output, code) => {
    const harness = createHarness({ provider: { resolveCompletedObject: vi.fn(output) } });
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

  it('repairs a missing provider-free projection during completion replay', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const input = completionInput(begin.reservationId);
    await harness.control.complete(input);
    harness.setState({ ...harness.state(), assemblyBooks: {} });

    await expect(harness.control.complete(input)).resolves.toMatchObject({
      status: 'verified_completed',
      sourceVersionId: begin.sourceVersionId,
    });
    expect(harness.completeVerified).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(harness.state().assemblyBooks)).not.toMatch(
      /(?:bucket|location|objectKey|providerFile|providerKind)/iu,
    );
  });

  it('does not attach or return Book authority revisions during completion', async () => {
    const harness = createHarness();
    const begin = await harness.control.begin(BEGIN_INPUT);
    const input = completionInput(begin.reservationId);

    const completed = await harness.control.complete(input);
    expect(completed).not.toHaveProperty('bookRevision');
    expect(completed).not.toHaveProperty('sourceSetRevision');

    harness.setState({ ...harness.state(), assemblyBooks: {} });
    const replay = await harness.control.complete(input);
    expect(replay).not.toHaveProperty('bookRevision');
    expect(replay).not.toHaveProperty('sourceSetRevision');
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
    const authorizeUpload = vi.fn(async () => { throw { code: 'timeout', retryable: true }; });
    const authFailure = createHarness({
      provider: { authorizeUpload },
    });
    await expectCode(authFailure.control.begin(BEGIN_INPUT), 'provider_timeout');
    expect(authorizeUpload).toHaveBeenCalledTimes(1);
    expect(authFailure.reserve).not.toHaveBeenCalled();
    expect(authFailure.state().operations).toEqual({});

    const verifyFailure = createHarness({
      provider: { resolveCompletedObject: vi.fn(async () => { throw { code: 'not_found', retryable: false }; }) },
    });
    const begin = await verifyFailure.control.begin(BEGIN_INPUT);
    await expectCode(verifyFailure.control.complete(completionInput(begin.reservationId)), 'provider_not_found');
  });

  it('propagates purpose and trusted safety state, while excluding student documents from component lists', async () => {
    const owner = createHarness({ authorizedActor: 'teacher-1', authorizedDecisionActor: 'teacher-1' });
    const begin = await owner.control.begin(BEGIN_INPUT);
    const completed = await owner.control.complete(completionInput(begin.reservationId));
    expect(completed).toMatchObject({
      purpose: 'book-source',
      studentSafeStatus: 'unreviewed',
    });
    const ready = await owner.control.decideStudentSafeSource({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    });
    await expect(owner.control.decideStudentSafeSource({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    })).resolves.toEqual(ready);
    expect(ready).toMatchObject({
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        sourceVersionId: begin.sourceVersionId,
        sha256Hex: CLAIM.sha256Hex,
      },
    });
    expect(listBookSourceProjections(owner.state(), 'teacher-1', 'book-1')).toHaveLength(1);

    owner.setState({
      ...owner.state(),
      assemblyBooks: {
        ...owner.state().assemblyBooks,
        'book-1': {
          ...owner.state().assemblyBooks?.['book-1'],
          unknown: { ...owner.state().assemblyBooks?.['book-1']?.[begin.sourceVersionId], purpose: 'other' } as never,
        },
      },
    });
    expect(listBookSourceProjections(owner.state(), 'teacher-1', 'book-1').some((source) => source.sourceVersionId === 'unknown')).toBe(false);

    const studentDocument = createHarness({ authorizedActor: 'teacher-1' });
    const studentBegin = await studentDocument.control.begin({ ...BEGIN_INPUT, purpose: 'student-document' });
    await expect(studentDocument.control.complete(completionInput(studentBegin.reservationId))).resolves.toMatchObject({
      purpose: 'student-document',
      studentSafeStatus: 'ready',
      physicalPageCount: 4,
    });
    expect(listBookSourceProjections(studentDocument.state(), 'teacher-1', 'book-1')).toEqual([]);
    await expectCode(owner.control.decideStudentSafeSource({
      actorId: 'student-1', bookId: 'book-1', reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }), 'authority_denied');
    await expectCode(owner.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-2', reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }), 'reservation_not_found');
  });

  it('allows an active super-admin safety decision without changing Source Version ownership', async () => {
    const harness = createHarness({
      authorizedActor: 'teacher-1',
      authorizedDecisionActor: 'super-admin-1',
    });
    const begin = await harness.control.begin(BEGIN_INPUT);
    await harness.control.complete(completionInput(begin.reservationId));

    await expect(harness.control.decideStudentSafeSource({
      actorId: 'super-admin-1',
      bookId: 'book-1',
      reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    })).resolves.toMatchObject({ studentSafeStatus: 'ready' });
    expect(harness.state().operations[begin.reservationId]?.ownerId).toBe('teacher-1');
    expect(harness.state().assemblyBooks?.['book-1']?.[begin.sourceVersionId]?.ownerId).toBe('teacher-1');
  });

  it('keeps safety decisions immutable and fails closed for disabled or cross-owner actors', async () => {
    const disabled = createHarness({ decisionAuthority: false });
    const disabledBegin = await disabled.control.begin(BEGIN_INPUT);
    await disabled.control.complete(completionInput(disabledBegin.reservationId));
    await expectCode(disabled.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: disabledBegin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }), 'authority_denied');

    const harness = createHarness({ authorizedDecisionActor: 'teacher-1' });
    const begin = await harness.control.begin(BEGIN_INPUT);
    await harness.control.complete(completionInput(begin.reservationId));
    await harness.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    });
    await expectCode(harness.control.decideStudentSafeSource({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'rejected', reasonCode: 'superseded',
    }), 'reservation_conflict');
    await expectCode(harness.control.decideStudentSafeSource({
      actorId: 'teacher-2', bookId: 'book-1', reservationId: begin.reservationId,
      operationId: BEGIN_INPUT.idempotencyKey,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    }), 'authority_denied');
  });
});
