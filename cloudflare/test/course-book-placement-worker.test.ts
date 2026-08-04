import { describe, expect, it, vi } from 'vitest';
const delivery = { create: vi.fn(async (x) => x), revoke: vi.fn(async (x) => x), resolve: vi.fn(async (x) => x) };
vi.mock('../src/upload-worker/book-delivery/worker.ts', () => ({ createBookDeliveryWorkerHandlers: () => delivery }));
import { createCourseBookPlacementWorkerHandlers } from '../src/upload-worker/course-book-placement/worker.ts';

const placement = { status: 'active', courseId: 'course-1', moduleId: 'module-1', ownerId: 'teacher-1' };
const env = (overrides: Record<string, unknown> = {}) => ({ readDatabaseValue: async (path: string) => ({
  'course_materials/material-1': { bookDeliveryPlacement: placement }, 'courses/course-1': { ownerId: 'teacher-1' },
  'course_book_authority/enrollments/course-1/student-1': { status: 'active' }, 'course_book_authority/releases/course-1/module-1/student-1': { released: true }, system_flags: {}, ...overrides,
})[path] ?? null });
describe('default #59 Course worker composition', () => {
  it('delegates only an active enrolled released student to canonical scoped Delivery', async () => {
    const handlers = createCourseBookPlacementWorkerHandlers();
    await expect(handlers.resolve({ env: env(), uid: 'student-1', courseMaterialId: 'material-1' })).resolves.toMatchObject({ recipientId: 'student-1', contextId: 'material-1' });
    await expect(handlers.resolve({ env: env({ 'course_book_authority/releases/course-1/module-1/student-1': { released: false } }), uid: 'student-1', courseMaterialId: 'material-1' })).rejects.toThrow('course_book_resolution_denied');
  });
});
