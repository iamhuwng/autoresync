import { SignJWT, importPKCS8 } from 'jose';
import type { ClassBookCommandClaims } from '../class-book-placement/command-types.ts';

const IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const FIREBASE_TOKEN_EXCHANGE_REFERER = 'https://r2-upload-signer.iamhuwng.workers.dev/';
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SAFE_BOOK_HOMEWORK_ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;
const SAFE_BOOK_RESULT_GROUP_KEY = /^g_[A-Za-z0-9_-]{4,638}$/u;
const SAFE_EVALUATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

export type FirebaseTokenExchangeProviderCode =
  | 'INVALID_CUSTOM_TOKEN'
  | 'CREDENTIAL_MISMATCH'
  | 'INVALID_PROVIDER_ID'
  | 'USER_DISABLED'
  | 'INVALID_LOGIN_CREDENTIALS'
  | 'TOO_MANY_ATTEMPTS_TRY_LATER'
  | 'OPERATION_NOT_ALLOWED'
  | 'PROJECT_NOT_FOUND'
  | 'API_KEY_INVALID'
  | 'QUOTA_EXCEEDED';

const FIREBASE_TOKEN_EXCHANGE_PROVIDER_CODES = new Set<FirebaseTokenExchangeProviderCode>([
  'INVALID_CUSTOM_TOKEN',
  'CREDENTIAL_MISMATCH',
  'INVALID_PROVIDER_ID',
  'USER_DISABLED',
  'INVALID_LOGIN_CREDENTIALS',
  'TOO_MANY_ATTEMPTS_TRY_LATER',
  'OPERATION_NOT_ALLOWED',
  'PROJECT_NOT_FOUND',
  'API_KEY_INVALID',
  'QUOTA_EXCEEDED',
]);

export const isFirebaseTokenExchangeProviderCode = (
  value: unknown,
): value is FirebaseTokenExchangeProviderCode => (
  typeof value === 'string' && FIREBASE_TOKEN_EXCHANGE_PROVIDER_CODES.has(value as FirebaseTokenExchangeProviderCode)
);

