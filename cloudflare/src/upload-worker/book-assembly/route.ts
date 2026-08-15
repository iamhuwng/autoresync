/**
 * Ticket 13A route contract. Ticket 09D owns top-level Worker composition.
 * Candidate commands are intentionally separate from publication and delivery.
 */
export const bookAssemblyRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/candidates', handler: 'create' },
  { method: 'PUT', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId', handler: 'replace' },
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId/validate', handler: 'validate' },
  { method: 'DELETE', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId', handler: 'discard' },
  { method: 'GET', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId', handler: 'load' },
] as const;

/** Ticket 63 candidate preview and approval. The capability stays disabled by default. */
export const bookAssemblyPreviewRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId/preview', handler: 'preview' },
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId/approve', handler: 'approve' },
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/candidates/:candidateId/approvals/:approvalId/revoke', handler: 'revoke' },
] as const;

/** Ticket 20B unpublished source-strategy migration. Publication remains a separate owner. */
export const bookAssemblyMigrationRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/migrations', handler: 'migrate' },
  { method: 'POST', path: '/book-assembly/books/:bookId/units/:unitKey/migrations/:migrationCandidateId/confirm', handler: 'confirm' },
  { method: 'DELETE', path: '/book-assembly/books/:bookId/units/:unitKey/migrations/:migrationCandidateId', handler: 'discard' },
] as const;

/**
 * Ticket 09D owns canonical route composition. Tickets #65/#66 own the
 * strategy adapters; their positive deployment proof remains with #134.
 */
export const bookAssemblyPublicationRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/full-pdf-publications', handler: 'fullPdfPublish' },
  { method: 'POST', path: '/book-assembly/component-pdf-publications', handler: 'componentPdfPublish' },
] as const;

/** Ticket 20C published source-strategy successor. Capability remains disabled by default. */
export const bookAssemblySuccessorRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/source-strategy-successors', handler: 'publish' },
] as const;

/** Ticket 18 published mapping revision. Capability remains disabled by default. */
export const bookAssemblyMappingRevisionRouteDescriptors = [
  { method: 'POST', path: '/book-assembly/mapping-revisions', handler: 'publish' },
] as const;
