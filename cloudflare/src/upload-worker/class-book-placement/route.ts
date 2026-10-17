/** #103 teacher commands and #104 canonical learner delivery; #59 owns composition. */
export const classBookPlacementRouteDescriptors = [
  { method: 'POST', path: '/v1/class-book-placement/copy', handler: 'copy' },
  { method: 'POST', path: '/v1/class-book-placement/place', handler: 'place' },
  { method: 'POST', path: '/v1/class-book-placement/sync', handler: 'sync' },
  { method: 'POST', path: '/v1/class-book-placement/lock', handler: 'lock' },
  {
    method: 'POST',
    path: '/v1/book-class-placement/prepare',
    handler: 'prepare',
  },
  {
    method: 'GET',
    path: '/v1/book-class-placement/current/:classId/:copyId/:classPlacementId/:classCourseMaterialId/:bindingId',
    handler: 'current',
  },
] as const;
