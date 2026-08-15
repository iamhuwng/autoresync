import { SignJWT, importPKCS8 } from 'jose';

const IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const FIREBASE_TOKEN_EXCHANGE_REFERER = 'https://r2-upload-signer.iamhuwng.workers.dev/';
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SAFE_BOOK_HOMEWORK_ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;

export type BookFirebaseClaimTuple =
  | { readonly service: 'book_activity_authoring'; readonly ownerId: string }
  | {
    readonly service: 'book_assembly';
    readonly bookId: string;
    readonly unitKey: string;
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
  throw new Error('invalid_book_firebase_claims');
};

const customClaims = (claims: BookFirebaseClaimTuple): Record<string, unknown> => {
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
        : claims.service === 'book_homework_authority'
          ? claims.ownerId
        : claims.service === 'book_homework_compatibility'
          ? claims.ownerId
        : claims.service === 'book_homework'
          ? (claims.ownerId ?? claims.assignmentId)
          : claims.service === 'book_delivery'
            ? (claims.recipientId ?? serviceIdentity)
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
    if (!response.ok) throw new Error(`book_firebase_token_exchange_failed:${response.status}`);
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
