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

export interface BookHomeworkProjectionDiagnostic {
  readonly stage: BookHomeworkProjectionStage;
  readonly errorClass: BookHomeworkProjectionErrorClass;
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
