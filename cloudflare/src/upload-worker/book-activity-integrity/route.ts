import type { CanonicalBookRouteDescriptor } from '../book-routes/types.ts';

/**
 * Contributor descriptor for ticket #59's already-reserved integrity seam.
 * This ticket deliberately does not edit top-level Worker composition.
 */
export const bookIntegritySignalRouteDescriptor: CanonicalBookRouteDescriptor = Object.freeze({
  id: 'book.integrity.signal',
  methods: ['POST'] as const,
  pathTemplate: '/book-integrity/books/:bookId/signals',
  owner: '#91',
  domain: 'integrity',
  handler: 'futureSeam.integritySignal',
  firebaseAuth: 'firebase-id-token-student',
  rateClass: 'book-future',
  gateEnv: 'BOOK_INTEGRITY_ROUTES_ENABLED',
  gateDefault: 'disabled',
  requestBodyBytes: 4 * 1024,
  responseLimitBytes: 8 * 1024,
  identityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_INTEGRITY_GOOGLE_SA_KEY',
  source: 'contributor',
  contributorTicket: '#91',
});

/**
 * Teacher-only post-submit read seam.  The handler must resolve ownership
 * from trusted assignment/result authority before using the teacher index;
 * browser Firebase reads are never allowed to reach the report store.
 */
export const bookIntegrityReportRouteDescriptor: CanonicalBookRouteDescriptor = Object.freeze({
  id: 'book.integrity.report',
  methods: ['GET'] as const,
  pathTemplate: '/book-integrity/books/:bookId/terminals/:terminalId/report',
  owner: '#92',
  domain: 'integrity',
  handler: 'futureSeam.integrityReport',
  firebaseAuth: 'firebase-id-token-teacher',
  rateClass: 'book-read',
  gateEnv: 'BOOK_INTEGRITY_REPORT_ROUTES_ENABLED',
  gateDefault: 'disabled',
  requestBodyBytes: 0,
  responseLimitBytes: 32 * 1024,
  identityEnv: 'BOOK_INTEGRITY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_INTEGRITY_GOOGLE_SA_KEY',
  source: 'contributor',
  contributorTicket: '#92',
});

export const bookIntegrityReportRouteDescriptors: readonly CanonicalBookRouteDescriptor[] = Object.freeze([
  bookIntegrityReportRouteDescriptor,
]);
