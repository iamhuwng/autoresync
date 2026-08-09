/** #104 canonical Class delivery contributor contract; #59 owns Worker composition. */
export const classBookPlacementRouteDescriptors = [
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
