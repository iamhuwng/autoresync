import type { ClassBookCopyIdentity, ClassBookPlacement, ClassBookLockAuthority } from '../../../../src/services/book-delivery/classBookPlacement.types.ts';

export type ClassBookCommandKind = 'copy' | 'place' | 'sync' | 'lock';
export interface ClassBookCommandReceipt {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly kind: ClassBookCommandKind;
  readonly actorUid: string;
  readonly classId: string;
  readonly inputFingerprint: string;
  readonly payloadFingerprint: string;
  readonly outcome: ClassBookCopyIdentity | ClassBookPlacement | ClassBookLockAuthority;
}
export interface ClassBookCommandClaims {
  readonly service: 'class_book_authority';
  readonly classBookOperation: ClassBookCommandKind;
  readonly actorUid: string;
  readonly classId: string;
  readonly operationId: string;
  readonly inputFingerprint: string;
  readonly payloadFingerprint: string;
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly copyId?: string;
  readonly classPlacementId?: string;
  readonly contextId?: string;
  readonly courseMaterialId?: string;
}
