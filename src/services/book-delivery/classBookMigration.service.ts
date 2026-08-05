import {
  assertClassBookId,
  assertClassBookTimestamp,
  ClassBookPlacementError,
  type ClassBookPlacement,
  type ClassBookSourcePlacement,
} from './classBookPlacement.types';
import { ClassBookPlacementService } from './classBookPlacement.service';
import { ClassBookRolloutGate } from './classBookRolloutGate';

export interface ClassBookLegacyMigrationInput {
  readonly actorId: string;
  readonly operationId: string;
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly source: ClassBookSourcePlacement;
  readonly title: string;
  readonly migratedAt: string;
}

export interface ClassBookMigrationReceipt {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly placementRevision: number;
  readonly migratedAt: string;
  readonly mode: 'explicit-class-book-placement';
}

/**
 * Legacy migration is an explicit command. It rejects bare legacy materialId
 * records and delegates all owner/copy/lock/pin checks to the Class service.
 */
export const migrateLegacyClassBookPlacement = (
  service: ClassBookPlacementService,
  input: ClassBookLegacyMigrationInput,
): { readonly placement: ClassBookPlacement; readonly receipt: ClassBookMigrationReceipt } => {
  for (const value of [input.classId, input.copyId, input.classPlacementId, input.classCourseMaterialId]) {
    assertClassBookId(value, 'class_book_migration_identity_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(input as unknown as Record<string, unknown>, 'materialId')) {
    throw new ClassBookPlacementError('class_book_migration_bare_material_id_forbidden');
  }
  assertClassBookTimestamp(input.migratedAt);
  const placement = service.place({
    operationId: input.operationId,
    actorId: input.actorId,
    now: input.migratedAt,
    classId: input.classId,
    copyId: input.copyId,
    classPlacementId: input.classPlacementId,
    classCourseMaterialId: input.classCourseMaterialId,
    source: input.source,
    title: input.title,
  });
  return {
    placement,
    receipt: {
      schemaVersion: 1,
      operationId: input.operationId,
      classId: input.classId,
      copyId: input.copyId,
      classPlacementId: input.classPlacementId,
      classCourseMaterialId: input.classCourseMaterialId,
      placementRevision: placement.placementRevision,
      migratedAt: input.migratedAt,
      mode: 'explicit-class-book-placement',
    },
  };
};

export interface ClassBookRollbackState {
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  readonly denyNewWrites: true;
  readonly denyNewIssuance: true;
  readonly reason: string;
  readonly changedAt: string;
  readonly operationId: string;
}

/** Rollback changes the gate only; it never deletes or rewrites history. */
export const createClassBookRollbackState = (input: {
  readonly reason: string;
  readonly changedAt: string;
  readonly operationId: string;
}): ClassBookRollbackState => {
  if (input.reason.trim().length === 0 || input.reason.length > 240) {
    throw new ClassBookPlacementError('class_book_rollback_reason_invalid');
  }
  assertClassBookTimestamp(input.changedAt);
  assertClassBookId(input.operationId, 'class_book_rollback_operation_invalid');
  return {
    schemaVersion: 1,
    enabled: true,
    denyNewWrites: true,
    denyNewIssuance: true,
    reason: input.reason,
    changedAt: input.changedAt,
    operationId: input.operationId,
  };
};

export const createClassBookRollbackGate = (): ClassBookRolloutGate => new ClassBookRolloutGate({
  enabled: true,
  rollback: true,
});
