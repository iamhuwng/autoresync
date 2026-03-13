import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useSortable, arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Group, Text, ActionIcon, Badge, TextInput, Tooltip, Collapse, Stack, Button } from '@mantine/core';
import { IconGripVertical, IconEdit, IconTrash, IconBook, IconCheck, IconPlus, IconChevronRight, IconRefresh, IconAlertTriangle, IconPlayerPlay, IconSettings } from '@tabler/icons-react';
import type { Module, CourseMaterial } from '../../types/course.types';
import type { ModuleSyncStatus } from '../../services/courseSyncService';
import { ModuleSyncBanner } from './ModuleSyncBanner';

export interface ExtendedMaterial extends CourseMaterial {
    title: string;
    testType?: string;
    isUnavailable?: boolean;
}

const materialCardStyles = {
    root: {
        padding: '8px 10px',
        borderRadius: '10px',
    },
};

const moduleCardStyles = {
    root: {
        padding: '10px 12px',
        borderRadius: '12px',
    },
};

const iconActionStyles = {
    root: {
        width: 28,
        minWidth: 28,
        height: 28,
    },
};

interface ModuleItemProps {
    module: Module;
    materials?: ExtendedMaterial[];
    isCompleted?: boolean;
    syncStatus?: ModuleSyncStatus;      // Pending sync updates for this module
    copyCourseId?: string;               // Class-instance course ID (for sync operations)
    onSyncComplete?: () => void;         // Callback when sync apply/dismiss completes
    onMarkComplete?: () => void;
    onAddMaterial?: () => void;
    onSyncMaterial?: (linkId: string) => Promise<void>;
    onRemoveMaterial?: (linkId: string) => Promise<void>;
    onReorderMaterials?: (newOrder: string[]) => Promise<void>;
    onEdit: () => void;
    onDelete: () => void;
    onRename?: (newName: string) => Promise<void>;
    onStartSession?: () => void; // Start a session for this module
    onOpenSettings?: () => void;
}

// Sortable Item Component
const SortableMaterialItem = ({
    material,
    onSync,
    onRemove
}: {
    material: ExtendedMaterial,
    onSync?: (id: string) => Promise<void>,
    onRemove?: (id: string) => Promise<void>
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: material.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Card withBorder padding="xs" radius="sm" bg="gray.0" styles={materialCardStyles}>
                <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                        <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex' }} data-testid="material-drag-handle">
                            <IconGripVertical size={14} color="gray" />
                        </div>
                        <IconBook size={13} color="gray" />
                        <Text
                            size="xs"
                            fw={500}
                            component={Link}
                            to={`/material/${material.materialId}`}
                            state={{ courseId: material.courseId, moduleId: material.moduleId }}
                            style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', minWidth: 0, lineHeight: 1.3 }}
                            lineClamp={1}
                        >
                            {material.title}
                        </Text>
                        {material.isCopy && <Badge size="xs" color="blue" variant="dot">Copy</Badge>}
                        {material.isUnavailable && <Badge size="xs" color="red" leftSection={<IconAlertTriangle size={9} />}>Unavailable</Badge>}
                        {material.isCopy && material.syncedAt && (
                            <Text size="10px" c="dimmed">
                                Synced: {new Date(material.syncedAt).toLocaleDateString()}
                            </Text>
                        )}
                    </Group>

                    <Group gap={4} wrap="nowrap">
                        {material.isCopy && onSync && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                leftSection={<IconRefresh size={11} />}
                                onClick={() => onSync(material.id)}
                            >
                                Sync
                            </Button>
                        )}
                        {onRemove && (
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => onRemove(material.id)}
                                aria-label="Remove material"
                                styles={iconActionStyles}
                            >
                                <IconTrash size={13} />
                            </ActionIcon>
                        )}
                    </Group>
                </Group>
            </Card>
        </div>
    );
};

