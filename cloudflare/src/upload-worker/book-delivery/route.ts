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

