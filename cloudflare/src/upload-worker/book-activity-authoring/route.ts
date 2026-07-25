/**
 * Ticket 12C route contract. Ticket 09D owns top-level upload Worker wiring.
 * Keeping descriptors separate prevents an unreviewed route becoming reachable.
 */
export const bookActivityAuthoringRouteDescriptors = [
  { method: 'POST', path: '/book-activity-authoring/stage', handler: 'stage' },
  { method: 'POST', path: '/book-activity-authoring/validate', handler: 'validate' },
  { method: 'POST', path: '/book-activity-authoring/save-draft', handler: 'saveDraft' },
  { method: 'POST', path: '/book-activity-authoring/discard', handler: 'discard' },
  { method: 'GET', path: '/book-activity-authoring/candidates/:candidateId', handler: 'loadCandidate' },
] as const;
