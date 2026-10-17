/**
 * Ticket 38B1 contribution. Ticket 09D owns top-level route composition.
 * Route stays unregistered/disabled until migration and activation owners act.
 */
export const notificationCommandRouteDescriptor = {
  method: 'POST',
  path: '/book-notifications/commands',
  handler: 'notificationCommand',
} as const;