export const ModuleItem = ({
    module,
    materials = [],
    isCompleted,
    syncStatus,
    copyCourseId,
    onSyncComplete,
    onMarkComplete,
    onAddMaterial,
    onSyncMaterial,
    onRemoveMaterial,
    onReorderMaterials,
    onEdit,
    onDelete,
    onRename,
    onStartSession,
    onOpenSettings
}: ModuleItemProps) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState(module.name);
    const [isOpen, setIsOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && onReorderMaterials) {
            const oldIndex = materials.findIndex(m => m.id === active.id);
            const newIndex = materials.findIndex(m => m.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(materials, oldIndex, newIndex).map(m => m.id);
                onReorderMaterials(newOrder);
            }
        }
    };

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: module.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleRename = async () => {
        if (editedName.trim() === '' || editedName === module.name) {
            setIsEditingName(false);
            setEditedName(module.name);
            return;
        }

        if (onRename) {
            await onRename(editedName);
        }
        setIsEditingName(false);
    };

    return (
        <Card
            withBorder
            shadow="sm"
            padding="sm"
            ref={setNodeRef}
            style={style}
            styles={moduleCardStyles}
        >
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }} data-testid="drag-handle">
                        <IconGripVertical size={16} color="gray" />
                    </div>

                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => setIsOpen(!isOpen)}
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                        aria-label="Toggle materials"
                        styles={iconActionStyles}
                    >
                        <IconChevronRight size={14} />
                    </ActionIcon>

                    {isEditingName ? (
                        <TextInput
                            value={editedName}
                            onChange={(e) => setEditedName(e.currentTarget.value)}
                            onBlur={handleRename}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter') handleRename();
                                if (e.key === 'Escape') {
                                    setIsEditingName(false);
                                    setEditedName(module.name);
                                }
                            }}
                            size="sm"
                            autoFocus
                            style={{ flex: 1 }}
                        />
                    ) : (
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Text
                                fw={600}
                                size="sm"
                                style={{ cursor: 'pointer', lineHeight: 1.3 }}
                                onClick={() => setIsEditingName(true)}
                                lineClamp={1}
                            >
                                {module.name}
                            </Text>
                            <Group gap={6} mt={4} wrap="wrap">
                                <Group gap={4} c="dimmed" wrap="nowrap">
                                    <IconBook size={12} />
                                    <Text size="11px">{module.materialsCount || 0} materials</Text>
                                </Group>

                                {syncStatus && syncStatus.pendingMaterials.length > 0 && (
                                    <Badge size="xs" color="blue" variant="dot">
                                        {syncStatus.pendingMaterials.length} update{syncStatus.pendingMaterials.length !== 1 ? 's' : ''}
                                    </Badge>
                                )}

                                {isCompleted && (
                                    <Badge color="green" variant="light" size="xs" leftSection={<IconCheck size={10} />}>
                                        Done
                                    </Badge>
                                )}

                                <Badge size="xs" color={module.accessType === 'sequential' ? 'orange' : 'gray'} variant="light">
                                    {module.accessType === 'sequential' ? 'Sequential' : 'Open'}
                                </Badge>
                            </Group>
                        </div>
                    )}
                </Group>

                <Group gap={4} wrap="wrap" justify="flex-end" style={{ flexShrink: 0 }}>
                    {onStartSession && materials.length > 0 && (
                        <Tooltip label="Start a session for this module">
                            <Button
                                variant="light"
                                color="violet"
                                size="compact-xs"
                                leftSection={<IconPlayerPlay size={14} />}
                                onClick={onStartSession}
                            >
                                Start
                            </Button>
                        </Tooltip>
                    )}
                    {onAddMaterial && (
                        <Tooltip label="Add material to this module">
                            <ActionIcon variant="light" color="blue" onClick={onAddMaterial} aria-label="Add material" styles={iconActionStyles}>
                                <IconPlus size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {module.accessType === 'sequential' && !isCompleted && onMarkComplete && (
                        <Tooltip label="Mark as completed for this class">
                            <ActionIcon variant="light" color="green" onClick={onMarkComplete} aria-label="Mark complete" styles={iconActionStyles}>
                                <IconCheck size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {onOpenSettings && (
                        <Tooltip label="Configure Practice Settings for Module">
                            <ActionIcon variant="light" color="cyan" onClick={onOpenSettings} aria-label="Practice Settings" styles={iconActionStyles}>
                                <IconSettings size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <ActionIcon variant="subtle" color="blue" onClick={onEdit} aria-label="Edit module" styles={iconActionStyles}>
                        <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label="Delete module" styles={iconActionStyles}>
                        <IconTrash size={14} />
                    </ActionIcon>
                </Group>
            </Group>

            <Collapse in={isOpen}>
                {/* Sync Banner (inside collapsed content) */}
                {syncStatus && copyCourseId && onSyncComplete && syncStatus.pendingMaterials.length > 0 && (
                    <div style={{ padding: '8px 0 4px 26px' }}>
                        <ModuleSyncBanner
                            copyCourseId={copyCourseId}
                            syncStatus={syncStatus}
                            onSyncComplete={onSyncComplete}
                        />
                    </div>
                )}
                <DndContext
                    id={`dnd-module-${module.id}`}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={materials.map(m => m.id)} strategy={verticalListSortingStrategy}>
                        <Stack gap={6} mt={8} pl={26}>
                            {materials.length === 0 && (
                                <Text c="dimmed" size="sm" fs="italic">No materials in this module</Text>
                            )}
                            {materials.map(mat => (
                                <SortableMaterialItem
                                    key={mat.id}
                                    material={mat}
                                    onSync={onSyncMaterial}
                                    onRemove={onRemoveMaterial}
                                />
                            ))}
                        </Stack>
                    </SortableContext>
                </DndContext>
            </Collapse>
        </Card>
    );
};

