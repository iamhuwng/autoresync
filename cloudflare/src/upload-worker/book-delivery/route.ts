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

export const bookDocumentRouteDescriptors = [
  ...bookDeliveryRouteDescriptors,
  bookDocumentAuthorizationRouteDescriptor,
] as const;
