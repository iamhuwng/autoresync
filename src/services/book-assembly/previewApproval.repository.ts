import type { BookAssemblyPreviewApprovalRecord } from './unitPreview.service';

/** Durable, append-only revocation marker for one approval identity. */
export interface BookAssemblyPreviewApprovalRevocationRecord {
  readonly approvalId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly actorId: string;
  readonly revokedAt: string;
}

export interface BookAssemblyPreviewApprovalRead {
  readonly approval: BookAssemblyPreviewApprovalRecord | null;
  readonly revocation: BookAssemblyPreviewApprovalRevocationRecord | null;
}

export type PreviewApprovalCreateStatus = 'created' | 'replayed' | 'conflict';
export type PreviewApprovalRevokeStatus = 'revoked' | 'replayed' | 'conflict';
/** Backward-compatible name for create-only writers. */
export type PreviewApprovalWriteStatus = PreviewApprovalCreateStatus;

/**
 * The only persistence operations exposed to the preview/publication boundary.
 * Every operation carries the complete Book/Unit/approval scope; callers never
 * get a repository method that can address an approval by ID alone.
 */
export interface BookAssemblyPreviewApprovalRepository {
  create(input: BookAssemblyPreviewApprovalRecord): Promise<PreviewApprovalCreateStatus>;
  revoke(input: BookAssemblyPreviewApprovalRevocationRecord): Promise<PreviewApprovalRevokeStatus>;
  read(bookId: string, unitKey: string, approvalId: string): Promise<BookAssemblyPreviewApprovalRead>;
}

/** Narrow alias for callers that use the shorter domain name. */
export type PreviewApprovalRepository = BookAssemblyPreviewApprovalRepository;

/** Keeps browser/service code dependent on the contract rather than storage. */
export const createPreviewApprovalRepository = (
  repository: BookAssemblyPreviewApprovalRepository,
): BookAssemblyPreviewApprovalRepository => Object.freeze({
  create: (input: BookAssemblyPreviewApprovalRecord) => repository.create(input),
  revoke: (input: BookAssemblyPreviewApprovalRevocationRecord) => repository.revoke(input),
  read: (bookId: string, unitKey: string, approvalId: string) => repository.read(bookId, unitKey, approvalId),
});
