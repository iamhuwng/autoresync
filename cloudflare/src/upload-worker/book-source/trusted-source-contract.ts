import type { TrustedBookSourceVersionProjection } from '../../../../src/types/bookAssembly.types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const HASH = /^[a-f0-9]{64}$/iu;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const BOOK_SOURCE_PURPOSES = ['book-source', 'student-document'] as const;
export type BookSourcePurpose = (typeof BOOK_SOURCE_PURPOSES)[number];

export const STUDENT_SAFE_STATUSES = [
  'unreviewed',
  'review-required',
  'ready',
  'rejected',
] as const;
export type StudentSafeStatus = (typeof STUDENT_SAFE_STATUSES)[number];

export const STUDENT_SAFE_REASON_CODES = [
  'teacher-reviewed',
  'teacher-only-content',
  'invalid-document',
  'superseded',
] as const;
export type StudentSafeReasonCode = (typeof STUDENT_SAFE_REASON_CODES)[number];

export interface StudentSafeDecision {
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly sourceVersionId: string;
  readonly sha256Hex: string;
  readonly reasonCode: StudentSafeReasonCode;
}

export interface TrustedSourceSafety {
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: StudentSafeStatus;
  readonly studentSafeDecision?: StudentSafeDecision;
}

export interface ReadyTrustedSourceSafety extends TrustedSourceSafety {
  readonly studentSafeStatus: 'ready';
  readonly studentSafeDecision: StudentSafeDecision;
}

export interface TrustedSourceChecksum {
  readonly algorithm: 'sha-256';
  readonly value: string;
}

export type BookSourceAuthorityRole = 'teacher' | 'super_admin';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isIso = (value: unknown): value is string => (
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value))
);

export const isActiveBookSourceAuthorityProfile = (
  value: unknown,
  role: BookSourceAuthorityRole,
): boolean => {
  if (!isRecord(value)) return false;
  return value.role === role
    && value.status === 'active'
    && value.disabled !== true
    && value.forceReauth !== true
    && (value.privilegedAuthorityRevokedAt === undefined
      || value.privilegedAuthorityRevokedAt === null);
};

export const readTrustedSourceChecksum = (value: unknown): TrustedSourceChecksum | null => {
  if (!isRecord(value)
    || !exactKeys(value, ['algorithm', 'value'])
    || value.algorithm !== 'sha-256'
    || typeof value.value !== 'string'
    || !HASH.test(value.value)) return null;
  return Object.freeze({ algorithm: 'sha-256' as const, value: value.value.toLowerCase() });
};

export const readTrustedSourceSafety = (
  value: unknown,
  expected: {
    readonly sourceVersionId: string;
    readonly purpose?: BookSourcePurpose;
    readonly checksum: unknown;
  },
): TrustedSourceSafety | null => {
  if (!isRecord(value)) return null;
  const safety = {
    purpose: value.purpose,
    studentSafeStatus: value.studentSafeStatus,
    studentSafeDecision: value.studentSafeDecision,
  };
  if (!BOOK_SOURCE_PURPOSES.includes(safety.purpose as BookSourcePurpose)
    || (expected.purpose !== undefined && safety.purpose !== expected.purpose)
    || !STUDENT_SAFE_STATUSES.includes(safety.studentSafeStatus as StudentSafeStatus)) {
    return null;
  }
  if (safety.studentSafeStatus === 'unreviewed') {
    if (safety.studentSafeDecision !== undefined) return null;
    return Object.freeze({
      purpose: safety.purpose as BookSourcePurpose,
      studentSafeStatus: safety.studentSafeStatus as StudentSafeStatus,
    });
  }
  if (!isRecord(safety.studentSafeDecision)
    || !exactKeys(safety.studentSafeDecision, [
      'decidedBy', 'decidedAt', 'sourceVersionId', 'sha256Hex', 'reasonCode',
    ])
    || typeof safety.studentSafeDecision.decidedBy !== 'string'
    || !ID.test(safety.studentSafeDecision.decidedBy)
    || !isIso(safety.studentSafeDecision.decidedAt)
    || safety.studentSafeDecision.sourceVersionId !== expected.sourceVersionId
    || typeof safety.studentSafeDecision.sha256Hex !== 'string'
    || !HASH.test(safety.studentSafeDecision.sha256Hex)
    || readTrustedSourceChecksum(expected.checksum)?.value
      !== safety.studentSafeDecision.sha256Hex.toLowerCase()
    || !STUDENT_SAFE_REASON_CODES.includes(safety.studentSafeDecision.reasonCode as StudentSafeReasonCode)) {
    return null;
  }
  return Object.freeze({
    purpose: safety.purpose as BookSourcePurpose,
    studentSafeStatus: safety.studentSafeStatus as StudentSafeStatus,
    studentSafeDecision: Object.freeze({
      decidedBy: safety.studentSafeDecision.decidedBy,
      decidedAt: safety.studentSafeDecision.decidedAt,
      sourceVersionId: safety.studentSafeDecision.sourceVersionId,
      sha256Hex: safety.studentSafeDecision.sha256Hex.toLowerCase(),
      reasonCode: safety.studentSafeDecision.reasonCode as StudentSafeReasonCode,
    }),
  });
};

