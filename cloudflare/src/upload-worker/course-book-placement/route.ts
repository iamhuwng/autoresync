/** #102 contributor contract; #59 owns top-level Worker composition. */
export const courseBookPlacementRouteDescriptors = [
  { method: 'GET', path: '/course-book-placement/catalog/:bookId', handler: 'catalog' },
  { method: 'POST', path: '/course-book-placement/place', handler: 'place' },
  { method: 'POST', path: '/course-book-placement/prepare', handler: 'prepare' },
  { method: 'POST', path: '/course-book-placement/revoke', handler: 'revoke' },
  { method: 'GET', path: '/course-book-placement/current/:courseMaterialId', handler: 'current' },
] as const;
