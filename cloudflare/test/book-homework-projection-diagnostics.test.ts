import { describe, expect, it } from 'vitest';

import { BookHomeworkCompatibilityBridgeError } from '../src/upload-worker/book-homework/bridge.ts';
import { BookHomeworkCompatibilityRepositoryError } from '../src/upload-worker/book-homework/compatibility-repository.ts';
import {
  BookHomeworkProjectionDiagnosticError,
  projectionDiagnosticFrom,
} from '../src/upload-worker/book-homework/projection-diagnostics.ts';

describe('Book Homework projection diagnostics', () => {
  it.each([
    [new BookHomeworkProjectionDiagnosticError({ stage: 'token_exchange', errorClass: 'token-authentication' }), 'token_exchange', 'token-authentication'],
    [new BookHomeworkProjectionDiagnosticError({ stage: 'firestore_get', errorClass: 'firestore-read' }), 'firestore_get', 'firestore-read'],
    [new BookHomeworkProjectionDiagnosticError({ stage: 'firestore_patch', errorClass: 'firestore-write' }), 'firestore_patch', 'firestore-write'],
    [new BookHomeworkCompatibilityBridgeError('projection-conflict'), 'cas_precondition', 'cas-precondition-conflict'],
    [new BookHomeworkCompatibilityBridgeError('invalid-committed-child'), 'derived_projection_validation', 'invalid-derived-projection'],
    [new BookHomeworkCompatibilityRepositoryError('readback-mismatch'), 'readback', 'readback-mismatch'],
  ])('preserves an allowlisted %s classification', (error, stage, errorClass) => {
    expect(projectionDiagnosticFrom(error)).toEqual({ stage, errorClass });
  });

  it('bounds unknown exceptions without exposing their message', () => {
    expect(projectionDiagnosticFrom(new Error('secret token body'))).toEqual({
      stage: 'unknown',
      errorClass: 'unknown-projection-failure',
    });
  });
});