export type BookFirebaseClaimTuple =
  | ClassBookCommandClaims
  | { readonly service: 'book_public_readiness'; readonly bookId: string; readonly ownerId: string; readonly publicationId: string; readonly publicationRevision: number; readonly accountId: string; readonly setupActivationIndex?: string }
  | { readonly service: 'book_public_reader'; readonly bookId: string; readonly studentId: string }
  | {
    readonly service: 'book_activity_evaluation';
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly activityId: string;
    readonly attemptId: string;
  }
  | { readonly service: 'book_activity_authoring'; readonly ownerId: string }
  | {
    readonly service: 'book_assembly';
    readonly bookId: string;
    readonly unitKey: string;
    readonly ownerId: string;
  }
  | { readonly service: 'book_assembly_activation'; readonly bookId: string; readonly ownerId: string; readonly operationId: string; readonly setupActivationIndex: string; readonly expectedBookRevision: number; readonly expectedSourceSetRevision: number; readonly inputFingerprint: string }
  | {
    /** Read-only key discovery at one owned Book's Assembly units parent. */
    readonly service: 'book_assembly_draft_discovery';
    readonly bookId: string;
    readonly ownerId: string;
  }
  | {
    /** Dedicated exact-leaf claim; do not use for general Assembly readers. */
    readonly service: 'book_assembly_activity_binding';
    readonly bookId: string;
    readonly unitKey: string;
    readonly activityKey: string;
    readonly ownerId: string;
  }
  | {
    readonly service: 'book_assembly_preview';
    readonly bookId: string;
    readonly unitKey: string;
    readonly ownerId: string;
  }
  | {
    /** Dedicated approval/revocation leaf reader and create-only writer. */
    readonly service: 'book_assembly_preview_approval';
    readonly bookId: string;
    readonly unitKey: string;
    readonly approvalId: string;
    readonly ownerId: string;
  }
  | {
    /** Exact per-recipient Firestore authority capability. */
    readonly service: 'book_homework_authority';
    readonly authorityId: string;
    /** Root assignment/saga identity, distinct from authorityId. */
    readonly assignmentId: string;
    readonly ownerId: string;
  }
  | {
    /** Exact compatibility-shell projection capability. */
    readonly service: 'book_homework_compatibility';
    readonly assignmentId: string;
    readonly ownerId: string;
  }
  // `assignmentId` is mandatory for the Firestore authority path.  The
  // owner-only form remains accepted for the existing RTDB claim contract;
  // Firestore repository requests never use that legacy form.
  | { readonly service: 'book_homework'; readonly assignmentId?: string; readonly ownerId?: string }
  | {
    readonly service: 'book_delivery';
    readonly recipientId?: string;
    readonly contextId?: string;
  }
  | {
    readonly service: 'book_assembly_publication';
    readonly bookId: string;
    readonly ownerId: string;
  }
  | {
    /** Dedicated canonical Activity-version and student-safe projection writer. */
    readonly service: 'book_activity_publication_writer';
    readonly ownerId: string;
    readonly activityId: string;
    readonly activityVersionId: string;
  }
  | {
    /** Dedicated approval/revocation leaf reader for publication preflight. */
    readonly service: 'book_assembly_publication_approval';
    readonly bookId: string;
    readonly unitKey: string;
    readonly approvalId: string;
    readonly ownerId: string;
  }
  | { readonly service: 'book_runtime'; readonly recipientId: string; readonly contextId: string }
  | {
    readonly service: 'book_activity_runtime_reader';
    readonly ownerId: string;
    readonly bookId: string;
    readonly manifestVersionId: string;
    readonly activityId: string;
    readonly activityVersionId: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly contextKind: 'public' | 'course' | 'class';
    readonly contextId: string;
    readonly studentId: string;
    readonly bookId: string;
    readonly groupKey?: string;
    readonly resultId?: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly resultId: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly studentId: string;
    readonly bookId: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly studentId: string;
    readonly bookId: string;
    readonly groupKey: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly studentId: string;
    readonly bookId: string;
    readonly groupKey: string;
    readonly resultId: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly homeworkId: string;
    readonly studentId: string;
    readonly bookId: string;
  }
  | {
    readonly service: 'book_result_read';
    readonly homeworkId: string;
    readonly studentId: string;
    readonly bookId: string;
    readonly groupKey: string;
    readonly resultId: string;
  };

interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key: string;
}

interface TokenExchangeResponse {
  readonly idToken?: string;
  readonly expiresIn?: string;
}

const claimTuple = (claims: BookFirebaseClaimTuple): string => JSON.stringify(claims);

