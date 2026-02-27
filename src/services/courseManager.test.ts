import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCourseByCode } from './courseManager';
import { get, query, ref, orderByChild, equalTo } from 'firebase/database';

vi.mock('firebase/database');

describe('courseManager - getCourseByCode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return course if code matches', async () => {
        const mockCourse = { id: 'c1', code: 'MATH101', name: 'Math' };
        (get as any).mockResolvedValue({
            exists: () => true,
            val: () => ({ 'c1': mockCourse })
        });

        const result = await getCourseByCode('MATH101');
        expect(result).toEqual(mockCourse);
        expect(query).toHaveBeenCalled();
    });

    it('should return null if code not found', async () => {
        (get as any).mockResolvedValue({
            exists: () => false
        });

        const result = await getCourseByCode('INVALID');
        expect(result).toBeNull();
    });
});

describe('courseManager - Archival & Deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('archiveCourse: should fail if active enrollments exist', async () => {
        const { archiveCourse } = await import('./courseManager');

        // Mock snapshot.exists() as true for enrollments
        (get as any).mockResolvedValueOnce({
            exists: () => true,
            val: () => ({
                'e1': { id: 'e1', status: 'active' }
            })
        });

        const result = await archiveCourse('c1');
        expect(result.success).toBe(false);
        expect(result.error).toContain('active enrollments');
    });

    it('archiveCourse: should succeed if no active enrollments exist', async () => {
        const { archiveCourse } = await import('./courseManager');
        const { update } = await import('firebase/database');

        // Mock snapshot.exists() as false for enrollments
        (get as any).mockResolvedValueOnce({
            exists: () => false
        });

        const result = await archiveCourse('c1');
        expect(result.success).toBe(true);
        expect(update).toHaveBeenCalled();
    });

    it('restoreCourse: should clear archivedAt and hardDeleteAt', async () => {
        const { restoreCourse } = await import('./courseManager');
        const { update: mockUpdate } = await import('firebase/database');

        const result = await restoreCourse('c1');
        expect(result.success).toBe(true);
        const lastCall = vi.mocked(mockUpdate).mock.calls.find(call =>
            call[1] && 'archivedAt' in call[1]
        );
        expect(lastCall).toBeDefined();
        expect(lastCall![1]).toHaveProperty('archivedAt', null);
        expect(lastCall![1]).toHaveProperty('hardDeleteAt', null);
    });

    it('hardDeleteCourse: should remove course and associated records', async () => {
        const { hardDeleteCourse } = await import('./courseManager');
        const { remove, get: mockGet, update: mockUpdate } = await import('firebase/database');

        // Mock modules and materials check
        (mockGet as any).mockResolvedValue({
            exists: () => false
        });

        const result = await hardDeleteCourse('c1');
        expect(result.success).toBe(true);
        expect(remove).toHaveBeenCalled();
    });
});
