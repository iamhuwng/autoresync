import {
  buildListeningUploadSessionCorsHeaders,
  createListeningTempKey,
  createListeningUploadAssetGrant,
  createOpaqueId,
  hashIdempotencyKey,
  ListeningUploadSessionInputError,
  parseCancelSessionRequest,
  parseCreateSessionRequest,
  parseIssueAssetRequest,
  parseProbeAssetRequest,
} from './listening-upload-session-contract.ts';
import { FirebaseRestListeningUploadSessionRepository } from './listening-upload-session-repository.ts';
import type {
  ListeningUploadAssetRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
} from './listening-upload-session-types.ts';

export {
  buildListeningUploadSessionCorsHeaders,
  createOpaqueId,
  hashIdempotencyKey,
} from './listening-upload-session-contract.ts';

const SESSION_ELIGIBILITY_MS = 8 * 60 * 60 * 1000;
const GRANT_TTL_MS = 10 * 60 * 1000;
const BRIDGE_VERSION = '0056A-v1' as const;
const LOCAL_UPLOAD_TRANSPORT_ORIGIN = 'http://localhost:8787' as const;
const LOCAL_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
]);

const resolveLocalUploadTransportOrigin = (
  request: Request,
  env: Record<string, unknown>,
): typeof LOCAL_UPLOAD_TRANSPORT_ORIGIN | undefined =>
  env.LISTENING_UPLOAD_SESSION_DEV_TRANSPORT_ENABLED === 'true'
  && LOCAL_APP_ORIGINS.has(request.headers.get('Origin') ?? '')
    ? LOCAL_UPLOAD_TRANSPORT_ORIGIN
    : undefined;

export class ListeningUploadSessionError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) {
    super(code);
    this.name = 'ListeningUploadSessionError';
  }
}

const asError = (error: unknown): ListeningUploadSessionError => {
  if (error instanceof ListeningUploadSessionError) return error;
  if (error instanceof ListeningUploadSessionInputError) {
    return new ListeningUploadSessionError(
      error.code,
      error.code === 'upload_too_large' ? 413 : 400,
    );
  }
  if (error instanceof Error) {
    if (
      error.message === 'missing_google_sa_key'
      || error.message === 'invalid_google_sa_key'
      || error.message.startsWith('google_oauth_failed:')
    ) {
      return new ListeningUploadSessionError('bridge_google_oauth_failed', 500);
    }
    if (
      error.message === 'missing_firebase_db_url'
      || error.message.startsWith('firebase_rtdb_get_failed:')
      || error.message.startsWith('firebase_rtdb_put_failed:')
      || error.message.startsWith('missing_firebase_etag:')
      || error.message === 'bootstrap_write_failed'
    ) {
      return new ListeningUploadSessionError('bridge_firebase_rtdb_failed', 500);
    }
    const safeName = error.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'error';
    return new ListeningUploadSessionError(`bridge_unexpected_${safeName}`, 500);
  }
  return new ListeningUploadSessionError('bridge_unexpected_non_error', 500);
};

const requireSecret = (value: string | undefined, code: string): string => {
  if (!value || value.length < 16) {
    throw new ListeningUploadSessionError(code, 500);
  }
  return value;
};

const sessionResponse = (record: ListeningUploadSessionRecord) => ({
  uploadSessionId: record.uploadSessionId,
  ownerId: record.ownerId,
  status: record.status,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  maxEligibilityExpiresAt: record.maxEligibilityExpiresAt,
});

const bodyLength = async (value: unknown): Promise<number> => {
  if (typeof value === 'string') return value.length;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  if (value && typeof value === 'object' && 'arrayBuffer' in value && typeof value.arrayBuffer === 'function') {
    return (await (value.arrayBuffer as () => Promise<ArrayBuffer>)()).byteLength;
  }
  if (value && typeof value === 'object' && 'body' in value && value.body) {
    return (await new Response(value.body as BodyInit).arrayBuffer()).byteLength;
  }
  return 0;
};

