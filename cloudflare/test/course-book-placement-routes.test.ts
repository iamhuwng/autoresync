import { describe, expect, it } from 'vitest';
import { courseBookPlacementRouteDescriptors } from '../src/upload-worker/course-book-placement/route.ts';

describe('#102 Course Book route contributor', () => {
  it('registers only default-disabled #59 contributor descriptors', async () => {
    expect(courseBookPlacementRouteDescriptors.map((route) => route.path).sort()).toEqual([
      '/course-book-placement/catalog/:bookId',
      '/course-book-placement/current/:courseMaterialId',
      '/course-book-placement/place',
      '/course-book-placement/prepare',
      '/course-book-placement/revoke',
    ]);
    expect(courseBookPlacementRouteDescriptors.map((route) => route.handler).sort()).toEqual([
      'catalog', 'current', 'place', 'prepare', 'revoke',
    ]);
  });
});
