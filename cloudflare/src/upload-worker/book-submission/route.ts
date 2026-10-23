import type { BookRouteMethod } from '../book-routes/types.ts';

export const bookSubmissionRouteDescriptors: readonly {
  readonly handler: 'begin' | 'status' | 'cancel' | 'commit' | 'prepareComponent';
  readonly method: BookRouteMethod;
  readonly path: string;
}[] = Object.freeze([
  { handler: 'begin', method: 'POST', path: '/v1/book-submissions' },
  { handler: 'status', method: 'GET', path: '/v1/book-submissions/:operationId/status' },
  { handler: 'cancel', method: 'POST', path: '/v1/book-submissions/:operationId/cancel' },
  { handler: 'commit', method: 'POST', path: '/v1/book-submissions/:operationId/commit' },
  { handler: 'prepareComponent', method: 'POST', path: '/v1/book-submissions/:operationId/prepare-component' },
]);
