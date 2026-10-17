/**
 * Ticket 20A route contract. Ticket 09D/#59 owns top-level upload Worker
 * composition and deployed Worker-to-Firebase identity integration.
 */
export const bookSuccessorRouteDescriptors = [
  { method: 'POST', path: '/api/material-books/successors/create', handler: 'create' },
  { method: 'POST', path: '/api/material-books/successors/archive', handler: 'archive' },
] as const;
