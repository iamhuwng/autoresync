import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

const input = (path: string, method = 'GET') => ({
  request: new Request(`https://worker.test${path}`, { method }),
  env: {},
  uid: 'student-1',
  params: {},
  descriptor: {} as never,
});

describe('#104 canonical class/runtime-launch handler composition', () => {
  it('resolves descriptor keys to the injected class and runtime-launch factories', async () => {
    const resolveCurrent = vi.fn(async () => ({ schemaVersion: 1, projectionKind: 'book-runtime-delivery' }));
    const handlers = createBookRouteHandlers({
      classBookPlacement: { resolveCurrent },
      runtimeLaunch: {
        resolveContext: vi.fn(),
        projectionReader: { readExact: vi.fn() },
      },
    });

    await handlers['classBookPlacement.current']!({
      ...input(
      '/v1/book-class-placement/current/class-1/copy-1/placement-1/material-1/binding-1',
      ),
      env: { BOOK_CLASS_BOOK_PLACEMENT_ROUTES_ENABLED: 'enabled' },
    });

    expect(resolveCurrent).toHaveBeenCalledWith({}, {
      classId: 'class-1',
      copyId: 'copy-1',
      classPlacementId: 'placement-1',
      classCourseMaterialId: 'material-1',
      bindingId: 'binding-1',
      studentId: 'student-1',
    });
  });

  it('creates both canonical handler keys from injectable factory options', () => {
    const handlers = createBookRouteHandlers({
      classBookPlacement: {
        prepare: vi.fn(async () => ({ schemaVersion: 1, projectionKind: 'book-runtime-delivery' })),
        resolveCurrent: vi.fn(async () => ({ schemaVersion: 1, projectionKind: 'book-runtime-delivery' })),
      },
      runtimeLaunch: {
        resolveContext: vi.fn(),
        projectionReader: { readExact: vi.fn() },
      },
    });

    expect(handlers['classBookPlacement.prepare']).toEqual(expect.any(Function));
    expect(handlers['classBookPlacement.current']).toEqual(expect.any(Function));
    expect(handlers['bookRuntimeLaunch.launch']).toEqual(expect.any(Function));
  });
});
