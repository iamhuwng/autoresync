import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkMaterialToModule, copyMaterialToModule } from './materialLinkManager';
import { set, update } from 'firebase/database';
import { getTestFromFirebase } from './testStorage';

vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn(),
    update: vi.fn(),
}));

vi.mock('./testStorage', () => ({
    getTestFromFirebase: vi.fn(),
    generateTestId: vi.fn(() => 'test-copy-123'),
}));

describe('materialLinkManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('links material to module correctly', async () => {
        (set as any).mockResolvedValue(true);
        const result = await linkMaterialToModule('c1', 'm1', 't1');

        expect(result.materialId).toBe('t1');
        expect(result.isCopy).toBe(false);
        expect(set).toHaveBeenCalled();
    });

    it('copies material to module correctly', async () => {
        const mockTest = {
            id: 't1',
            title: 'Test 1',
            questions: []
        };
        (getTestFromFirebase as any).mockResolvedValue({ success: true, data: mockTest });
        (set as any).mockResolvedValue(true);
        (update as any).mockResolvedValue(true);

        const result = await copyMaterialToModule('c1', 'm1', 't1', 'u1');

        expect(result.materialId).toBe('test-copy-123');
        expect(result.isCopy).toBe(true);
        expect(result.originalMaterialId).toBe('t1');

        expect(update).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
                'tests/test-copy-123': expect.objectContaining({
                    id: 'test-copy-123',
                    ownerId: 'u1',
                    isPublic: false,
                }),
                'material_catalog/material_summary_indexes/v1/by_owner/u1/test-copy-123':
                    expect.objectContaining({
                        materialId: 'test-copy-123',
                        ownerId: 'u1',
                        visibility: 'private',
                    }),
            }),
        );
        expect(set).toHaveBeenCalledTimes(1);
    });

    it('removes material from module correctly', async () => {
        const { remove } = await import('firebase/database');
        (remove as any).mockResolvedValue(true);

        const { unmountMaterialFromModule } = await import('./materialLinkManager');
        await unmountMaterialFromModule('link-123');

        expect(remove).toHaveBeenCalled();
    });

    it('gets materials by course grouped by module', async () => {
        const { get } = await import('firebase/database');
        const mockMaterials = {
            'link-1': { id: 'link-1', courseId: 'c1', moduleId: 'm1', materialId: 't1', order: 1, isCopy: false },
            'link-2': { id: 'link-2', courseId: 'c1', moduleId: 'm1', materialId: 't2', order: 2, isCopy: false },
            'link-3': { id: 'link-3', courseId: 'c1', moduleId: 'm2', materialId: 't3', order: 1, isCopy: true, originalMaterialId: 'orig-1' }
        };
        (get as any).mockResolvedValue({
            exists: () => true,
            val: () => mockMaterials
        });

        const { getMaterialsByCourse } = await import('./materialLinkManager');
        const result = await getMaterialsByCourse('c1');

        expect(result).toHaveLength(2); // 2 modules

        const m1Group = result.find(g => g.moduleId === 'm1');
        const m2Group = result.find(g => g.moduleId === 'm2');

        expect(m1Group?.materials).toHaveLength(2);
        expect(m2Group?.materials).toHaveLength(1);
    });

    it('synchronizes copied material with original correctly', async () => {
        const { get, set, update } = await import('firebase/database');
        const { syncMaterialContentWithOriginal } = await import('./materialLinkManager');

        const mockLink = {
            id: 'link-123',
            courseId: 'c1',
            moduleId: 'm1',
            materialId: 'copy-123',
            isCopy: true,
            originalMaterialId: 'orig-123'
        };

        const mockOriginal = {
            id: 'orig-123',
            title: 'Original Title',
            questions: [{ q: 'New question?' }]
        };

        const mockCopy = {
            id: 'copy-123',
            title: 'Copy Title',
            ownerId: 'u1',
            isPublic: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
            questions: [{ q: 'Old question?' }]
        };

        // 1. Mock link retrieval
        (get as any).mockResolvedValueOnce({
            exists: () => true,
            val: () => mockLink
        });

        // 2. Mock test retrieval (original and then copy)
        (getTestFromFirebase as any)
            .mockResolvedValueOnce({ success: true, data: mockOriginal })
            .mockResolvedValueOnce({ success: true, data: mockCopy });

        (set as any).mockResolvedValue(true);
        (update as any).mockResolvedValue(true);

        const result = await syncMaterialContentWithOriginal('link-123');

        expect(result.syncedAt).toBeDefined();
        expect(update).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({
                'tests/copy-123': expect.objectContaining({
                    id: 'copy-123',
                    ownerId: 'u1',
                    isPublic: false,
                }),
                'material_catalog/material_summary_indexes/v1/by_owner/u1/copy-123':
                    expect.objectContaining({
                        materialId: 'copy-123',
                        ownerId: 'u1',
                    }),
            }),
        );
        expect(set).toHaveBeenCalledTimes(1);

        const junctionUpdate = (set as any).mock.calls[0][1];
        expect(junctionUpdate.syncedAt).toBeDefined();
    });
});
