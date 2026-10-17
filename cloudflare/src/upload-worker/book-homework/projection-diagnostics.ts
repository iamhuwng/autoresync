export type BookHomeworkProjectionStage =
  | 'token_exchange'
  | 'firestore_get'
  | 'firestore_patch'
  | 'cas_precondition'
  | 'derived_projection_validation'
  | 'readback'
  | 'unknown';

export type BookHomeworkProjectionErrorClass =
  | 'token-authentication'
  | 'firestore-read'
  | 'firestore-write'
  | 'cas-precondition-conflict'
  | 'invalid-derived-projection'
  | 'readback-mismatch'
  | 'unknown-projection-failure';

export type BookHomeworkProjectionProviderCode =
  | 'INVALID_CUSTOM_TOKEN'
  | 'CREDENTIAL_MISMATCH'
  | 'INVALID_PROVIDER_ID'
  | 'USER_DISABLED'
  | 'INVALID_LOGIN_CREDENTIALS'
  | 'TOO_MANY_ATTEMPTS_TRY_LATER'
  | 'OPERATION_NOT_ALLOWED'
  | 'PROJECT_NOT_FOUND'
  | 'API_KEY_INVALID'
  | 'QUOTA_EXCEEDED'
  | 'invalid_book_firebase_claims'
  | 'invalid_book_firebase_service_account'
  | 'book_firebase_service_identity_mismatch'
  | 'book_firebase_token_exchange_failed'
  | 'book_firebase_token_exchange_transport_failed'
  | 'book_firebase_token_exchange_invalid_response'
  | 'unknown';

export type BookHomeworkProjectionProviderStatusCategory =
  | '4xx'
  | '5xx'
  | 'other'
  | 'not_applicable'
  | 'unknown';

export type BookHomeworkProjectionProviderCategory =
  | 'http'
  | 'transport'
  | 'invalid_response'
  | 'claims'
  | 'configuration'
  | 'unknown';

export interface BookHomeworkProjectionProviderDiagnostic {
  readonly code: BookHomeworkProjectionProviderCode;
  readonly statusCategory: BookHomeworkProjectionProviderStatusCategory;
  readonly category: BookHomeworkProjectionProviderCategory;
}

export interface BookHomeworkProjectionDiagnostic {
  readonly stage: BookHomeworkProjectionStage;
  readonly errorClass: BookHomeworkProjectionErrorClass;
  readonly provider?: BookHomeworkProjectionProviderDiagnostic;
}

export class BookHomeworkProjectionDiagnosticError extends Error {
  constructor(
    readonly diagnostic: BookHomeworkProjectionDiagnostic,
    message: string = diagnostic.errorClass,
  ) {
    super(message);
    this.name = 'BookHomeworkProjectionDiagnosticError';
  }
}

export const projectionDiagnosticFrom = (error: unknown): BookHomeworkProjectionDiagnostic => (
  error instanceof BookHomeworkProjectionDiagnosticError
    ? error.diagnostic
    : { stage: 'unknown', errorClass: 'unknown-projection-failure' }
);
