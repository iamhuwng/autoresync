import { useEffect, useMemo, useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    arrayMove
} from '@dnd-kit/sortable';
import { IconPlus } from '@tabler/icons-react';

import { getModulesByCourse, reorderModules, deleteModule, updateModule } from '../../services/courseManager';
import { updateModuleProgress, getClass } from '../../services/classManager';
import { linkMaterialToModule, copyMaterialToModule } from '../../services/materialLinkManager';
import { useAuth } from '../../hooks/useAuth';
import type { Module } from '../../types/course.types';
import type { ModuleProgress } from '../../types/class.types';
import { ModuleItem, ExtendedMaterial } from './ModuleItem';
import { ModuleEditor } from './ModuleEditor'; // Modal for editing
import { MaterialSelectorModal } from './MaterialSelectorModal';
import { PracticeSettingsModal } from '../PracticeSettingsModal';
import { NewModuleSyncBanner } from './NewModuleSyncBanner';
import { detectSyncUpdates } from '../../services/courseSyncService';
import type { CourseSyncStatus } from '../../services/courseSyncService';
// @ts-ignore - JS service
import queryOptimizer, { CacheTypes } from '../../services/firebaseQueryOptimizer';
import { getMaterialsByCourse, syncMaterialContentWithOriginal, unmountMaterialFromModule, reorderMaterials } from '../../services/materialLinkManager';
import { createCourseBookPlacementBrowserClient, isCourseBookPlacementPresentationEnabled } from '../../services/book-delivery/courseBookPlacement.browser';
import { CourseBookPlacementModal } from './CourseBookPlacementModal';
import { toast } from '../modern';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';

interface ModuleListProps {
    courseId: string;
    classId?: string; // Optional class context
    onStartSession?: (module: Module) => void; // Callback when starting a session
}

