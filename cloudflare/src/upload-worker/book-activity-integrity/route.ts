import type { CanonicalBookRouteDescriptor } from '../book-routes/types.ts';

/**
 * Contributor descriptor for ticket #59's already-reserved integrity seam.
 * This ticket deliberately does not edit top-level Worker composition.
 */
export const bookIntegritySignalRouteDescriptor: CanonicalBookRouteDescriptor = Object.freeze({
  id: 'book.integrity.signal',
  methods: ['POST'],
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
