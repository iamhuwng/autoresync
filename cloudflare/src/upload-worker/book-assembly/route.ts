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
