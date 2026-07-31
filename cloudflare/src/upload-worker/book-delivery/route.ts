/**
 * Ticket 08B route contract. Ticket 09D owns top-level Worker wiring.
 * These descriptors are not reachable until that trusted seam is composed.
 */
export const bookDeliveryRouteDescriptors = [
  { method: 'POST', path: '/book-delivery/create', handler: 'create' },
  { method: 'POST', path: '/book-delivery/activate', handler: 'activate' },
  { method: 'POST', path: '/book-delivery/supersede', handler: 'supersede' },
  { method: 'POST', path: '/book-delivery/revoke', handler: 'revoke' },
  { method: 'GET', path: '/book-delivery/current/:recipientId/:contextId', handler: 'resolve' },
] as const;

/** Ticket 09A internal authorization seam. Ticket 09D owns top-level wiring. */
export const bookDocumentAuthorizationRouteDescriptor = {
  method: 'GET|HEAD',
  path: '/v1/book-delivery/document/:opaqueRouteKey',
  handler: 'serveAuthorizedDocument',
  serverOnly: true,
  owner: '#51 / 09A authorization; #52 / 09B byte response',
  authorizationOwner: '#51 / 09A',
  byteResponseOwner: '#52 / 09B',
  destination: '#59 / 09D top-level composition',
  auth: 'firebase-id-token-before-lookup',
  rateClass: '09D-owned',
  gate: '50A-all-deny-until-50B-activation',
  requestBodyBytes: 0,
  responseLimitBytes: 500 * 1024 * 1024,
  response: 'bounded-streamed-pdf-or-head',
} as const;

/** Ticket #80 exact historical attempt document contributor. */
export const bookHistoricalAttemptDocumentRouteDescriptor = {
  method: 'GET|HEAD',
  path: '/v1/book-delivery/historical-document/:bookId/:studentId/:resultId/:opaqueRouteKey',
  handler: 'serveHistoricalAttemptDocument',
  serverOnly: true,
  owner: '#80 historical attempt context; #52 byte response',
  authorizationOwner: '#80',
  byteResponseOwner: '#52 / 09B',
  destination: '#59 / 09D top-level composition',
  auth: 'firebase-id-token-before-lookup',
  rateClass: '09D-owned',
  gate: 'BOOK_HISTORICAL_DOCUMENT_ROUTES_ENABLED-default-disabled',
  requestBodyBytes: 0,
  responseLimitBytes: 500 * 1024 * 1024,
  response: 'bounded-streamed-historical-pdf-or-head',
} as const;

/** Ticket 09C internal teacher Assembly authorization seam; #59 composes it. */
export const bookTeacherAssemblyDocumentRouteDescriptor = {
  method: 'GET|HEAD',
  path: '/v1/book-delivery/teacher-assembly/:bookId/:unitKey/:candidateId/:candidateRevision/:sourceKey/:sourceVersionId/:sourceSetRevision/:bookRevision',
  handler: 'serveTeacherAssemblyDocument',
  serverOnly: true,
  owner: '#58 / 09C authorization; #52 / 09B byte response',
  authorizationOwner: '#58 / 09C',
  byteResponseOwner: '#52 / 09B',
  destination: '#59 / 09D top-level composition',
  auth: 'firebase-id-token-before-lookup',
  rateClass: '09D-owned',
  gate: 'teacher-assembly-preview-only',
  requestBodyBytes: 0,
  responseLimitBytes: 500 * 1024 * 1024,
  response: 'bounded-streamed-pdf-or-head',
} as const;

export const bookDocumentRouteDescriptors = [
  ...bookDeliveryRouteDescriptors,
  bookDocumentAuthorizationRouteDescriptor,
  bookHistoricalAttemptDocumentRouteDescriptor,
  bookTeacherAssemblyDocumentRouteDescriptor,
] as const;
