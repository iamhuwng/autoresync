import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import {
  createBookSourceVersionStorageIdentity,
} from './sourceVersion.service';
import {
  validateBookSourceUploadAccountState,
} from './sourceUpload.rtdbRepository';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const RETIRED_STATES = new Set([
  'queued',
  'preflighted',
  'delete-started',
  'absence-verified',
  'settled',
]);

export type BookSourceRecoveryPhase =
  | 'restoring_canonical_authority'
  | 'rebuilding'
  | 'reconciling';

/** Recovery metadata is transport authority, never a provider or PDF payload. */
export interface BookSourceRecoveryContext {
  readonly recoveryOperationId: string;
  readonly phase: BookSourceRecoveryPhase;
}

export interface BookSourceRecoveryAvailabilityEvidence {
  readonly available: boolean;
  /** Optional exact provider-neutral metadata proof; never contains body bytes. */
  readonly identity?: BookSourceVersionStorageIdentity;
}

export interface BookSourceRecoveryAuthority {
  readonly accountId: string;
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly operationKind: BookSourceUploadOperation['kind'];
  readonly storage: BookSourceVersionStorageIdentity;
  readonly available: boolean;
}

export interface BookSourceRecoveryDiagnostic {
  readonly code:
    | 'invalid-source-account'
    | 'source-version-missing'
    | 'source-version-unavailable'
    | 'source-version-approved-removed'
    | 'source-owner-mismatch'
    | 'source-identity-mismatch'
    | 'availability-proof-missing'
    | 'availability-proof-false';
  readonly sourceVersionId?: string;
  readonly path: string;
  readonly message: string;
}

export interface BookSourceRecoveryValidationResult {
  readonly authorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly missingSourceVersionIds: readonly string[];
  readonly diagnostics: readonly BookSourceRecoveryDiagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const sameStorageIdentity = (
  left: BookSourceVersionStorageIdentity,
  right: BookSourceVersionStorageIdentity,
): boolean => (
  left.bookId === right.bookId
  && left.sourceVersionId === right.sourceVersionId
  && left.storageLocationId === right.storageLocationId
  && left.providerKind === right.providerKind
  && left.privateBucketId === right.privateBucketId
  && left.providerObjectKey === right.providerObjectKey
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId
  && left.byteSize === right.byteSize
  && left.checksum.algorithm === right.checksum.algorithm
  && left.checksum.value.toLowerCase() === right.checksum.value.toLowerCase()
);

const retiredSourceVersionIds = (value: unknown, result = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((entry) => retiredSourceVersionIds(entry, result));
    return result;
  }
  if (!isRecord(value)) return result;
  if (
    typeof value.sourceVersionId === 'string'
    && RETIRED_STATES.has(String(value.state))
    && isRecord(value.deleteIdentity)
    && value.deleteIdentity.kind === 'retired-byte-exact-version'
    && value.deleteIdentity.serviceIdentity === 'book_retired_byte_deletion_service'
    && isRecord(value.recovery)
    && value.recovery.metadataOnly === true
    && value.recovery.rollbackAfterBoundary === 'not-available'
  ) {
    result.add(value.sourceVersionId);
  }
  Object.values(value).forEach((entry) => retiredSourceVersionIds(entry, result));
  return result;
};

const addDiagnostic = (
  diagnostics: BookSourceRecoveryDiagnostic[],
  diagnostic: BookSourceRecoveryDiagnostic,
): void => {
  if (!diagnostics.some((entry) => (
    entry.code === diagnostic.code
    && entry.path === diagnostic.path
    && entry.sourceVersionId === diagnostic.sourceVersionId
  ))) diagnostics.push(diagnostic);
};

const safeAvailability = (
  evidence: Readonly<Record<string, boolean | BookSourceRecoveryAvailabilityEvidence>> | undefined,
  sourceVersionId: string,
): BookSourceRecoveryAvailabilityEvidence | undefined => {
  const value = evidence?.[sourceVersionId];
  if (typeof value === 'boolean') return { available: value };
  return value;
};

