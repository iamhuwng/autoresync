/**
 * Ticket 28A route contract. Ticket 09D owns top-level Worker composition.
 * Runtime commands stay disabled until their activation owner enables gates.
 */
export const bookRuntimeRouteDescriptors = [
  { method: 'POST', path: '/book-runtime/commands', handler: 'command' },
] as const;