const probeUploadedAssetRange = async (
  env: Record<string, unknown>,
  asset: ListeningUploadAssetRecord,
) => {
  const bucket = env.R2_BUCKET as {
    get?: (key: string, options?: unknown) => Promise<unknown>;
  } | undefined;
  if (!bucket?.get) {
    throw new ListeningUploadSessionError('asset_probe_unavailable', 500);
  }
  const object = await bucket.get(asset.tempKey, {
    range: { offset: 0, length: 1 },
  });
  if (!object || typeof object !== 'object') {
    throw new ListeningUploadSessionError('asset_not_uploaded', 404);
  }
  const objectRecord = object as { size?: unknown };
  const observedSize = Number(objectRecord.size);
  const totalSize = Number.isSafeInteger(observedSize) && observedSize > 0
    ? observedSize
    : asset.sizeBytes;
  const length = await bodyLength(object);
  if (totalSize !== asset.sizeBytes || length !== 1) {
    throw new ListeningUploadSessionError('asset_range_probe_failed', 409);
  }
  return {
    requestRange: 'bytes=0-0',
    status: 206,
    acceptRanges: 'bytes' as const,
    contentLength: 1,
    contentRange: `bytes 0-0/${asset.sizeBytes}`,
  };
};

const isMissingObjectError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(value.status);
  const text = `${String(value.code ?? '')} ${String(value.message ?? '')}`.toLowerCase();
  return status === 404 || text.includes('not_found') || text.includes('no such key') || text.includes('nosuchkey');
};

const deleteUploadedAsset = async (
  env: Record<string, unknown>,
  asset: ListeningUploadAssetRecord,
): Promise<'deleted' | 'missing'> => {
  const bucket = env.R2_BUCKET as { delete?: (key: string) => Promise<unknown> } | undefined;
  if (!bucket?.delete) throw new ListeningUploadSessionError('asset_cleanup_unavailable', 500);
  try {
    await bucket.delete(asset.tempKey);
    return 'deleted';
  } catch (error) {
    if (isMissingObjectError(error)) return 'missing';
    throw error;
  }
};

const referenceAssetIds = (
  references: Awaited<ReturnType<NonNullable<ListeningUploadSessionRepository['findDurableAssetReferences']>>>,
): Set<string> => new Set(references.map((reference) => reference.assetId));

const canonicalTempKeyForAsset = (
  ownerId: string,
  uploadSessionId: string,
  asset: ListeningUploadAssetRecord,
): string => createListeningTempKey({
  ownerId,
  uploadSessionId,
  assetId: asset.assetId,
  sanitizedFileName: asset.sanitizedFileName,
});

