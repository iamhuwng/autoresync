/** #104 runtime-launch contributor contract; #59 owns top-level Worker composition. */
export const bookRuntimeLaunchRouteDescriptors = [
  {
    method: 'POST',
    path: '/v1/book-runtime-launch/activities',
    handler: 'launch',
  },
] as const;
