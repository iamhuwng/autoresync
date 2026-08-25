import type { BookRouteMethod } from '../book-routes/types.ts';

export interface BookSourceRouteDescriptor {
  readonly handler: 'begin' | 'complete' | 'status' | 'cancel' | 'attach';
  readonly method: BookRouteMethod;
  readonly path: string;
}

export const bookSourceRouteDescriptors: readonly BookSourceRouteDescriptor[] = Object.freeze([
  {
    handler: 'attach',
    method: 'POST',
    path: '/v1/book-source/books/:bookId/source-set/attach',
  },
  {
    handler: 'begin',
    method: 'POST',
    path: '/v1/book-source/books/:bookId/upload/begin',
  },
  {
    handler: 'complete',
    method: 'POST',
    path: '/v1/book-source/books/:bookId/upload/:reservationId/complete',
  },
  {
    handler: 'status',
    method: 'GET',
    path: '/v1/book-source/books/:bookId/upload/:reservationId/status',
  },
  {
    handler: 'cancel',
    method: 'POST',
    path: '/v1/book-source/books/:bookId/upload/:reservationId/cancel',
  },
]);
