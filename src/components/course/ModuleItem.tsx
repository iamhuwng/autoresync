import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useSortable, arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconEdit, IconTrash, IconBook, IconCheck, IconPlus, IconChevronRight, IconRefresh, IconAlertTriangle, IconPlayerPlay, IconSettings, IconBooks } from '@tabler/icons-react';
import { buildRoute } from '../../constants/routes';
import type { Module, CourseMaterial } from '../../types/course.types';
import type { ModuleSyncStatus } from '../../services/courseSyncService';
import { ModuleSyncBanner } from './ModuleSyncBanner';

export interface ExtendedMaterial extends CourseMaterial {
    title: string;
    testType?: string;
    isUnavailable?: boolean;
}

const iconActionClass = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2';
const badgeClass = 'inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs';

interface ModuleItemProps {
    module: Module;
    materials?: ExtendedMaterial[];
    isCompleted?: boolean;
    syncStatus?: ModuleSyncStatus;      // Pending sync updates for this module
    copyCourseId?: string;               // Class-instance course ID (for sync operations)
    onSyncComplete?: () => void;         // Callback when sync apply/dismiss completes
    onMarkComplete?: () => void;
    onAddMaterial?: () => void;
    onAddBook?: () => void;
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
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex' }} data-testid="material-drag-handle">
                            <IconGripVertical size={14} color="gray" />
                        </div>
                        <IconBook size={13} color="gray" />
                        {material.materialKind === 'book-delivery' ? (
                            <Link
                                to={buildRoute('TEACHER_MATERIAL_BOOK', { bookId: material.materialId })}
                                style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', minWidth: 0, lineHeight: 1.3 }}
                                className="truncate text-xs font-medium"
                                title={material.title}
                            >{material.title}</Link>
                        ) : (
                            <Link
                                to={`/material/${material.materialId}`}
                                state={{ courseId: material.courseId, moduleId: material.moduleId }}
                                style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', minWidth: 0, lineHeight: 1.3 }}
                                className="truncate text-xs font-medium"
                                title={material.title}
                            >{material.title}</Link>
                        )}
                        {material.materialKind === 'book-delivery' && <span className={`${badgeClass} text-violet-700`}>Book</span>}
                        {material.isCopy && <span className={`${badgeClass} text-blue-700`}>Copy</span>}
                        {material.isUnavailable && <span className={`${badgeClass} text-red-700`}><IconAlertTriangle size={9} />Unavailable</span>}
                        {material.isCopy && material.syncedAt && (
                            <span className="text-[10px] text-slate-500">
                                Synced: {new Date(material.syncedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        {material.isCopy && onSync && (
                            <button
                                type="button"
                                className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs text-blue-700 hover:bg-blue-50"
                                onClick={() => onSync(material.id)}
                            >
                                <IconRefresh size={11} /> Sync
                            </button>
                        )}
                        {onRemove && (
                            <button
                                type="button"
                                className={`${iconActionClass} text-red-700`}
                                onClick={() => onRemove(material.id)}
                                aria-label={material.materialKind === 'book-delivery' ? 'Revoke Book item' : 'Remove material'}
                            >
                                <IconTrash size={13} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
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
    onAddBook,
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
        <div
            className="rounded-md border border-slate-200 bg-white px-3 py-2.5"
            ref={setNodeRef}
            style={style}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }} data-testid="drag-handle">
                        <IconGripVertical size={16} color="gray" />
                    </div>

                    <button
                        type="button"
                        className={`${iconActionClass} text-slate-600`}
                        onClick={() => setIsOpen(!isOpen)}
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                        aria-label="Toggle materials"
                        aria-expanded={isOpen}
                    >
                        <IconChevronRight size={14} />
                    </button>

                    {isEditingName ? (
                        <input
                            aria-label="Module name"
                            className="min-h-11 min-w-0 flex-1 rounded border border-slate-300 px-2 text-sm"
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
                            autoFocus
                            style={{ flex: 1 }}
                        />
                    ) : (
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                                type="button"
                                className="min-h-11 max-w-full truncate bg-transparent p-0 text-left text-sm font-semibold"
                                title={module.name}
                                style={{ cursor: 'pointer', lineHeight: 1.3 }}
                                onClick={() => setIsEditingName(true)}
                            >
                                {module.name}
                            </button>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <IconBook size={12} />
                                    <span className="text-[11px]">{module.materialsCount || 0} materials</span>
                                </span>

                                {syncStatus && syncStatus.pendingMaterials.length > 0 && (
                                    <span className={`${badgeClass} text-blue-700`}>
                                        {syncStatus.pendingMaterials.length} update{syncStatus.pendingMaterials.length !== 1 ? 's' : ''}
                                    </span>
                                )}

                                {isCompleted && (
                                    <span className={`${badgeClass} text-green-700`}>
                                        <IconCheck size={10} /> Done
                                    </span>
                                )}

                                <span className={`${badgeClass} ${module.accessType === 'sequential' ? 'text-orange-700' : 'text-slate-600'}`}>
                                    {module.accessType === 'sequential' ? 'Sequential' : 'Open'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {onStartSession && materials.length > 0 && (
                            <button
                                type="button"
                                title="Start a session for this module"
                                className="inline-flex min-h-11 items-center gap-1 rounded bg-violet-50 px-2 text-xs text-violet-700"
                                onClick={onStartSession}
                            >
                                <IconPlayerPlay size={14} /> Start
                            </button>
                    )}
                    {onAddMaterial && (
                            <button type="button" title="Add material to this module" className={`${iconActionClass} text-blue-700`} onClick={onAddMaterial} aria-label="Add material">
                                <IconPlus size={14} />
                            </button>
                    )}
                    {onAddBook && (
                            <button type="button" title="Add a published Book to this module" className={`${iconActionClass} text-violet-700`} onClick={onAddBook} aria-label="Add Book">
                                <IconBooks size={14} />
                            </button>
                    )}
                    {module.accessType === 'sequential' && !isCompleted && onMarkComplete && (
                            <button type="button" title="Mark as completed for this class" className={`${iconActionClass} text-green-700`} onClick={onMarkComplete} aria-label="Mark complete">
                                <IconCheck size={14} />
                            </button>
                    )}
                    {onOpenSettings && (
                            <button type="button" title="Configure Practice Settings for Module" className={`${iconActionClass} text-cyan-700`} onClick={onOpenSettings} aria-label="Practice Settings">
                                <IconSettings size={14} />
                            </button>
                    )}
                    <button type="button" className={`${iconActionClass} text-blue-700`} onClick={onEdit} aria-label="Edit module">
                        <IconEdit size={14} />
                    </button>
                    <button type="button" className={`${iconActionClass} text-red-700`} onClick={onDelete} aria-label="Delete module">
                        <IconTrash size={14} />
                    </button>
                </div>
            </div>

            {isOpen && <div>
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
                        <div className="mt-2 flex flex-col gap-1.5 sm:pl-6">
                            {materials.length === 0 && (
                                <p className="text-sm italic text-slate-500">No materials in this module</p>
                            )}
                            {materials.map(mat => (
                                <SortableMaterialItem
                                    key={mat.id}
                                    material={mat}
                                    onSync={onSyncMaterial}
                                    onRemove={onRemoveMaterial}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>}
        </div>
    );
};
