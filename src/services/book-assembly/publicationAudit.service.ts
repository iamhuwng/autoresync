import type {
  BookAssemblyPublicationAuditRecord,
  BookAssemblyPublicationFailureCode,
  BookAssemblyPublicationPointer,
} from '../../types/bookAssembly.types';

export const createBookAssemblyPublicationAuditRecord = (input: {
  readonly action: BookAssemblyPublicationAuditRecord['action'];
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly pointer: BookAssemblyPublicationPointer;
  readonly status: BookAssemblyPublicationAuditRecord['status'];
  readonly failureCode?: BookAssemblyPublicationFailureCode;
  readonly now: string;
}): BookAssemblyPublicationAuditRecord => ({
  auditId: `${input.action}:${input.operationId}`,
  operationId: input.operationId,
  action: input.action,
  ownerId: input.ownerId,
  bookId: input.bookId,
  publicationId: input.pointer.publicationId,
  publicationRevision: input.pointer.publicationRevision,
  manifestVersionId: input.pointer.manifestVersionId,
  inputFingerprint: input.pointer.inputFingerprint,
  status: input.status,
  ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  createdAt: input.now,
});

export const assertBookAssemblyAuditIsBounded = (
  audit: BookAssemblyPublicationAuditRecord,
): void => {
  const encoded = JSON.stringify(audit);
  if (encoded.length > 2048) {
    throw new Error('book_assembly_publication_audit_too_large');
  }
  if (/answer|credential|private_key|pdfBytes|providerAuthority|fullDiff/iu.test(encoded)) {
    throw new Error('book_assembly_publication_audit_leaks_sensitive_payload');
  }
};
