import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter } from 'react-router-dom';
import { ModuleList } from './ModuleList';
import { getModulesByCourse, deleteModule, reorderModules } from '../../services/courseManager';
import { getClass, updateModuleProgress } from '../../services/classManager';
import { getMaterialsByCourse, syncMaterialWithOriginal, reorderMaterials } from '../../services/materialLinkManager';
// @ts-ignore
import queryOptimizer from '../../services/firebaseQueryOptimizer';

// Mock services
vi.mock('../../services/courseManager', () => ({
    getModulesByCourse: vi.fn(),
    deleteModule: vi.fn(),
    reorderModules: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
}));

vi.mock('../../services/classManager', () => ({
    updateModuleProgress: vi.fn(),
    getClass: vi.fn(),
}));


vi.mock('../../services/materialLinkManager', () => ({
    getMaterialsByCourse: vi.fn(),
    linkMaterialToModule: vi.fn(),
    copyMaterialToModule: vi.fn(),
    syncMaterialWithOriginal: vi.fn(),
    unmountMaterialFromModule: vi.fn(),
    reorderMaterials: vi.fn()
}));

vi.mock('../../services/firebaseQueryOptimizer', () => ({
    default: {
        getTest: vi.fn(),
        prefetch: vi.fn()
    },
    CacheTypes: { TEST: 'test' }
}));

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'teacher-1', role: 'teacher' }
    })
}));

// Mock dnd-kit components to capture handlers
vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        DndContext: ({ children, onDragEnd, id }: any) => (
            <div
                data-testid={id || "dnd-context"}
                onClick={(e) => {
                    e.stopPropagation();
                    if (id && id.startsWith('dnd-module-')) {
                        // Material reorder: swap link2 and link1
                        onDragEnd({ active: { id: 'link2' }, over: { id: 'link1' } });
                    } else {
                        // Module reorder
                        onDragEnd({ active: { id: 'm1' }, over: { id: 'm2' } });
                    }
                }}
            >
                {children}
            </div>
        ),
    };
});

// Mock ModuleEditor to avoid testing its internals here
vi.mock('./ModuleEditor', () => ({
    ModuleEditor: ({ opened, onClose, onSuccess }: any) =>
        opened ? (
            <div data-testid="module-editor">
                Module Editor Modal
                <button onClick={() => { onSuccess(); onClose(); }}>Save</button>
                <button onClick={onClose}>Cancel</button>
            </div>
        ) : null
}));