const assertClaims = (claims: BookFirebaseClaimTuple): void => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error('invalid_book_firebase_claims');
  }
  const keys = Object.keys(claims).sort().join('\u0000');
  if (claims.service === 'class_book_authority') {
    const dimensions = claims.classBookOperation === 'copy' ? ['copyId']
      : claims.classBookOperation === 'lock' ? ['classPlacementId']
        : ['copyId', 'classPlacementId', 'contextId', 'courseMaterialId'];
    const required = ['service', 'classBookOperation', 'actorUid', 'classId', 'operationId',
      'inputFingerprint', 'payloadFingerprint', 'expectedRevision', 'nextRevision', ...dimensions];
    if (keys !== required.sort().join('\u0000') || !['copy', 'place', 'sync', 'lock'].includes(claims.classBookOperation)
      || ![claims.actorUid, claims.classId, claims.operationId, ...dimensions.map((key) => claims[key as keyof ClassBookCommandClaims])]
        .every((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/u.test(value))
      || ![claims.inputFingerprint, claims.payloadFingerprint].every((value) => /^[0-9a-f]{64}$/u.test(value))
      || !Number.isSafeInteger(claims.expectedRevision) || claims.expectedRevision < 0
      || !Number.isSafeInteger(claims.nextRevision) || claims.nextRevision !== claims.expectedRevision + 1
      || ((claims.classBookOperation === 'copy' || claims.classBookOperation === 'place') && claims.expectedRevision !== 0)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_public_readiness') {
    if (keys !== ['accountId', 'bookId', 'ownerId', 'publicationId', 'publicationRevision', 'service',
      ...(claims.setupActivationIndex === undefined ? [] : ['setupActivationIndex'])].sort().join('\u0000')
      || ![claims.bookId, claims.ownerId, claims.publicationId, claims.accountId].every((value) => typeof value === 'string' && SAFE_EVALUATION_ID.test(value))
      || (claims.setupActivationIndex !== undefined && !/^(0|[1-9]\d?)$/u.test(claims.setupActivationIndex))
      || !Number.isSafeInteger(claims.publicationRevision) || claims.publicationRevision < 1) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_public_reader') {
    if (keys !== 'bookId\u0000service\u0000studentId'
      || !SAFE_EVALUATION_ID.test(claims.bookId) || !SAFE_EVALUATION_ID.test(claims.studentId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_activity_evaluation') {
    if (keys !== 'activityId\u0000attemptId\u0000contextId\u0000placementId\u0000recipientId\u0000service'
      || ![claims.recipientId, claims.contextId, claims.placementId, claims.activityId, claims.attemptId]
        .every((value) => typeof value === 'string' && SAFE_EVALUATION_ID.test(value))) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_activity_authoring') {
    if (keys !== 'ownerId\u0000service' || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly') {
    if (keys !== 'bookId\u0000ownerId\u0000service\u0000unitKey'
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.unitKey)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly_activation') {
    if (keys !== 'bookId\u0000expectedBookRevision\u0000expectedSourceSetRevision\u0000inputFingerprint\u0000operationId\u0000ownerId\u0000service\u0000setupActivationIndex'
      || !SAFE_ID.test(claims.bookId) || !SAFE_ID.test(claims.ownerId) || !SAFE_ID.test(claims.operationId)
      || !/^(?:[a-f0-9]{64}|fnv1a64:[a-f0-9]{16})$/iu.test(claims.inputFingerprint)
      || !Number.isSafeInteger(claims.expectedBookRevision) || claims.expectedBookRevision < 0
      || !Number.isSafeInteger(claims.expectedSourceSetRevision) || claims.expectedSourceSetRevision < 0) throw new Error('invalid_book_firebase_claims');
      if (!/^(0|[1-9]\d?)$/u.test(claims.setupActivationIndex) || Number(claims.setupActivationIndex) >= 32) throw new Error('invalid_book_firebase_claims');
    return;
  }
  if (claims.service === 'book_assembly_draft_discovery') {
    if (keys !== 'bookId\u0000ownerId\u0000service'
      || !SAFE_ID.test(claims.bookId) || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly_activity_binding') {
    if (keys !== 'activityKey\u0000bookId\u0000ownerId\u0000service\u0000unitKey'
      || !SAFE_ID.test(claims.activityKey)
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.unitKey)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly_preview') {
    if (keys !== 'bookId\u0000ownerId\u0000service\u0000unitKey'
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.unitKey)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly_preview_approval') {
    if (keys !== 'approvalId\u0000bookId\u0000ownerId\u0000service\u0000unitKey'
      || !SAFE_ID.test(claims.approvalId)
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.unitKey)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_homework_authority') {
    if (keys !== 'assignmentId\u0000authorityId\u0000ownerId\u0000service'
      || !SAFE_BOOK_HOMEWORK_ROOT_ID.test(claims.assignmentId)
      || !SAFE_ID.test(claims.authorityId)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    const prefix = `${claims.assignmentId}--`;
    if (!claims.authorityId.startsWith(prefix) || !claims.authorityId.endsWith('--authority')) {
      throw new Error('invalid_book_firebase_claims');
    }
    const recipientId = claims.authorityId.slice(prefix.length, -'--authority'.length);
    if (!SAFE_BOOK_HOMEWORK_ROOT_ID.test(recipientId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_homework_compatibility') {
    if (keys !== 'assignmentId\u0000ownerId\u0000service'
      || !SAFE_BOOK_HOMEWORK_ROOT_ID.test(claims.assignmentId)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_homework') {
    const legacy = keys === 'ownerId\u0000service'
      && typeof claims.ownerId === 'string'
      && SAFE_ID.test(claims.ownerId);
    const scoped = (keys === 'assignmentId\u0000service'
      && typeof claims.assignmentId === 'string'
      && SAFE_ID.test(claims.assignmentId))
      || (keys === 'assignmentId\u0000ownerId\u0000service'
        && typeof claims.assignmentId === 'string'
        && SAFE_ID.test(claims.assignmentId)
        && typeof claims.ownerId === 'string'
        && SAFE_ID.test(claims.ownerId));
    if (!legacy && !scoped) throw new Error('invalid_book_firebase_claims');
    return;
  }
  if (claims.service === 'book_delivery') {
    const serviceOnly = keys === 'service';
    const scoped = keys === 'contextId\u0000recipientId\u0000service'
      && typeof claims.recipientId === 'string'
      && SAFE_ID.test(claims.recipientId)
      && typeof claims.contextId === 'string'
      && SAFE_ID.test(claims.contextId);
    if (!serviceOnly && !scoped) throw new Error('invalid_book_firebase_claims');
    return;
  }
  if (claims.service === 'book_assembly_publication') {
    if (keys !== 'bookId\u0000ownerId\u0000service'
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_activity_publication_writer') {
    if (keys !== 'activityId\u0000activityVersionId\u0000ownerId\u0000service'
      || !SAFE_ID.test(claims.ownerId)
      || !SAFE_ID.test(claims.activityId)
      || !SAFE_ID.test(claims.activityVersionId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_assembly_publication_approval') {
    if (keys !== 'approvalId\u0000bookId\u0000ownerId\u0000service\u0000unitKey'
      || !SAFE_ID.test(claims.approvalId)
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.unitKey)
      || !SAFE_ID.test(claims.ownerId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_runtime') {
    if (keys !== 'contextId\u0000recipientId\u0000service'
      || !SAFE_ID.test(claims.recipientId)
      || !SAFE_ID.test(claims.contextId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_activity_runtime_reader') {
    if (keys !== 'activityId\u0000activityVersionId\u0000bookId\u0000manifestVersionId\u0000ownerId\u0000service'
      || !SAFE_ID.test(claims.ownerId)
      || !SAFE_ID.test(claims.bookId)
      || !SAFE_ID.test(claims.manifestVersionId)
      || !SAFE_ID.test(claims.activityId)
      || !SAFE_ID.test(claims.activityVersionId)) {
      throw new Error('invalid_book_firebase_claims');
    }
    return;
  }
  if (claims.service === 'book_result_read') {
    if ('contextKind' in claims) {
      const expected = ['service', 'contextKind', 'contextId', 'studentId', 'bookId',
        ...(claims.groupKey === undefined ? [] : ['groupKey']),
        ...(claims.resultId === undefined ? [] : ['resultId'])].sort().join('\u0000');
      if (keys !== expected || !['public', 'course', 'class'].includes(claims.contextKind)
        || ![claims.contextId, claims.studentId, claims.bookId].every((value) => typeof value === 'string' && SAFE_EVALUATION_ID.test(value))
        || (claims.groupKey !== undefined && (typeof claims.groupKey !== 'string' || !SAFE_BOOK_RESULT_GROUP_KEY.test(claims.groupKey)))
        || (claims.resultId !== undefined && (typeof claims.resultId !== 'string' || !SAFE_EVALUATION_ID.test(claims.resultId)))) {
        throw new Error('invalid_book_firebase_claims');
      }
      return;
    }
    const hasResult = 'resultId' in claims;
    const hasHomework = 'homeworkId' in claims;
    const hasGroup = 'groupKey' in claims;
    const validShape = hasResult
      ? keys === (hasHomework
        ? 'bookId\u0000groupKey\u0000homeworkId\u0000resultId\u0000service\u0000studentId'
        : hasGroup
          ? 'bookId\u0000groupKey\u0000resultId\u0000service\u0000studentId'
          : 'resultId\u0000service')
        && SAFE_ID.test(claims.resultId)
        && (!hasHomework || SAFE_ID.test(claims.homeworkId))
        && (!hasGroup || SAFE_BOOK_RESULT_GROUP_KEY.test(claims.groupKey))
        && (!hasHomework || SAFE_ID.test(claims.studentId) && SAFE_ID.test(claims.bookId))
      : hasHomework
        ? keys === (hasGroup
          ? 'bookId\u0000groupKey\u0000homeworkId\u0000service\u0000studentId'
          : 'bookId\u0000homeworkId\u0000service\u0000studentId')
          && SAFE_ID.test(claims.homeworkId)
          && SAFE_ID.test(claims.studentId)
          && SAFE_ID.test(claims.bookId)
          && (!hasGroup || typeof claims.groupKey === 'string' && SAFE_BOOK_RESULT_GROUP_KEY.test(claims.groupKey))
        : keys === (hasGroup
          ? 'bookId\u0000groupKey\u0000service\u0000studentId'
          : 'bookId\u0000service\u0000studentId')
          && SAFE_ID.test(claims.studentId)
          && SAFE_ID.test(claims.bookId)
          && (!hasGroup || SAFE_BOOK_RESULT_GROUP_KEY.test(claims.groupKey));
    if (!validShape) throw new Error('invalid_book_firebase_claims');
    return;
  }
  throw new Error('invalid_book_firebase_claims');
};

const customClaims = (claims: BookFirebaseClaimTuple): Record<string, unknown> => {
  if (claims.service === 'class_book_authority') {
    const { service: _service, ...dimensions } = claims;
    return { classBookAuthority103: true, ...dimensions };
  }
  if (claims.service === 'book_public_readiness') {
    return { book_public_readiness_service: true, book_public_readiness_bookId: claims.bookId,
      book_public_readiness_ownerId: claims.ownerId, book_public_readiness_publicationId: claims.publicationId,
      book_public_readiness_publicationRevision: claims.publicationRevision, book_public_readiness_accountId: claims.accountId,
      ...(claims.setupActivationIndex === undefined ? {} : { book_public_readiness_setupActivationIndex: claims.setupActivationIndex }) };
  }
  if (claims.service === 'book_public_reader') {
    return { book_public_reader_service: true, book_public_reader_bookId: claims.bookId, book_public_reader_studentId: claims.studentId };
  }
  if (claims.service === 'book_activity_evaluation') {
    return {
      book_activity_evaluation_service: true,
      book_activity_evaluation_recipientId: claims.recipientId,
      book_activity_evaluation_contextId: claims.contextId,
      book_activity_evaluation_placementId: claims.placementId,
      book_activity_evaluation_activityId: claims.activityId,
      book_activity_evaluation_attemptId: claims.attemptId,
    };
  }
  if (claims.service === 'book_activity_authoring') {
    return {
      book_activity_authoring_service: true,
      book_activity_authoring_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_assembly') {
    return {
      book_assembly_service: true,
      book_assembly_bookId: claims.bookId,
      book_assembly_unitKey: claims.unitKey,
      book_assembly_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_assembly_activation') {
    return { book_assembly_activation_service: true, book_assembly_activation_bookId: claims.bookId,
      book_assembly_activation_ownerId: claims.ownerId, book_assembly_activation_operationId: claims.operationId,
      book_assembly_activation_expectedBookRevision: claims.expectedBookRevision,
      book_assembly_activation_expectedSourceSetRevision: claims.expectedSourceSetRevision,
      book_assembly_activation_setupActivationIndex: claims.setupActivationIndex,
      book_assembly_activation_inputFingerprint: claims.inputFingerprint };
  }
  if (claims.service === 'book_assembly_draft_discovery') {
    return {
      book_assembly_draft_discovery_service: true,
      book_assembly_draft_discovery_bookId: claims.bookId,
      book_assembly_draft_discovery_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_assembly_activity_binding') {
    return {
      book_assembly_activity_binding_service: true,
      book_assembly_activity_binding_bookId: claims.bookId,
      book_assembly_activity_binding_unitKey: claims.unitKey,
      book_assembly_activity_binding_activityKey: claims.activityKey,
      book_assembly_activity_binding_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_assembly_preview') {
    return {
      book_assembly_preview_service: true,
      book_assembly_preview_bookId: claims.bookId,
      book_assembly_preview_unitKey: claims.unitKey,
      book_assembly_preview_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_assembly_preview_approval') {
    return {
      book_assembly_preview_approval_service: true,
      book_assembly_preview_approval_bookId: claims.bookId,
      book_assembly_preview_approval_unitKey: claims.unitKey,
      book_assembly_preview_approval_approvalId: claims.approvalId,
      book_assembly_preview_approval_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_homework_authority') {
    return {
      book_homework_authority_service: true,
      book_homework_authority_authorityId: claims.authorityId,
      book_homework_authority_assignmentId: claims.assignmentId,
      book_homework_authority_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_homework_compatibility') {
    return {
      book_homework_compatibility_service: true,
      book_homework_compatibility_assignmentId: claims.assignmentId,
      book_homework_compatibility_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_homework') {
    const scoped: Record<string, unknown> = {
      book_homework_service: true,
    };
    if (claims.assignmentId !== undefined) scoped.book_homework_assignmentId = claims.assignmentId;
    if (claims.ownerId !== undefined) scoped.book_homework_ownerId = claims.ownerId;
    return scoped;
  }
  if (claims.service === 'book_delivery') {
    const scoped: Record<string, unknown> = { book_delivery_service: true };
    if (claims.recipientId !== undefined) scoped.book_delivery_recipientId = claims.recipientId;
    if (claims.contextId !== undefined) scoped.book_delivery_contextId = claims.contextId;
    return scoped;
  }
  if (claims.service === 'book_assembly_publication') {
    return {
      book_assembly_publication_service: true,
      book_assembly_publication_bookId: claims.bookId,
      book_assembly_publication_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_activity_publication_writer') {
    return {
      book_activity_publication_writer_service: true,
      book_activity_publication_writer_ownerId: claims.ownerId,
      book_activity_publication_writer_activityId: claims.activityId,
      book_activity_publication_writer_activityVersionId: claims.activityVersionId,
    };
  }
  if (claims.service === 'book_assembly_publication_approval') {
    return {
      book_assembly_publication_approval_service: true,
      book_assembly_publication_approval_bookId: claims.bookId,
      book_assembly_publication_approval_unitKey: claims.unitKey,
      book_assembly_publication_approval_approvalId: claims.approvalId,
      book_assembly_publication_approval_ownerId: claims.ownerId,
    };
  }
  if (claims.service === 'book_activity_runtime_reader') {
    return {
      book_activity_runtime_reader_service: true,
      book_activity_runtime_reader_ownerId: claims.ownerId,
      book_activity_runtime_reader_bookId: claims.bookId,
      book_activity_runtime_reader_manifestVersionId: claims.manifestVersionId,
      book_activity_runtime_reader_activityId: claims.activityId,
      book_activity_runtime_reader_activityVersionId: claims.activityVersionId,
    };
  }
  if (claims.service === 'book_result_read') {
    return {
      book_result_read_service: true,
      ...('contextKind' in claims ? {
        book_result_read_contextKind: claims.contextKind,
        book_result_read_contextId: claims.contextId,
      } : {}),
      ...('resultId' in claims ? { book_result_read_resultId: claims.resultId } : {}),
      ...('homeworkId' in claims ? { book_result_read_homeworkId: claims.homeworkId } : {}),
      ...('studentId' in claims ? { book_result_read_studentId: claims.studentId } : {}),
      ...('bookId' in claims ? { book_result_read_bookId: claims.bookId } : {}),
      ...('groupKey' in claims ? { book_result_read_groupKey: claims.groupKey } : {}),
    };
  }
  return {
    book_runtime_service: true,
    book_runtime_recipientId: claims.recipientId,
    book_runtime_contextId: claims.contextId,
  };
};

/**
 * Mints a bounded Firebase Auth token and exchanges it for an RTDB-usable ID
 * token. The cache key includes the complete claim tuple, so a token is never
 * reused for another owner, recipient, or context.
 */
export const createFirebaseClaimTokenProvider = (options: {
  readonly serviceAccountJson: string;
  readonly serviceIdentity: string;
  readonly firebaseProjectId: string;
  readonly firebaseWebApiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}): ((claims: BookFirebaseClaimTuple) => Promise<string>) => {
  const serviceIdentity = options.serviceIdentity.trim();
  const projectId = options.firebaseProjectId.trim();
  const apiKey = options.firebaseWebApiKey.trim();
  let serviceAccount: ServiceAccountKey;
  try {
    serviceAccount = JSON.parse(options.serviceAccountJson) as ServiceAccountKey;
  } catch {
    throw new Error('invalid_book_firebase_service_account');
  }
  if (!serviceIdentity || !projectId || !apiKey
    || !serviceAccount || typeof serviceAccount !== 'object'
    || typeof serviceAccount.client_email !== 'string'
    || typeof serviceAccount.private_key !== 'string'
    || !serviceAccount.client_email.trim()
    || !serviceAccount.private_key.trim()) {
    throw new Error('invalid_book_firebase_service_account');
  }
  if (serviceAccount.client_email !== serviceIdentity) {
    throw new Error('book_firebase_service_identity_mismatch');
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { readonly token: string; readonly expiresAt: number }>();

  return async (claims: BookFirebaseClaimTuple): Promise<string> => {
    assertClaims(claims);
    const key = `${projectId}\u0000${apiKey}\u0000${serviceIdentity}\u0000${claimTuple(claims)}`;
    const cached = cache.get(key);
    if (cached && now() < cached.expiresAt - 60_000) return cached.token;

    const issuedAt = Math.floor(now() / 1000);
    const customToken = await new SignJWT({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: FIREBASE_CUSTOM_TOKEN_AUDIENCE,
      uid: claims.service === 'book_runtime'
        ? claims.recipientId
        : claims.service === 'class_book_authority'
          ? claims.actorUid
        : claims.service === 'book_homework_authority'
          ? claims.ownerId
        : claims.service === 'book_homework_compatibility'
          ? claims.ownerId
        : claims.service === 'book_homework'
          ? (claims.ownerId ?? claims.assignmentId)
        : claims.service === 'book_delivery'
            ? (claims.recipientId ?? serviceIdentity)
          : claims.service === 'book_result_read' || claims.service === 'book_activity_evaluation' || claims.service === 'book_public_reader'
            ? serviceIdentity
          : claims.ownerId,
      claims: customClaims(claims),
      iat: issuedAt,
      exp: issuedAt + 300,
    }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(await importPKCS8(serviceAccount.private_key, 'RS256'));

    let response: Response;
    try {
      response = await fetchImpl.call(globalThis,
        `${IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Referer: FIREBASE_TOKEN_EXCHANGE_REFERER,
          },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        });
    } catch {
      throw new Error('book_firebase_token_exchange_transport_failed');
    }
    if (!response.ok) {
      let providerCode: FirebaseTokenExchangeProviderCode | undefined;
      try {
        const body = JSON.parse(await response.text()) as {
          readonly error?: { readonly message?: unknown };
        };
        if (isFirebaseTokenExchangeProviderCode(body.error?.message)) {
          providerCode = body.error.message;
        }
      } catch {
        // Preserve only the stable HTTP failure when the provider body is not JSON.
      }
      throw new Error(`book_firebase_token_exchange_failed:${response.status}${providerCode ? `:${providerCode}` : ''}`);
    }
    let exchanged: TokenExchangeResponse;
    try {
      exchanged = JSON.parse(await response.text()) as TokenExchangeResponse;
    } catch {
      throw new Error('book_firebase_token_exchange_invalid_response');
    }
    if (typeof exchanged.idToken !== 'string' || !exchanged.idToken
      || typeof exchanged.expiresIn !== 'string') {
      throw new Error('book_firebase_token_exchange_invalid_response');
    }
    const lifetime = Math.max(60_000, Number(exchanged.expiresIn) * 1000 || 3600_000);
    cache.set(key, { token: exchanged.idToken, expiresAt: now() + lifetime });
    return exchanged.idToken;
  };
};
