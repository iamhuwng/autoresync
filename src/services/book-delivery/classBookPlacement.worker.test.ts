import { describe, expect, it, vi } from 'vitest';
import {
  createClassBookPlacementWorkerHandlers,
  isClassBookPlacementPath,
} from '../../../cloudflare/src/upload-worker/class-book-placement/worker';

const request = (path: string, body: Record<string, unknown> = {}) => new Request(
  `https://upload.test${path}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
);

const service = (place: ReturnType<typeof vi.fn>) => ({
  place,
  createCopy: vi.fn(),
  sync: vi.fn(),
  setLock: vi.fn(),
  issueDelivery: vi.fn(),
  resolveDelivery: vi.fn(),
  getPlacement: vi.fn(),
});

describe('#103 Class Book Worker composition', () => {
  it('is disabled without explicit activation and does not overlap #104 launch', async () => {
    const handlers = createClassBookPlacementWorkerHandlers({ service: service(vi.fn()) });
    const response = await handlers.handle({ request: request('/v1/class-book-placement/place'), env: {}, uid: 'teacher-1' });
    expect(response.init?.status).toBe(503);
    expect(isClassBookPlacementPath('/v1/class-book-placement/place')).toBe(true);
    expect(isClassBookPlacementPath('/v1/book-delivery/launch')).toBe(false);
  });

  it('passes the authenticated actor to an explicitly enabled command service', async () => {
    const place = vi.fn().mockReturnValue({ classPlacementId: 'class-placement-1' });
    const handlers = createClassBookPlacementWorkerHandlers({ service: service(place) });
    const response = await handlers.handle({
      request: request('/v1/class-book-placement/place', { classId: 'class-1', copyId: 'copy-1' }),
      env: { CLASS_BOOK_PLACEMENT_ENABLED: 'true' },
      uid: 'teacher-1',
    });
    expect(response.init?.status).toBe(200);
    expect((response.body as { data: { classPlacementId: string } }).data.classPlacementId).toBe('class-placement-1');
    expect(place).toHaveBeenCalledWith({ classId: 'class-1', copyId: 'copy-1', actorId: 'teacher-1' });
  });

  it('blocks new writes during deny-only rollback before invoking the service', async () => {
    const place = vi.fn();
    const handlers = createClassBookPlacementWorkerHandlers({ service: service(place) });
    const response = await handlers.handle({
      request: request('/v1/class-book-placement/place', { classId: 'class-1' }),
      env: { CLASS_BOOK_PLACEMENT_ENABLED: 'true', CLASS_BOOK_PLACEMENT_ROLLBACK: 'true' },
      uid: 'teacher-1',
    });
    expect(response.init?.status).toBe(503);
    expect(place).not.toHaveBeenCalled();
  });
});