const TRUSTED_SOURCE_PROJECTION_KEYS = [
  'ownerId',
  'bookId',
  'sourceKey',
  'sourceVersionId',
  'checksum',
  'physicalPageCount',
  'verifiedUsable',
  'purpose',
  'studentSafeStatus',
] as const;

const TRUSTED_SOURCE_PROJECTION_DECISION_KEYS = [
  ...TRUSTED_SOURCE_PROJECTION_KEYS,
  'studentSafeDecision',
] as const;

const exactTrustedProjectionKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const actual = Reflect.ownKeys(value);
  return actual.length === expected.length
    && actual.every((key) => typeof key === 'string' && expected.includes(key));
};

const validTrustedProjectionId = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u.test(value)
);

export interface TrustedBookSourceProjectionExpectation {
  readonly ownerId: string | undefined;
  readonly bookId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly purpose?: BookSourcePurpose;
}

/**
 * Parses one raw assemblyBooks Source Version leaf into the provider-free
 * authority projection shared by Assembly and attachment persistence.
 */
export const readTrustedBookSourceProjection = (
  value: unknown,
  expected: TrustedBookSourceProjectionExpectation,
): TrustedBookSourceVersionProjection | null => {
  if (!isRecord(value)
    || !validTrustedProjectionId(expected.ownerId)
    || !validTrustedProjectionId(expected.bookId)
    || !validTrustedProjectionId(expected.sourceKey)
    || !validTrustedProjectionId(expected.sourceVersionId)) return null;

  const checksum = readTrustedSourceChecksum(value.checksum);
  const safety = readTrustedSourceSafety(value, {
    sourceVersionId: expected.sourceVersionId,
    purpose: expected.purpose ?? 'book-source',
    checksum: value.checksum,
  });
  const projectionKeys = safety?.studentSafeDecision === undefined
    ? TRUSTED_SOURCE_PROJECTION_KEYS
    : TRUSTED_SOURCE_PROJECTION_DECISION_KEYS;
  if (!exactTrustedProjectionKeys(value, projectionKeys)
    || value.ownerId !== expected.ownerId
    || value.bookId !== expected.bookId
    || value.sourceKey !== expected.sourceKey
    || value.sourceVersionId !== expected.sourceVersionId
    || !checksum
    || !safety
    || safety.studentSafeStatus === 'rejected'
    || value.verifiedUsable !== true
    || typeof value.physicalPageCount !== 'number'
    || !Number.isSafeInteger(value.physicalPageCount)
    || value.physicalPageCount < 1
    || value.physicalPageCount > 100_000) return null;

  return Object.freeze({
    sourceKey: expected.sourceKey,
    sourceVersionId: expected.sourceVersionId,
    bookId: expected.bookId,
    checksum,
    physicalPageCount: value.physicalPageCount,
    verifiedUsable: true,
    ...safety,
  });
};

export const readReadyBookSourceSafety = (
  value: unknown,
  sourceVersionId: string,
): ReadyTrustedSourceSafety | null => {
  const raw = isRecord(value) ? value : undefined;
  const safety = readTrustedSourceSafety(value, {
    sourceVersionId,
    purpose: 'book-source',
    checksum: raw?.checksum,
  });
  if (safety?.studentSafeStatus !== 'ready' || safety.studentSafeDecision === undefined) return null;
  return safety as ReadyTrustedSourceSafety;
};
