import type { CanonicalBookRouteDescriptor } from '../book-routes/types.ts';

export const publicBookRouteDescriptors: readonly CanonicalBookRouteDescriptor[] = [{
  id: 'book.public.launch', methods: ['POST'], pathTemplate: '/v1/book-public/books/:bookId/launch',
  owner: 'PRD0062-L', domain: 'delivery', handler: 'publicBook.launch',
  firebaseAuth: 'firebase-id-token-student', rateClass: 'book-control',
  gateEnv: 'BOOK_PUBLIC_ROUTES_ENABLED', gateDefault: 'disabled', requestBodyBytes: 1024,
  responseLimitBytes: 256 * 1024, identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY', source: 'contributor', contributorTicket: 'PRD0062-L',
}, {
  id: 'book.public.readinessRefresh', methods: ['POST'], pathTemplate: '/v1/book-public/books/:bookId/readiness-refresh',
  owner: 'PRD0062-L', domain: 'assembly', handler: 'publicBook.refreshReadiness',
  firebaseAuth: 'firebase-id-token-teacher', rateClass: 'book-control',
  gateEnv: 'BOOK_PUBLIC_ROUTES_ENABLED', gateDefault: 'disabled', requestBodyBytes: 1024,
  responseLimitBytes: 1024, identityEnv: 'BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY',
  credentialEnv: 'BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY', source: 'contributor', contributorTicket: 'PRD0062-L',
}];
