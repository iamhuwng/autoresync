import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useSortable, arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Group, Text, ActionIcon, Badge, TextInput, Tooltip, Collapse, Stack, Button } from '@mantine/core';
import { IconGripVertical, IconEdit, IconTrash, IconBook, IconCheck, IconPlus, IconChevronRight, IconRefresh, IconAlertTriangle, IconPlayerPlay, IconSettings } from '@tabler/icons-react';
import type { Module, CourseMaterial } from '../../types/course.types';

export interface ExtendedMaterial extends CourseMaterial {
    title: string;
    isUnavailable?: boolean;
}

interface ModuleItemProps {
    module: Module;
    materials?: ExtendedMaterial[];
    isCompleted?: boolean;
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
            <Card withBorder padding="xs" radius="sm" bg="gray.0">
                <Group justify="space-between">
                    <Group gap="xs">
                        <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex' }} data-testid="material-drag-handle">
                            <IconGripVertical size={16} color="gray" />
                        </div>
                        <IconBook size={14} color="gray" />
                        <Text
                            size="sm"
                            fw={500}
                            component={Link}
                            to={`/material/${material.materialId}`}
                            state={{ courseId: material.courseId, moduleId: material.moduleId }}
                            style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
                        >
                            {material.title}
                        </Text>
                        {material.isCopy && <Badge size="xs" color="blue" variant="dot">Copy</Badge>}
                        {material.isUnavailable && <Badge size="xs" color="red" leftSection={<IconAlertTriangle size={10} />}>Unavailable</Badge>}
                        {material.isCopy && material.syncedAt && (
                            <Text size="xs" c="dimmed">
                                Synced: {new Date(material.syncedAt).toLocaleDateString()}
                            </Text>
                        )}
                    </Group>

                    <Group gap="xs">
                        {material.isCopy && onSync && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                leftSection={<IconRefresh size={12} />}
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
                            >
                                <IconTrash size={14} />
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
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }} data-testid="drag-handle">
                        <IconGripVertical size={18} color="gray" />
                    </div>

                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => setIsOpen(!isOpen)}
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                        aria-label="Toggle materials"
                    >
                        <IconChevronRight size={16} />
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
                        <Text
                            fw={500}
                            style={{ flex: 1, cursor: 'pointer' }}
                            onClick={() => setIsEditingName(true)}
                        >
                            {module.name}
                        </Text>
                    )}

                    <Group gap={4} c="dimmed">
                        <IconBook size={14} />
                        <Text size="xs">{module.materialsCount || 0} materials</Text>
                    </Group>

                    {isCompleted && (
                        <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                            Completed
                        </Badge>
                    )}

                    <Badge size="xs" color={module.accessType === 'sequential' ? 'orange' : 'gray'}>
                        {module.accessType}
                    </Badge>
                </Group>

                <Group gap="xs">
                    {onStartSession && materials.length > 0 && (
                        <Tooltip label="Start a session for this module">
                            <Button
                                variant="light"
                                color="violet"
                                size="compact-sm"
                                leftSection={<IconPlayerPlay size={16} />}
                                onClick={onStartSession}
                            >
                                Start Session
                            </Button>
                        </Tooltip>
                    )}
                    {onAddMaterial && (
                        <Tooltip label="Add material to this module">
                            <ActionIcon variant="light" color="blue" onClick={onAddMaterial} aria-label="Add material">
                                <IconPlus size={16} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {module.accessType === 'sequential' && !isCompleted && onMarkComplete && (
                        <Tooltip label="Mark as completed for this class">
                            <ActionIcon variant="light" color="green" onClick={onMarkComplete} aria-label="Mark complete">
                                <IconCheck size={16} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {onOpenSettings && (
                        <Tooltip label="Configure Practice Settings for Module">
                            <ActionIcon variant="light" color="cyan" onClick={onOpenSettings} aria-label="Practice Settings">
                                <IconSettings size={16} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <ActionIcon variant="subtle" color="blue" onClick={onEdit} aria-label="Edit module">
                        <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label="Delete module">
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            </Group>

            <Collapse in={isOpen}>
                <DndContext
                    id={`dnd-module-${module.id}`}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={materials.map(m => m.id)} strategy={verticalListSortingStrategy}>
                        <Stack gap="xs" mt="md" pl={30}>
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

