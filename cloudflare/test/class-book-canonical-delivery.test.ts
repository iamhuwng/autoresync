import { describe, expect, it, vi } from 'vitest';
import { createClassBookPlacementWorkerHandlers } from '../src/upload-worker/class-book-placement/worker.ts';

const canonical = () => ({ schemaVersion: 1, projectionKind: 'book-runtime-delivery' as const });
const enabled = { BOOK_CLASS_BOOK_PLACEMENT_ROUTES_ENABLED: 'enabled' };

describe('canonical Class Book delivery Worker seam', () => {
  it('prepares and resolves canonical runtime projections under the same external route gate', async () => {
    const prepare = vi.fn(async () => canonical());
    const resolveCurrent = vi.fn(async () => canonical());
    const handlers = createClassBookPlacementWorkerHandlers({ prepare, resolveCurrent });
    const prepareResponse = await handlers.prepare({
      request: new Request('https://worker.test/v1/book-class-placement/prepare', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: '11111111-1111-4111-8111-111111111111',
          classId: 'class-1', copyId: 'copy-1', classPlacementId: 'placement-1', classCourseMaterialId: 'material-1',
        }),
      }),
      env: enabled,
      uid: 'student-1',
    });
    expect(prepareResponse.body).toEqual(canonical());
    const currentResponse = await handlers.current({
      env: enabled, uid: 'student-1', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'placement-1', classCourseMaterialId: 'material-1', bindingId: 'binding-1',
    });
    expect(currentResponse.body).toEqual(canonical());
    expect(resolveCurrent).toHaveBeenCalledWith(enabled, expect.objectContaining({ studentId: 'student-1', bindingId: 'binding-1' }));
  });

  it('rejects disabled gates and legacy Class payloads before they reach callers', async () => {
    const handlers = createClassBookPlacementWorkerHandlers({
      resolveCurrent: vi.fn(async () => ({ projectionKind: 'class-book-delivery-v1' })),
    });
    await expect(handlers.current({
      env: {}, uid: 'student-1', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'placement-1', classCourseMaterialId: 'material-1', bindingId: 'binding-1',
    })).resolves.toMatchObject({ body: { code: 'class_book_rollout_disabled' }, init: { status: 503 } });
    await expect(handlers.current({
      env: enabled, uid: 'student-1', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'placement-1', classCourseMaterialId: 'material-1', bindingId: 'binding-1',
    })).resolves.toMatchObject({ body: { code: 'class_book_legacy_delivery_output_rejected' }, init: { status: 500 } });
  });
});