export const createListeningUploadSessionService = (dependencies: {
  repository: ListeningUploadSessionRepository;
  idempotencySecret: string;
  grantSecret: string;
  now?: () => number;
  createOpaqueId?: () => string;
}) => {
  const now = dependencies.now ?? (() => Date.now());
  const issueOpaqueId = dependencies.createOpaqueId ?? createOpaqueId;
  const idempotencySecret = requireSecret(dependencies.idempotencySecret, 'idempotency_secret_unavailable');
  const grantSecret = requireSecret(dependencies.grantSecret, 'grant_secret_unavailable');
  const acquireMutationLease = async (
    ownerId: string,
    uploadSessionId: string,
    assetId: string,
  ) => {
    if (!dependencies.repository.acquireCleanupLease
      || !dependencies.repository.releaseCleanupLease) {
      throw new ListeningUploadSessionError('bridge_mutation_repository_unavailable', 500);
    }
    const claimedAt = now();
    const lease = await dependencies.repository.acquireCleanupLease({
      ownerId,
      uploadSessionId,
      assetId,
      leaseId: `mutation:${crypto.randomUUID()}`,
      now: claimedAt,
      leaseMs: 2 * 60 * 1000,
    });
    if (!lease) throw new ListeningUploadSessionError('restore_or_cleanup_in_progress', 503);
    return lease;
  };

  return {
    async createSession(input: { uid: string; idempotencyKey: unknown; body: unknown }) {
      if (dependencies.repository.isRestoreInProgress
        && await dependencies.repository.isRestoreInProgress()) {
        throw new ListeningUploadSessionError('restore_in_progress', 503);
      }
      const request = parseCreateSessionRequest(input.body, input.idempotencyKey);
      let creationRequestIdHash: string;
      try {
        creationRequestIdHash = await hashIdempotencyKey(idempotencySecret, request.idempotencyKey);
      } catch {
        throw new ListeningUploadSessionError('bridge_hmac_failed', 500);
      }
      let existing: ListeningUploadSessionRecord | null;
      try {
        existing = await dependencies.repository.findByCreationRequest(input.uid, creationRequestIdHash);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_find_failed', 500);
      }
      if (existing) return sessionResponse(existing);

      const createdAt = now();
      let uploadSessionId: string;
      try {
        uploadSessionId = issueOpaqueId();
      } catch {
        throw new ListeningUploadSessionError('bridge_id_failed', 500);
      }
      const record: ListeningUploadSessionRecord = {
        schemaVersion: 1,
        ownerId: input.uid,
        uploadSessionId,
        purpose: 'listening-authoring',
        status: 'active',
        creationRequestIdHash,
        ...(request.draftId ? { draftId: request.draftId } : {}),
        ...(request.testId ? { testId: request.testId } : {}),
        ...(request.revisionId ? { revisionId: request.revisionId } : {}),
        createdAt,
        createdBy: input.uid,
        expiresAt: createdAt + SESSION_ELIGIBILITY_MS,
        maxEligibilityExpiresAt: createdAt + SESSION_ELIGIBILITY_MS,
        assetIds: {},
        assetRequests: {},
        bridgeVersion: BRIDGE_VERSION,
      };
      const mutationLease = await acquireMutationLease(
        input.uid,
        record.uploadSessionId,
        'session-bootstrap',
      );
      try {
        return sessionResponse(await dependencies.repository.create(record));
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_create_failed', 500);
      } finally {
        await dependencies.repository.releaseCleanupLease!(mutationLease);
      }
    },

    async issueAsset(input: {
      uid: string;
      idempotencyKey: unknown;
      body: unknown;
      uploadTransportOrigin?: typeof LOCAL_UPLOAD_TRANSPORT_ORIGIN;
    }) {
      if (dependencies.repository.isRestoreInProgress
        && await dependencies.repository.isRestoreInProgress()) {
        throw new ListeningUploadSessionError('restore_in_progress', 503);
      }
      const request = parseIssueAssetRequest(input.body, input.idempotencyKey);
      let session: ListeningUploadSessionRecord | null;
      try {
        session = await dependencies.repository.get(input.uid, request.uploadSessionId);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_get_failed', 500);
      }
      if (!session || session.ownerId !== input.uid || session.status !== 'active') {
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }

      const issuedAt = now();
      if (session.expiresAt <= issuedAt || session.maxEligibilityExpiresAt <= issuedAt) {
        throw new ListeningUploadSessionError('upload_session_expired', 403);
      }

      let assetRequestIdHash: string;
      try {
        assetRequestIdHash = await hashIdempotencyKey(idempotencySecret, request.idempotencyKey);
      } catch {
        throw new ListeningUploadSessionError('bridge_hmac_failed', 500);
      }
      const existingAsset = (session.assetRequests ?? {})[assetRequestIdHash];
      if (
        existingAsset
        && (
          existingAsset.fileName !== request.fileName
          || existingAsset.sanitizedFileName !== request.fileName
          || existingAsset.declaredMimeType !== request.declaredMimeType
          || existingAsset.sizeBytes !== request.sizeBytes
        )
      ) {
        throw new ListeningUploadSessionError('idempotency_conflict', 409);
      }
      const candidate: ListeningUploadAssetRecord = existingAsset ?? {
        assetId: (() => {
          try {
            return issueOpaqueId();
          } catch {
            throw new ListeningUploadSessionError('bridge_id_failed', 500);
          }
        })(),
        fileName: request.fileName,
        sanitizedFileName: request.fileName,
        declaredMimeType: request.declaredMimeType,
        sizeBytes: request.sizeBytes,
        tempKey: '',
        issuedAt,
        grantExpiresAt: issuedAt + GRANT_TTL_MS,
      };
      const asset: ListeningUploadAssetRecord = {
        ...candidate,
        tempKey: createListeningTempKey({
          ownerId: input.uid,
          uploadSessionId: session.uploadSessionId,
          assetId: candidate.assetId,
          sanitizedFileName: candidate.sanitizedFileName,
        }),
      };
      let saved: { session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null;
      if (existingAsset) {
        saved = { session, asset };
      } else {
        const mutationLease = await acquireMutationLease(
          input.uid,
          session.uploadSessionId,
          asset.assetId,
        );
        try {
          saved = await dependencies.repository.issueAsset({
            ownerId: input.uid,
            uploadSessionId: session.uploadSessionId,
            assetRequestIdHash,
            asset,
          });
        } catch (error) {
          const safeError = asError(error);
          if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
          throw new ListeningUploadSessionError('bridge_repository_issue_failed', 500);
        } finally {
          await dependencies.repository.releaseCleanupLease!(mutationLease);
        }
      }
      if (!saved) throw new ListeningUploadSessionError('upload_session_not_found', 404);

      const assetGrantExpiresAt = issuedAt + GRANT_TTL_MS;
      const assetGrant = await createListeningUploadAssetGrant({
        v: 1,
        kind: 'upload',
        uid: input.uid,
        ownerId: input.uid,
        uploadSessionId: saved.session.uploadSessionId,
        assetId: saved.asset.assetId,
        sanitizedFileName: saved.asset.sanitizedFileName,
        key: saved.asset.tempKey,
        operation: 'listening-upload-session',
        contentType: saved.asset.declaredMimeType,
        sizeBytes: saved.asset.sizeBytes,
        expiresAt: assetGrantExpiresAt,
        nonce: issueOpaqueId(),
        ...(input.uploadTransportOrigin
          ? { uploadTransportOrigin: input.uploadTransportOrigin }
          : {}),
      }, grantSecret);
      return {
        assetId: saved.asset.assetId,
        uploadSessionId: saved.session.uploadSessionId,
        tempKey: saved.asset.tempKey,
        assetGrant,
        assetGrantExpiresAt,
      };
    },

    async resolveAssetForProbe(input: { uid: string; body: unknown }) {
      const request = parseProbeAssetRequest(input.body);
      let session: ListeningUploadSessionRecord | null;
      try {
        session = await dependencies.repository.get(input.uid, request.uploadSessionId);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_get_failed', 500);
      }
      if (!session || session.ownerId !== input.uid || session.status !== 'active') {
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }
      const checkedAt = now();
      if (session.expiresAt <= checkedAt || session.maxEligibilityExpiresAt <= checkedAt) {
        throw new ListeningUploadSessionError('upload_session_expired', 403);
      }
      const asset = Object.values(session.assetRequests ?? {})
        .find((entry) => entry.assetId === request.assetId);
      if (!asset || !session.assetIds?.[request.assetId]) {
        throw new ListeningUploadSessionError('asset_not_found', 404);
      }
      if (asset.tempKey !== createListeningTempKey({
        ownerId: input.uid,
        uploadSessionId: session.uploadSessionId,
        assetId: asset.assetId,
        sanitizedFileName: asset.sanitizedFileName,
      })) {
        throw new ListeningUploadSessionError('asset_key_mismatch', 409);
      }
      return {
        uploadSessionId: session.uploadSessionId,
        asset,
      };
    },

    async cancelSession(input: {
      uid: string;
      body: unknown;
      env: Record<string, unknown>;
    }) {
      const request = parseCancelSessionRequest(input.body);
      if (!dependencies.repository.findDurableAssetReferences
        || !dependencies.repository.markCleanupState
        || !dependencies.repository.acquireCleanupLease
        || !dependencies.repository.assertCleanupLeaseOwned
        || !dependencies.repository.recordDeletedTempAsset
        || !dependencies.repository.releaseCleanupLease) {
        throw new ListeningUploadSessionError('bridge_cleanup_repository_unavailable', 500);
      }
      if (dependencies.repository.isRestoreInProgress
        && await dependencies.repository.isRestoreInProgress()) {
        throw new ListeningUploadSessionError('restore_in_progress', 503);
      }

      let session = await dependencies.repository.get(input.uid, request.uploadSessionId);
      if (!session || session.ownerId !== input.uid || session.purpose !== 'listening-authoring') {
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }
      if (session.status === 'committing' || session.status === 'completed') {
        throw new ListeningUploadSessionError('upload_session_not_cancellable', 409);
      }
      if (session.status === 'abandoned') {
        return {
          status: session.status,
          uploadSessionId: session.uploadSessionId,
          deletedCount: 0,
          preservedCount: Object.keys(session.preservedAssetIds ?? {}).length,
          skippedCount: 0,
        };
      }

      const requestedAssets = Object.values(session.assetRequests ?? {})
        .filter((asset) => request.assetId === undefined || asset.assetId === request.assetId);
      if (request.assetId !== undefined && requestedAssets.length === 0) {
        throw new ListeningUploadSessionError('asset_not_found', 404);
      }

      // First fence the whole session. A competing commit either wins this
      // CAS (and cleanup proceeds) or leaves a terminal state untouched.
      const queued = await dependencies.repository.markCleanupState({
        ownerId: input.uid,
        uploadSessionId: session.uploadSessionId,
        status: 'cleanup-queued',
        reason: request.reason,
        cleanupQueuedAt: now(),
        deletedAssetIds: [],
        preservedAssetIds: [],
        expectedStatuses: ['active', 'cleanup-queued', 'expired'],
      });
      if (!queued) {
        session = await dependencies.repository.get(input.uid, request.uploadSessionId);
        if (session?.status === 'committing' || session?.status === 'completed') {
          throw new ListeningUploadSessionError('upload_session_not_cancellable', 409);
        }
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }
      session = queued;

      const deletedAssetIds = new Set(Object.keys(session.deletedAssetIds ?? {}));
      const preservedAssetIds = new Set(Object.keys(session.preservedAssetIds ?? {}));
      const assets = requestedAssets.filter((asset) =>
        !deletedAssetIds.has(asset.assetId));
      if (assets.length === 0) {
        const allTerminal = Object.values(session.assetRequests ?? {}).every((asset) =>
          deletedAssetIds.has(asset.assetId) || preservedAssetIds.has(asset.assetId));
        const status = allTerminal && preservedAssetIds.size === 0 ? 'abandoned' : 'cleanup-queued';
        const finalRecord = await dependencies.repository.markCleanupState({
          ownerId: input.uid,
          uploadSessionId: session.uploadSessionId,
          status,
          reason: request.reason,
          cleanupQueuedAt: session.cleanupQueuedAt ?? now(),
          ...(status === 'abandoned' ? { completedAt: now() } : {}),
          deletedAssetIds: [],
          preservedAssetIds: [],
          expectedStatuses: ['cleanup-queued'],
        });
        if (!finalRecord) throw new ListeningUploadSessionError('cleanup_state_race', 409);
        return {
          status,
          uploadSessionId: session.uploadSessionId,
          deletedCount: 0,
          preservedCount: preservedAssetIds.size,
          skippedCount: requestedAssets.length,
        };
      }

      for (const candidate of assets) {
        // Re-read both the session and the asset immediately before reference
        // discovery. The browser never supplies a key; the key is re-derived.
        const before = await dependencies.repository.get(input.uid, session.uploadSessionId);
        if (!before || before.ownerId !== input.uid) {
          throw new ListeningUploadSessionError('upload_session_not_found', 404);
        }
        if (before.status === 'committing' || before.status === 'completed') {
          preservedAssetIds.add(candidate.assetId);
          continue;
        }
        if (before.status !== 'cleanup-queued') {
          throw new ListeningUploadSessionError('cleanup_state_race', 409);
        }
        const currentAsset = Object.values(before.assetRequests ?? {})
          .find((asset) => asset.assetId === candidate.assetId);
        if (!currentAsset) {
          preservedAssetIds.add(candidate.assetId);
          continue;
        }
        const expectedKey = canonicalTempKeyForAsset(input.uid, before.uploadSessionId, currentAsset);
        if (currentAsset.tempKey !== expectedKey || !expectedKey.startsWith('temp/listening/')) {
          preservedAssetIds.add(candidate.assetId);
          throw new ListeningUploadSessionError('asset_key_mismatch', 409);
        }

        let references;
        try {
          references = await dependencies.repository.findDurableAssetReferences({
            ownerId: input.uid,
            uploadSessionId: before.uploadSessionId,
            assetIds: [currentAsset.assetId],
            tempKeys: [expectedKey],
          });
        } catch {
          // The session is already queued, so an unavailable reference scan is
          // safe: retry later; never treat an unknown scan as zero references.
          throw new ListeningUploadSessionError('reference_scan_failed', 500);
        }
        if (referenceAssetIds(references).has(currentAsset.assetId)) {
          preservedAssetIds.add(currentAsset.assetId);
          continue;
        }

        // Final status + reference check is deliberately per asset and directly
        // adjacent to the delete. This closes the common cleanup-vs-commit TOCTOU.
        const finalSession = await dependencies.repository.get(input.uid, before.uploadSessionId);
        if (!finalSession || finalSession.status !== 'cleanup-queued') {
          preservedAssetIds.add(currentAsset.assetId);
          continue;
        }
        const finalAsset = Object.values(finalSession.assetRequests ?? {})
          .find((asset) => asset.assetId === currentAsset.assetId);
        if (!finalAsset) {
          preservedAssetIds.add(currentAsset.assetId);
          continue;
        }
        const finalExpectedKey = canonicalTempKeyForAsset(input.uid, finalSession.uploadSessionId, finalAsset);
        if (finalAsset.tempKey !== finalExpectedKey || finalExpectedKey !== expectedKey) {
          preservedAssetIds.add(currentAsset.assetId);
          throw new ListeningUploadSessionError('asset_key_mismatch', 409);
        }
        let finalReferences;
        try {
          finalReferences = await dependencies.repository.findDurableAssetReferences({
            ownerId: input.uid,
            uploadSessionId: finalSession.uploadSessionId,
            assetIds: [finalAsset.assetId],
            tempKeys: [finalExpectedKey],
          });
        } catch {
          throw new ListeningUploadSessionError('reference_scan_failed', 500);
        }
        if (referenceAssetIds(finalReferences).has(finalAsset.assetId)) {
          preservedAssetIds.add(finalAsset.assetId);
          continue;
        }

        // Refresh the fence via CAS immediately before R2 mutation. A commit
        // cannot overwrite this state because markCleanupState only accepts
        // active/cleanup-queued records and issueAsset rejects queued records.
        const fence = await dependencies.repository.markCleanupState({
          ownerId: input.uid,
          uploadSessionId: finalSession.uploadSessionId,
          status: 'cleanup-queued',
          reason: request.reason,
          cleanupQueuedAt: finalSession.cleanupQueuedAt ?? now(),
          deletedAssetIds: [],
          preservedAssetIds: [],
          expectedStatuses: ['cleanup-queued'],
          cleanupFence: {
            assetId: finalAsset.assetId,
            leaseId: issueOpaqueId(),
            claimedAt: now(),
          },
        });
        if (!fence) {
          preservedAssetIds.add(finalAsset.assetId);
          continue;
        }
        const cleanupLease = await dependencies.repository.acquireCleanupLease({
          ownerId: input.uid,
          uploadSessionId: fence.uploadSessionId,
          assetId: finalAsset.assetId,
          leaseId: fence.cleanupFence?.leaseId ?? issueOpaqueId(),
          now: now(),
          leaseMs: 10 * 60 * 1000,
        });
        if (!cleanupLease) throw new ListeningUploadSessionError('cleanup_busy', 503);
        try {
          // The authoring-root lease makes this reference scan and delete one
          // serialized critical section with save/publish transactions.
          let fencedReferences;
          try {
            fencedReferences = await dependencies.repository.findDurableAssetReferences({
              ownerId: input.uid,
              uploadSessionId: fence.uploadSessionId,
              assetIds: [finalAsset.assetId],
              tempKeys: [finalExpectedKey],
            });
          } catch {
            throw new ListeningUploadSessionError('reference_scan_failed', 500);
          }
          if (referenceAssetIds(fencedReferences).has(finalAsset.assetId)) {
            preservedAssetIds.add(finalAsset.assetId);
            continue;
          }

          if (!await dependencies.repository.assertCleanupLeaseOwned(cleanupLease, now())) {
            throw new ListeningUploadSessionError('cleanup_lease_lost', 503);
          }
          await dependencies.repository.recordDeletedTempAsset({
            lease: cleanupLease,
            tempKey: finalExpectedKey,
            deletedAt: now(),
            state: 'deletion-pending',
          });
          if (!await dependencies.repository.assertCleanupLeaseOwned(cleanupLease, now())) {
            throw new ListeningUploadSessionError('cleanup_lease_lost', 503);
          }
          await deleteUploadedAsset(input.env, finalAsset);
          await dependencies.repository.recordDeletedTempAsset({
            lease: cleanupLease,
            tempKey: finalExpectedKey,
            deletedAt: now(),
            state: 'deleted',
          });
          preservedAssetIds.delete(finalAsset.assetId);
          deletedAssetIds.add(finalAsset.assetId);
          const allTerminal = Object.values(fence.assetRequests ?? {}).every((asset) =>
            deletedAssetIds.has(asset.assetId) || preservedAssetIds.has(asset.assetId));
          const status = allTerminal && preservedAssetIds.size === 0 ? 'abandoned' : 'cleanup-queued';
          const updated = await dependencies.repository.markCleanupState({
            ownerId: input.uid,
            uploadSessionId: finalSession.uploadSessionId,
            status,
            reason: request.reason,
            cleanupQueuedAt: fence.cleanupQueuedAt ?? now(),
            ...(status === 'abandoned' ? { completedAt: now() } : {}),
            deletedAssetIds: [finalAsset.assetId],
            preservedAssetIds: [...preservedAssetIds],
            expectedStatuses: ['cleanup-queued'],
          });
          if (!updated) throw new ListeningUploadSessionError('cleanup_state_race', 409);
          session = updated;
        } finally {
          await dependencies.repository.releaseCleanupLease(cleanupLease);
        }
      }

      const allTerminal = Object.values(session.assetRequests ?? {}).every((asset) =>
        deletedAssetIds.has(asset.assetId) || preservedAssetIds.has(asset.assetId));
      const finalStatus = allTerminal && preservedAssetIds.size === 0 ? 'abandoned' : 'cleanup-queued';
      const persisted = session.status === 'abandoned'
        ? session
        : await dependencies.repository.markCleanupState({
          ownerId: input.uid,
          uploadSessionId: session.uploadSessionId,
          status: finalStatus,
          reason: request.reason,
          cleanupQueuedAt: session.cleanupQueuedAt ?? now(),
          ...(finalStatus === 'abandoned' ? { completedAt: now() } : {}),
          deletedAssetIds: [...deletedAssetIds],
          preservedAssetIds: [...preservedAssetIds],
          expectedStatuses: ['cleanup-queued'],
        });
      if (!persisted) throw new ListeningUploadSessionError('cleanup_state_race', 409);
      return {
        status: persisted.status,
        uploadSessionId: persisted.uploadSessionId,
        deletedCount: deletedAssetIds.size,
        preservedCount: preservedAssetIds.size,
        skippedCount: requestedAssets.length - assets.length,
      };
    },
  };
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    throw new ListeningUploadSessionError('invalid_request', 400);
  }
};