/**
 * Validate Source authority without reading, copying, deleting, or recreating
 * provider bytes. A true external-availability claim is required before a
 * Source Version can be used by a recovery Delivery projection.
 */
export const validateBookSourceRecoveryAuthority = (input: {
  readonly uploadAccounts: unknown;
  readonly retiredByteDeletions?: unknown;
  readonly sourceVersionIds: readonly string[];
  readonly expectedOwnerId?: string;
  readonly availability?: Readonly<Record<string, boolean | BookSourceRecoveryAvailabilityEvidence>>;
  /** Capture validation may defer external proof; restore validation may not. */
  readonly requireAvailabilityProof?: boolean;
}): BookSourceRecoveryValidationResult => {
  const diagnostics: BookSourceRecoveryDiagnostic[] = [];
  const authorities = new Map<string, BookSourceRecoveryAuthority>();
  const removed = retiredSourceVersionIds(input.retiredByteDeletions);
  const accounts = isRecord(input.uploadAccounts) ? input.uploadAccounts : {};

  for (const [accountId, candidate] of Object.entries(accounts)) {
    let state: BookSourceUploadAccountState;
    try {
      state = validateBookSourceUploadAccountState(candidate);
    } catch (error) {
      addDiagnostic(diagnostics, {
        code: 'invalid-source-account',
        path: `book_source_upload_accounts/${accountId}`,
        message: error instanceof Error ? error.message : 'Source upload account state is invalid.',
      });
      continue;
    }
    for (const operation of Object.values(state.operations)) {
      if (operation.status !== 'verified_completed' || !operation.verifiedStorage) continue;
      let storage: BookSourceVersionStorageIdentity;
      try {
        storage = createBookSourceVersionStorageIdentity(operation.verifiedStorage);
      } catch (error) {
        addDiagnostic(diagnostics, {
          code: 'source-identity-mismatch',
          sourceVersionId: operation.sourceVersionId,
          path: `book_source_upload_accounts/${accountId}/operations/${operation.reservationId}`,
          message: error instanceof Error ? error.message : 'Verified Source Version identity is invalid.',
        });
        continue;
      }
      if (
        storage.sourceVersionId !== operation.sourceVersionId
        || storage.bookId !== operation.bookId
        || storage.byteSize !== operation.byteSize
        || storage.checksum.value.toLowerCase() !== operation.expectedChecksum.value.toLowerCase()
      ) {
        addDiagnostic(diagnostics, {
          code: 'source-identity-mismatch',
          sourceVersionId: operation.sourceVersionId,
          path: `book_source_upload_accounts/${accountId}/operations/${operation.reservationId}`,
          message: 'Verified Source Version metadata does not match its canonical upload operation.',
        });
        continue;
      }
      if (input.expectedOwnerId !== undefined && operation.ownerId !== input.expectedOwnerId) {
        // An owner mismatch is an unauthorized Source, never usable authority.
        // Keep the canonical record for diagnostics, but make Delivery remain
        // unavailable and prevent any recovery projection from consuming it.
        const proof = safeAvailability(input.availability, operation.sourceVersionId);
        addDiagnostic(diagnostics, {
          code: 'source-owner-mismatch',
          sourceVersionId: operation.sourceVersionId,
          path: `book_source_upload_accounts/${accountId}/operations/${operation.reservationId}/ownerId`,
          message: 'Source Version owner does not match the recovery owner scope.',
        });
        if (proof?.available === true) {
          addDiagnostic(diagnostics, {
            code: 'source-version-unavailable',
            sourceVersionId: operation.sourceVersionId,
            path: `sourceVersionIds/${operation.sourceVersionId}`,
            message: 'Unauthorized Source Version authority is unavailable to this recovery owner.',
          });
        }
      }
      if (authorities.has(operation.sourceVersionId)) {
        addDiagnostic(diagnostics, {
          code: 'source-identity-mismatch',
          sourceVersionId: operation.sourceVersionId,
          path: `book_source_upload_accounts/${accountId}/operations/${operation.reservationId}/sourceVersionId`,
          message: 'A Source Version is claimed by more than one canonical operation.',
        });
        continue;
      }
      const proof = safeAvailability(input.availability, operation.sourceVersionId);
      let available = proof?.available === true
        && (input.expectedOwnerId === undefined || operation.ownerId === input.expectedOwnerId);
      if (proof === undefined && input.requireAvailabilityProof === false) available = true;
      if (proof === undefined) {
        if (input.requireAvailabilityProof !== false) {
          addDiagnostic(diagnostics, {
            code: 'availability-proof-missing',
            sourceVersionId: operation.sourceVersionId,
            path: `sourceVersionIds/${operation.sourceVersionId}`,
            message: 'Explicit external availability evidence is required; recovery never probes or recreates provider objects.',
          });
        }
      } else if (!proof.available) {
        addDiagnostic(diagnostics, {
          code: 'availability-proof-false',
          sourceVersionId: operation.sourceVersionId,
          path: `sourceVersionIds/${operation.sourceVersionId}`,
          message: 'External availability evidence denies this Source Version.',
        });
      } else if (proof.identity !== undefined && !sameStorageIdentity(storage, proof.identity)) {
        available = false;
        addDiagnostic(diagnostics, {
          code: 'source-identity-mismatch',
          sourceVersionId: operation.sourceVersionId,
          path: `sourceVersionIds/${operation.sourceVersionId}`,
          message: 'External availability evidence does not match the pinned Source Version identity.',
        });
      }
      if (removed.has(operation.sourceVersionId)) {
        available = false;
        addDiagnostic(diagnostics, {
          code: 'source-version-approved-removed',
          sourceVersionId: operation.sourceVersionId,
          path: `sourceVersionIds/${operation.sourceVersionId}`,
          message: 'An approved replacement deletion owns this Source Version; recovery must not revive it.',
        });
      }
      authorities.set(operation.sourceVersionId, Object.freeze({
        accountId,
        reservationId: operation.reservationId,
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        sourceKey: operation.sourceKey,
        ownerId: operation.ownerId,
        operationKind: operation.kind,
        storage,
        available,
      }));
    }
  }

  const requested = [...new Set(input.sourceVersionIds)];
  const missingSourceVersionIds: string[] = [];
  for (const sourceVersionId of requested) {
    const authority = authorities.get(sourceVersionId);
    if (!SAFE_ID.test(sourceVersionId) || !authority || !authority.available) {
      missingSourceVersionIds.push(sourceVersionId);
      if (!authority) {
        addDiagnostic(diagnostics, {
          code: 'source-version-missing',
          sourceVersionId,
          path: `sourceVersionIds/${sourceVersionId}`,
          message: 'No verified canonical Source Version authority exists for this reference.',
        });
      } else if (!diagnostics.some((entry) => entry.sourceVersionId === sourceVersionId && (
        entry.code === 'availability-proof-missing'
        || entry.code === 'availability-proof-false'
        || entry.code === 'source-version-approved-removed'
        || entry.code === 'source-identity-mismatch'
      ))) {
        addDiagnostic(diagnostics, {
          code: 'source-version-unavailable',
          sourceVersionId,
          path: `sourceVersionIds/${sourceVersionId}`,
          message: 'Canonical Source Version authority is not externally available for recovery.',
        });
      }
    }
  }

  return Object.freeze({
    authorities,
    missingSourceVersionIds: Object.freeze([...new Set(missingSourceVersionIds)].sort()),
    diagnostics: Object.freeze(diagnostics),
  });
};

/** Explicit gate used by normal Source producers when a recovery context exists. */
export const isBookSourceRecoveryContext = (
  value: unknown,
): value is BookSourceRecoveryContext => (
  isRecord(value)
  && typeof value.recoveryOperationId === 'string'
  && SAFE_ID.test(value.recoveryOperationId)
  && (value.phase === 'restoring_canonical_authority'
    || value.phase === 'rebuilding'
    || value.phase === 'reconciling')
);