describe('ModuleList', () => {
    const mockModules = [
        { id: 'm1', courseId: 'c1', name: 'Module 1', order: 0, accessType: 'open' },
        { id: 'm2', courseId: 'c1', name: 'Module 2', order: 1, accessType: 'sequential' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (getModulesByCourse as any).mockResolvedValue(mockModules);
        (reorderModules as any).mockResolvedValue({ success: true });
        (getMaterialsByCourse as any).mockResolvedValue([
            {
                moduleId: 'm1', materials: [
                    { id: 'link1', materialId: 't1', isCopy: true, syncedAt: Date.now() },
                    { id: 'link2', materialId: 't2', isCopy: false }
                ]
            }
        ]);
        (queryOptimizer.getTest as any).mockResolvedValue({ title: 'Test Material' });
    });

    const renderWithMantine = (ui: React.ReactNode) => {
        return render(
            <MantineProvider>
                <Notifications />
                <MemoryRouter>
                    {ui}
                </MemoryRouter>
            </MantineProvider>
        );
    };

    it('renders modules correctly', async () => {
        renderWithMantine(<ModuleList courseId="c1" />);

        await waitFor(() => {
            expect(screen.getByText('Module 1')).toBeInTheDocument();
            expect(screen.getByText('Module 2')).toBeInTheDocument();
        });
    });

    it('handles module deletion', async () => {
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        (deleteModule as any).mockResolvedValue({ success: true });

        renderWithMantine(<ModuleList courseId="c1" />);

        await waitFor(() => expect(screen.getByText('Module 1')).toBeInTheDocument());

        const deleteButtons = screen.getAllByLabelText('Delete module');
        fireEvent.click(deleteButtons[0]);

        await waitFor(() => {
            expect(deleteModule).toHaveBeenCalledWith('m1');
            expect(getModulesByCourse).toHaveBeenCalledTimes(2); // Initial + after delete
        });
    });

    it('opens editor for creating new module', async () => {
        renderWithMantine(<ModuleList courseId="c1" />);

        await waitFor(() => {
            expect(screen.queryByText('Add Module')).toBeInTheDocument();
        });

        const addButton = screen.getByText('Add Module');
        fireEvent.click(addButton);

        await waitFor(() => {
            expect(screen.getByTestId('module-editor')).toBeInTheDocument();
        });
    });

    it('renders drag handles', async () => {
        renderWithMantine(<ModuleList courseId="c1" />);
        await waitFor(() => {
            const handles = screen.getAllByTestId('drag-handle');
            expect(handles).toHaveLength(2);
        });
    });

    it('handles manual reordering via mock trigger', async () => {
        (reorderModules as any).mockResolvedValue({ success: true });
        renderWithMantine(<ModuleList courseId="c1" />);

        await waitFor(() => expect(screen.getByText('Module 1')).toBeInTheDocument());

        // We trigger the reorder by clicking our mocked DndContext
        const dndContext = screen.getByTestId('dnd-context');
        fireEvent.click(dndContext);

        await waitFor(() => {
            expect(reorderModules).toHaveBeenCalledWith('c1', ['m2', 'm1']);
        });
    });

    it('renders mark complete button for sequential modules with classId', async () => {
        (getClass as any).mockResolvedValue({
            id: 'class-1',
            moduleProgress: {
                m1: { status: 'available' }
            }
        });
        (updateModuleProgress as any).mockResolvedValue(true);

        renderWithMantine(<ModuleList courseId="c1" classId="class-1" />);

        await waitFor(() => expect(screen.getByText('Module 2')).toBeInTheDocument());

        // Module 2 is sequential and not completed in our mock
        const markCompleteButtons = screen.getAllByLabelText('Mark complete');
        expect(markCompleteButtons).toHaveLength(1);

        fireEvent.click(markCompleteButtons[0]);

        await waitFor(() => {
            expect(updateModuleProgress).toHaveBeenCalledWith('class-1', 'm2', 'completed');
        });
    });

    it('renders materials and handles sync', async () => {
        renderWithMantine(<ModuleList courseId="c1" />);

        await waitFor(() => expect(screen.getByText('Module 1')).toBeInTheDocument());

        expect(getMaterialsByCourse).toHaveBeenCalledWith('c1');
    });

    it('flags linked private material as unavailable', async () => {
        (getMaterialsByCourse as any).mockResolvedValue([
            { moduleId: 'm1', materials: [{ id: 'link2', materialId: 't2', isCopy: false }] }
        ]);

        (queryOptimizer.getTest as any).mockResolvedValue({
            title: 'Private Material',
            isPublic: false,
            ownerId: 'u2'
        });

        renderWithMantine(<ModuleList courseId="c1" />);
        await waitFor(() => expect(screen.getByText('Module 1')).toBeInTheDocument());

        const toggles = screen.getAllByLabelText('Toggle materials');
        fireEvent.click(toggles[0]);

        await waitFor(() => {
            expect(screen.getByText('Unavailable')).toBeInTheDocument();
            expect(screen.getByText('Private Material')).toBeInTheDocument();
        });
    });

    it('handles material reordering', async () => {
        (reorderMaterials as any).mockResolvedValue();
        renderWithMantine(<ModuleList courseId="c1" />);
        await waitFor(() => expect(screen.getByText('Module 1')).toBeInTheDocument());

        // Open module to render materials
        const toggles = screen.getAllByLabelText('Toggle materials');
        fireEvent.click(toggles[0]);

        // Find the inner DndContext
        await waitFor(() => {
            expect(screen.getByTestId('dnd-module-m1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('dnd-module-m1'));

        await waitFor(() => {
            expect(reorderMaterials).toHaveBeenCalledWith(expect.arrayContaining(['link2', 'link1']));
        });
    });
});