const createServiceFromEnv = (input: {
  env: Record<string, unknown>;
  repository?: ListeningUploadSessionRepository;
  now: () => number;
  createOpaqueId?: () => string;
  idempotencySecret?: string;
  grantSecret?: string;
}) => {
  const repository = input.repository ?? new FirebaseRestListeningUploadSessionRepository({
    env: input.env,
  });
  const grantSecret = input.grantSecret ?? requireSecret(
    typeof input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET === 'string'
      ? input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET
      : undefined,
    'grant_secret_unavailable',
  );

  return createListeningUploadSessionService({
    repository,
    idempotencySecret: input.idempotencySecret ?? grantSecret,
    grantSecret,
    now: input.now,
    createOpaqueId: input.createOpaqueId,
  });
};

export const createListeningUploadSessionHandlers = (options: {
  repository?: ListeningUploadSessionRepository;
  now?: () => number;
  createOpaqueId?: () => string;
  idempotencySecret?: string;
  grantSecret?: string;
} = {}) => ({
  async createSession(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      let service: ReturnType<typeof createServiceFromEnv>;
      try {
        service = createServiceFromEnv({
          env: input.env,
          repository: options.repository,
          now: options.now ?? input.now,
          createOpaqueId: options.createOpaqueId,
          idempotencySecret: options.idempotencySecret,
          grantSecret: options.grantSecret,
        });
      } catch {
        throw new ListeningUploadSessionError('bridge_service_init_failed', 500);
      }
      let body: unknown;
      try {
        body = await readJsonBody(input.request);
      } catch (error) {
        if (error instanceof ListeningUploadSessionError) throw error;
        throw new ListeningUploadSessionError('bridge_body_read_failed', 500);
      }
      return {
        body: await service.createSession({
          uid: input.uid,
          idempotencyKey: input.request.headers.get('Idempotency-Key'),
          body,
        }),
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },

  async issueAsset(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      const service = createServiceFromEnv({
        env: input.env,
        repository: options.repository,
        now: options.now ?? input.now,
        createOpaqueId: options.createOpaqueId,
        idempotencySecret: options.idempotencySecret,
        grantSecret: options.grantSecret,
      });
      return {
        body: await service.issueAsset({
          uid: input.uid,
          idempotencyKey: input.request.headers.get('Idempotency-Key'),
          body: await readJsonBody(input.request),
          uploadTransportOrigin: resolveLocalUploadTransportOrigin(input.request, input.env),
        }),
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },

  async probeAsset(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      const service = createServiceFromEnv({
        env: input.env,
        repository: options.repository,
        now: options.now ?? input.now,
        createOpaqueId: options.createOpaqueId,
        idempotencySecret: options.idempotencySecret,
        grantSecret: options.grantSecret,
      });
      const probeTarget = await service.resolveAssetForProbe({
        uid: input.uid,
        body: await readJsonBody(input.request),
      });
      return {
        body: {
          status: 'ready',
          assetId: probeTarget.asset.assetId,
          uploadSessionId: probeTarget.uploadSessionId,
          contentType: probeTarget.asset.declaredMimeType,
          sizeBytes: probeTarget.asset.sizeBytes,
          range: await probeUploadedAssetRange(input.env, probeTarget.asset),
        },
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },

  async cancelSession(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      const service = createServiceFromEnv({
        env: input.env,
        repository: options.repository,
        now: options.now ?? input.now,
        createOpaqueId: options.createOpaqueId,
        idempotencySecret: options.idempotencySecret,
        grantSecret: options.grantSecret,
      });
      return {
        body: await service.cancelSession({
          uid: input.uid,
          body: await readJsonBody(input.request),
          env: input.env,
        }),
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },
});

export type {
  ListeningUploadAssetRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
};
