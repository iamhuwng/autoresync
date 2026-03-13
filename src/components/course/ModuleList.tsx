import { useEffect, useState } from 'react';
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
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

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
// @ts-ignore - JS service
import queryOptimizer, { CacheTypes } from '../../services/firebaseQueryOptimizer';
import { getMaterialsByCourse, syncMaterialContentWithOriginal, unmountMaterialFromModule, reorderMaterials } from '../../services/materialLinkManager';

const addButtonStyles = {
    root: {
        height: 34,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 10,
    },
    label: {
        fontSize: '0.875rem',
        fontWeight: 600,
    },
};

interface ModuleListProps {
    courseId: string;
    classId?: string; // Optional class context
    onStartSession?: (module: Module) => void; // Callback when starting a session
}

export const ModuleList = ({ courseId, classId, onStartSession }: ModuleListProps) => {
    const { user } = useAuth();
    const [modules, setModules] = useState<Module[]>([]);
    const [moduleProgress, setModuleProgress] = useState<Record<string, ModuleProgress>>({});
    const [moduleMaterials, setModuleMaterials] = useState<Record<string, ExtendedMaterial[]>>({});
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingModule, setEditingModule] = useState<Module | undefined>(undefined);

    // Material selector state
    const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
    const [targetModuleId, setTargetModuleId] = useState<string | null>(null);

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
            const allMaterialIds = grouped.flatMap(g => g.materials.map(m => m.materialId));
            if (allMaterialIds.length > 0) {
                await queryOptimizer.prefetch(CacheTypes.TEST, allMaterialIds);
            }

            for (const group of grouped) {
                resolvedMaterials[group.moduleId] = await Promise.all(group.materials.map(async m => {
                    const test = await queryOptimizer.getTest(m.materialId);

                    let isUnavailable = false;
                    // Check if public material access is revoked
                    if (!m.isCopy && test) {
                        // If test is private and we are not the owner, it's unavailable
                        if (!test.isPublic && test.ownerId !== user?.uid) {
                            isUnavailable = true;
                        }
                    }

                    return {
                        ...m,
                        title: test?.title || 'Unknown Material',
                        isUnavailable
                    };
                }));
            }
            setModuleMaterials(resolvedMaterials);
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Failed to load modules' });
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
            notifications.show({ color: 'green', message: 'Module marked as completed for this class' });
            loadModules();
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Failed to mark module complete' });
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
            notifications.show({ color: 'green', message: `Material ${type}ed successfully` });
            loadModules(); // Refresh to update counts
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Failed to add material' });
        }
    };

    const handleSyncMaterial = async (linkId: string) => {
        try {
            await syncMaterialContentWithOriginal(linkId);
            notifications.show({ color: 'green', message: 'Material synced successfully' });
            loadModules(); // Refresh to update timestamp and content
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Failed to sync material' });
        }
    };

    const handleRemoveMaterial = async (linkId: string) => {
        if (!confirm('Are you sure you want to remove this material from the module?')) return;
        try {
            await unmountMaterialFromModule(linkId);
            notifications.show({ color: 'blue', message: 'Material removed' });
            loadModules();
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Failed to remove material' });
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
            notifications.show({ color: 'red', message: 'Failed to reorder materials' });
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
                notifications.show({ color: 'green', message: 'Modules reordered' });
            } catch (error) {
                console.error(error);
                notifications.show({ color: 'red', message: 'Failed to save new order' });
                loadModules(); // Revert
            }
        }
    };

    if (loading) return <Loader mx="auto" display="block" my="xl" />;

    return (
        <Stack gap="sm">
            <Group justify="space-between" align="center">
                <div>
                    <Text fw={700} size="lg">Modules</Text>
                    <Text size="sm" c="dimmed">{modules.length} {modules.length === 1 ? 'module' : 'modules'}</Text>
                </div>
                <Button
                    leftSection={<IconPlus size={15} />}
                    onClick={() => { setEditingModule(undefined); setIsEditorOpen(true); }}
                    size="sm"
                    styles={addButtonStyles}
                >
                    Add Module
                </Button>
            </Group>

            {modules.length === 0 ? (
                <Text c="dimmed" ta="center" py="lg" size="sm">No modules yet. Add your first one to get started.</Text>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={modules.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <Stack gap={8}>
                            {modules.map(module => (
                                <ModuleItem
                                    key={module.id}
                                    module={module}
                                    materials={moduleMaterials[module.id] || []}
                                    isCompleted={moduleProgress[module.id]?.status === 'completed'}
                                    onMarkComplete={() => handleMarkComplete(module.id)}
                                    onAddMaterial={() => {
                                        setTargetModuleId(module.id);
                                        setIsMaterialSelectorOpen(true);
                                    }}
                                    onSyncMaterial={handleSyncMaterial}
                                    onRemoveMaterial={handleRemoveMaterial}
                                    onReorderMaterials={(newOrder) => handleReorderMaterials(module.id, newOrder)}
                                    onEdit={() => { setEditingModule(module); setIsEditorOpen(true); }}
                                    onRename={async (newName) => {
                                        await updateModule(module.id, { name: newName });
                                        loadModules();
                                        notifications.show({ color: 'blue', message: 'Module renamed' });
                                    }}
                                    onDelete={async () => {
                                        if (confirm('Are you sure you want to delete this module? All materials inside will also be removed.')) {
                                            await deleteModule(module.id);
                                            loadModules();
                                            notifications.show({ color: 'green', message: 'Module deleted' });
                                        }
                                    }}
                                    onStartSession={onStartSession ? () => onStartSession(module) : undefined}
                                    onOpenSettings={() => setSettingsModuleId(module.id)}
                                />
                            ))}
                        </Stack>
                    </SortableContext>
                </DndContext>
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

            {settingsModuleId && (
                <PracticeSettingsModal
                    opened={true}
                    onClose={() => setSettingsModuleId(null)}
                    courseId={courseId}
                    moduleId={settingsModuleId}
                />
            )}
        </Stack>
    );
};