export const ModuleList = ({ courseId, classId, onStartSession }: ModuleListProps) => {
    const { user } = useAuth();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.courses);
    const courseBookEnabled = isCourseBookPlacementPresentationEnabled();
    const courseBookClient = useMemo(() => courseBookEnabled ? createCourseBookPlacementBrowserClient() : null, [courseBookEnabled]);
    const [modules, setModules] = useState<Module[]>([]);
    const [moduleProgress, setModuleProgress] = useState<Record<string, ModuleProgress>>({});
    const [moduleMaterials, setModuleMaterials] = useState<Record<string, ExtendedMaterial[]>>({});
    const [loading, setLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<CourseSyncStatus | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingModule, setEditingModule] = useState<Module | undefined>(undefined);

    // Material selector state
    const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
    const [targetModuleId, setTargetModuleId] = useState<string | null>(null);
    const [targetBookModuleId, setTargetBookModuleId] = useState<string | null>(null);

    // Practice Settings state
    const [settingsModuleId, setSettingsModuleId] = useState<string | null>(null);

    // Fetch modules
    const loadModules = async () => {
        setLoading(true);
        try {
            const data = await getModulesByCourse(courseId);
            setModules(data);

            if (classId) {
                const classData = await getClass(classId);
                if (classData && classData.moduleProgress) {
                    setModuleProgress(classData.moduleProgress);
                }
            }

            // Load materials
            const grouped = await getMaterialsByCourse(courseId);
            const resolvedMaterials: Record<string, ExtendedMaterial[]> = {};

            // Prefetch all test data efficiently
            const allMaterialIds = grouped.flatMap(g => g.materials
                .filter(m => m.materialKind !== 'book-delivery')
                .map(m => m.materialId));
            if (allMaterialIds.length > 0) {
                await queryOptimizer.prefetch(CacheTypes.TEST, allMaterialIds);
            }

            for (const group of grouped) {
                resolvedMaterials[group.moduleId] = await Promise.all(group.materials.map(async m => {
                    if (m.materialKind === 'book-delivery') {
                        return {
                            ...m,
                            title: m.bookDeliveryPlacement?.displayTitle || 'Book activity',
                            testType: 'Book',
                            isUnavailable: m.bookDeliveryPlacement?.status !== 'active',
                        };
                    }
                    const test = await queryOptimizer.getTest(m.materialId);

                    let isUnavailable = false;
                    // Check if public material access is revoked
                    if (!m.isCopy && test) {
                        // If test is private and we are not the owner, it's unavailable
                        if (!test.isPublic && test.ownerId !== user?.uid) {
                            isUnavailable = true;
                        }
                    }

                    // Resolve title: THCS tests store title in metadata.title,
                    // regular tests store it at top-level title
                    const resolvedTitle = test
                        ? (test.testType === 'THCS-THPT'
                            ? (test.metadata?.title || test.title || 'Untitled THCS Test')
                            : (test.title || 'Untitled'))
                        : 'Unknown Material';

                    return {
                        ...m,
                        title: resolvedTitle,
                        testType: test?.testType,
                        isUnavailable
                    };
                }));
            }
            setModuleMaterials(resolvedMaterials);

            // Detect sync updates (non-blocking, runs after materials load)
            detectSyncUpdates(courseId).then(status => {
                setSyncStatus(status);
            }).catch(err => {
                console.error('Sync detection failed:', err);
            });
        } catch (error) {
            console.error(error);
            toast.error('Failed to load modules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadModules();
    }, [courseId, classId]);

    const handleMarkComplete = async (moduleId: string) => {
        if (!classId) return;
        try {
            await updateModuleProgress(classId, moduleId, 'completed');
            toast.success('Module marked as completed for this class');
            loadModules();
        } catch (error) {
            console.error(error);
            toast.error('Failed to mark module complete');
        }
    };

    const handleAddMaterial = async (materialId: string, type: 'link' | 'copy') => {
        if (!targetModuleId || !user) return;
        try {
            if (type === 'link') {
                await linkMaterialToModule(courseId, targetModuleId, materialId);
            } else {
                await copyMaterialToModule(courseId, targetModuleId, materialId, user.uid);
            }
            toast.success(`Material ${type}ed successfully`);
            loadModules(); // Refresh to update counts
        } catch (error) {
            console.error(error);
            toast.error('Failed to add material');
        }
    };

    const handleSyncMaterial = async (linkId: string) => {
        try {
            await syncMaterialContentWithOriginal(linkId);
            toast.success('Material synced successfully');
            loadModules(); // Refresh to update timestamp and content
        } catch (error) {
            console.error(error);
            toast.error('Failed to sync material');
        }
    };

    const handleRemoveMaterial = async (linkId: string) => {
        const material = Object.values(moduleMaterials).flat().find((candidate) => candidate.id === linkId);
        const question = material?.materialKind === 'book-delivery'
            ? `Revoke "${material.title}" from this Course? Existing immutable Book records will be preserved.`
            : 'Are you sure you want to remove this material from the module?';
        if (!confirm(question)) return;
        try {
            if (material?.materialKind === 'book-delivery') {
                if (!courseBookClient) throw new Error('course_book_routes_disabled');
                trackAction('revokeCourseBook', { courseMaterialId: linkId, courseId });
                await courseBookClient.revoke({ operationId: crypto.randomUUID(), courseMaterialId: linkId });
                toast.success(`Revoked "${material.title}" from this Course. Existing immutable records were preserved.`);
            } else {
                await unmountMaterialFromModule(linkId);
                toast.info('Material removed');
            }
            loadModules();
        } catch (error) {
            console.error(error);
            if (Object.values(moduleMaterials).flat().some((candidate) => candidate.id === linkId && candidate.materialKind === 'book-delivery')) {
                toast.error('Could not revoke this Book item from the Course.');
            } else {
                toast.error('Failed to remove material');
            }
        }
    };

    const handleReorderMaterials = async (moduleId: string, newOrder: string[]) => {
        const originalMaterials = moduleMaterials[moduleId] || [];
        const currentGroup = moduleMaterials[moduleId] || [];
        const newGroup = newOrder.map(id => currentGroup.find(m => m.id === id)).filter(Boolean) as ExtendedMaterial[];

        setModuleMaterials(prev => ({
            ...prev,
            [moduleId]: newGroup
        }));

        try {
            await reorderMaterials(newOrder);
        } catch (error) {
            console.error(error);
            toast.error('Failed to reorder materials');
            setModuleMaterials(prev => ({
                ...prev,
                [moduleId]: originalMaterials
            }));
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = modules.findIndex((m) => m.id === active.id);
            const newIndex = modules.findIndex((m) => m.id === over.id);

            const reordered = arrayMove(modules, oldIndex, newIndex);
            setModules(reordered);

            try {
                const newIds = reordered.map(m => m.id);
                const result = await reorderModules(courseId, newIds);
                if (!result.success) throw new Error(result.error);
                toast.success('Modules reordered');
            } catch (error) {
                console.error(error);
                toast.error('Failed to save new order');
                loadModules(); // Revert
            }
        }
    };

    if (loading) return <p role="status" className="py-8 text-center text-sm text-slate-500">Loading modules…</p>;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="m-0 text-lg font-bold">Modules</h2>
                    <p className="m-0 text-sm text-slate-500">{modules.length} {modules.length === 1 ? 'module' : 'modules'}</p>
                </div>
                <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={() => { setEditingModule(undefined); setIsEditorOpen(true); }}
                >
                    <IconPlus size={15} />
                    Add Module
                </button>
            </div>

            {modules.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No modules yet. Add your first one to get started.</p>
            ) : (
                <>
                {/* New Modules Sync Banner */}
                {syncStatus?.newModules && syncStatus.newModules.length > 0 && (
                    <NewModuleSyncBanner
                        copyCourseId={courseId}
                        newModules={syncStatus.newModules}
                        onSyncComplete={loadModules}
                    />
                )}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={modules.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="flex flex-col gap-2">
                            {modules.map(module => (
                                <ModuleItem
                                    key={module.id}
                                    module={module}
                                    materials={moduleMaterials[module.id] || []}
                                    isCompleted={moduleProgress[module.id]?.status === 'completed'}
                                    syncStatus={syncStatus?.moduleUpdates.find(u => u.copyModuleId === module.id)}
                                    copyCourseId={courseId}
                                    onSyncComplete={loadModules}
                                    onMarkComplete={() => handleMarkComplete(module.id)}
                                    onAddMaterial={() => {
                                        setTargetModuleId(module.id);
                                        setIsMaterialSelectorOpen(true);
                                    }}
                                    onAddBook={!classId && courseBookClient ? () => {
                                        trackAction('openCourseBookPlacement', { courseId, moduleId: module.id });
                                        setTargetBookModuleId(module.id);
                                    } : undefined}
                                    onSyncMaterial={handleSyncMaterial}
                                    onRemoveMaterial={handleRemoveMaterial}
                                    onReorderMaterials={(newOrder) => handleReorderMaterials(module.id, newOrder)}
                                    onEdit={() => { setEditingModule(module); setIsEditorOpen(true); }}
                                    onRename={async (newName) => {
                                        await updateModule(module.id, { name: newName });
                                        loadModules();
                                        toast.info('Module renamed');
                                    }}
                                    onDelete={async () => {
                                        if (confirm('Are you sure you want to delete this module? All materials inside will also be removed.')) {
                                            await deleteModule(module.id);
                                            loadModules();
                                            toast.success('Module deleted');
                                        }
                                    }}
                                    onStartSession={onStartSession ? () => onStartSession(module) : undefined}
                                    onOpenSettings={() => setSettingsModuleId(module.id)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
                </>
            )}

            <ModuleEditor
                opened={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                onSuccess={loadModules}
                courseId={courseId}
                module={editingModule}
            />

            <MaterialSelectorModal
                opened={isMaterialSelectorOpen}
                onClose={() => setIsMaterialSelectorOpen(false)}
                onSelect={handleAddMaterial}
            />

            {targetBookModuleId && courseBookClient && user && (
                <CourseBookPlacementModal
                    opened
                    onClose={() => setTargetBookModuleId(null)}
                    teacherId={user.uid}
                    courseId={courseId}
                    moduleId={targetBookModuleId}
                    readCatalog={(bookId) => courseBookClient.catalog(bookId)}
                    place={(request) => courseBookClient.place(request)}
                    onPlaced={loadModules}
                    trackAction={trackAction}
                />
            )}

            {settingsModuleId && (
                <PracticeSettingsModal
                    opened={true}
                    onClose={() => setSettingsModuleId(null)}
                    courseId={courseId}
                    moduleId={settingsModuleId}
                />
            )}
        </div>
    );
};
