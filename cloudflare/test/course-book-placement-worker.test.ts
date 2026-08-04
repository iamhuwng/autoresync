import { describe, expect, it, vi } from 'vitest';
import { createCourseBookPlacementWorkerHandlers } from '../src/upload-worker/course-book-placement/worker.ts';

const request = (value: unknown) => new Request('https://worker.test/course-book-placement', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
});

describe('default #59 Course worker composition', () => {
  it('routes exact owner and student commands through the trusted command producer', async () => {
    const place = vi.fn(async () => ({ status: 'created' }));
    const prepare = vi.fn(async () => ({ bindingId: 'binding-001' }));
    const revoke = vi.fn(async () => ({ status: 'revoked' }));
    const handlers = createCourseBookPlacementWorkerHandlers({
      commandFor: () => ({ place, prepare, revoke }),
      resolveCurrent: vi.fn(async () => ({ bindingId: 'binding-001' })),
    });
    const operationId = '11111111-1111-4111-8111-111111111111';
    await expect(handlers.place({ uid: 'teacher-001', env: {}, request: request({
      operationId, courseId: 'course-001', moduleId: 'module-001', courseMaterialId: 'material-001',
      selection: { bookId: 'book-001', scope: { kind: 'subtree', nodeKeys: ['unit-001'], placementIds: [] } },
    }) })).resolves.toMatchObject({ body: { status: 'created' }, init: { status: 200 } });
    await expect(handlers.prepare({ uid: 'student-001', env: {}, request: request({
      operationId, courseMaterialId: 'material-001', legacyEnrollmentId: 'legacy-001',
    }) })).resolves.toMatchObject({ body: { bindingId: 'binding-001' }, init: { status: 200 } });
    await expect(handlers.revoke({ uid: 'teacher-001', env: {}, request: request({
      operationId, courseMaterialId: 'material-001',
    }) })).resolves.toMatchObject({ body: { status: 'revoked' }, init: { status: 200 } });
    expect(place).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'teacher-001' }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'student-001' }));
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'teacher-001' }));
  });

  it('keeps current read-only and rejects unsupported request fields', async () => {
    const resolveCurrent = vi.fn(async () => ({ bindingId: 'binding-001' }));
    const handlers = createCourseBookPlacementWorkerHandlers({
      commandFor: () => ({ place: vi.fn(), prepare: vi.fn(), revoke: vi.fn() }), resolveCurrent,
    });
    await expect(handlers.current({ uid: 'student-001', env: {}, courseMaterialId: 'material-001',
      request: new Request('https://worker.test/current') })).resolves.toMatchObject({ body: { bindingId: 'binding-001' } });
    expect(resolveCurrent).toHaveBeenCalledWith({}, 'student-001', 'material-001');
    await expect(handlers.prepare({ uid: 'student-001', env: {}, request: request({
      operationId: '11111111-1111-4111-8111-111111111111', courseMaterialId: 'material-001',
      legacyEnrollmentId: 'legacy-001', injectedAuthority: true,
    }) })).resolves.toMatchObject({ body: { code: 'invalid_request' }, init: { status: 400 } });
  });
});
