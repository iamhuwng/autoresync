import React, { useState } from 'react';
import { Button, Card } from '../../modern';
import { IconFileText, IconVolume, IconPhoto, IconTrash, IconGripVertical } from '@tabler/icons-react';
import type { ContextResource, ResourceType } from '../../../services/testStorage';
// @ts-ignore
import PassageEditorPanel from '../../PassageEditorPanel';
import { AudioResourceEditor } from './AudioResourceEditor';
import { ImageResourceEditor } from './ImageResourceEditor';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../../config/featureRegistry';

interface ResourceManagerProps {
    resources: ContextResource[];
    onUpdateResources: (resources: ContextResource[]) => void;
    skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
    totalQuestions: number;
    readOnly?: boolean;
    audioPreviewUrls?: Record<string, string>;
    uploadAudio?: (file: File, onProgress: (percent: number) => void) => Promise<Partial<ContextResource>>;
}

export const ResourceManager: React.FC<ResourceManagerProps> = ({
    resources,
    onUpdateResources,
    skill,
    totalQuestions,
    readOnly = false,
    audioPreviewUrls,
    uploadAudio,
}) => {
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
        resources.length > 0 ? resources[0]?.id || null : null
    );

    const handleAddResource = (type: ResourceType) => {
        if (readOnly || (type === 'text' && skill === 'Listening')) return;
        trackAction('editTest', { source: 'resource_manager', field: 'addResource', resourceType: type });
        const newResource: ContextResource = {
            id: `resource_${Date.now()}`,
            type,
            title: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Resource`,
            content: '',
            questionStart: 1,
            questionEnd: totalQuestions
        };

        if (type === 'audio') {
            newResource.audioUrl = '';
        } else if (type === 'image') {
            newResource.images = [];
        }

        const updated = [...resources, newResource];
        onUpdateResources(updated);
        setSelectedResourceId(newResource.id);
    };

    const handleUpdateResource = (id: string, updates: Partial<ContextResource>) => {
        if (readOnly) return;
        // Validate question range if being updated
        if (updates.questionStart !== undefined || updates.questionEnd !== undefined) {
            const currentResource = resources.find(r => r.id === id);
            if (currentResource) {
                const newStart = updates.questionStart ?? currentResource.questionStart ?? 1;
                const newEnd = updates.questionEnd ?? currentResource.questionEnd ?? totalQuestions;

                // Ensure start <= end
                if (newStart > newEnd) {
                    console.warn('Invalid range: start > end');
                    return;
                }

                // Check for overlapping ranges with other resources (warning only, allow it)
                const otherResources = resources.filter(r => r.id !== id);
                const hasOverlap = otherResources.some(r => {
                    const rStart = r.questionStart ?? 1;
                    const rEnd = r.questionEnd ?? totalQuestions;
                    return !(newEnd < rStart || newStart > rEnd);
                });

                if (hasOverlap) {
                    console.warn('Warning: Question range overlaps with another resource');
                }
            }
        }

        const updated = resources.map(r =>
            r.id === id ? { ...r, ...updates } : r
        );
        onUpdateResources(updated);
    };

    const handleDeleteResource = (id: string) => {
        if (readOnly) return;
        if (window.confirm('Delete this resource? associated questions will lose their context.')) {
            trackAction('editTest', { source: 'resource_manager', field: 'deleteResource', resourceId: id });
            const updated = resources.filter(r => r.id !== id);
            onUpdateResources(updated);
            if (selectedResourceId === id) {
                const first = updated[0];
                setSelectedResourceId(first ? first.id : null);
            }
        }
    };

    const selectedResource = resources.find(r => r.id === selectedResourceId);

    return (
        <div style={{ display: 'flex', height: '100%', gap: '1rem' }}>
            {/* Resource List Sidebar */}
            <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Card variant="glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#64748b', margin: '0 0 8px' }}>RESOURCES</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {skill !== 'Listening' && <Button
                                size="xs"
                                variant="glass"
                                onClick={() => !readOnly && handleAddResource('text')}
                                disabled={readOnly}
                                style={{ flex: 1, opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                            >
                                + Text
                            </Button>}
                            {(skill === 'Listening' || skill === 'Speaking') && (
                                <Button
                                    size="xs"
                                    variant="glass"
                                    onClick={() => handleAddResource('audio')}
                                    disabled={readOnly}
                                    style={{ flex: 1, opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                                >
                                    + Audio
                                </Button>
                            )}
                            {(skill === 'Listening' || skill === 'Speaking') && (
                                <Button
                                    size="xs"
                                    variant="glass"
                                    onClick={() => !readOnly && handleAddResource('image')}
                                    disabled={readOnly}
                                    style={{ flex: 1, opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                                >
                                    + Image
                                </Button>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto' }}>
                            {resources.map((resource) => {
                                const isSelected = resource.id === selectedResourceId;
                                const resourceReadOnly = readOnly;
                                return (
                                    <div
                                        key={resource.id}
                                        onClick={() => setSelectedResourceId(resource.id)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderBottom: '1px solid rgba(0,0,0,0.05)',
                                            background: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem'
                                        }}
                                    >
                                        <div style={{ color: '#64748b' }}><IconGripVertical size={14} /></div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                {resource.type === 'text' && <IconFileText size={14} color="#8b5cf6" />}
                                                {resource.type === 'audio' && <IconVolume size={14} color="#06b6d4" />}
                                                {resource.type === 'image' && <IconPhoto size={14} color="#10b981" />}
                                                <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
                                            </div>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>Qs {resource.questionStart}-{resource.questionEnd}</span>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={`Delete ${resource.title}`}
                                            disabled={resourceReadOnly}
                                            style={{
                                                border: 0, background: 'transparent', padding: 4,
                                                opacity: resourceReadOnly ? 0.3 : 1,
                                                cursor: resourceReadOnly ? 'not-allowed' : 'pointer'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (resourceReadOnly) return;
                                                handleDeleteResource(resource.id);
                                            }}
                                        >
                                            <IconTrash size={14} color={resourceReadOnly ? 'gray' : '#ef4444'} />
                                        </button>
                                    </div>
                                );
                            })}
                    </div>
                </Card>
            </div>

            {/* Main Editor Area */}
            <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                {selectedResource ? (
                    <Card variant="glass" style={{ height: '100%', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {selectedResource.type === 'text' ? (
                            // Adapt ContextResource to Passage for the existing editor
                            <PassageEditorPanel
                                passage={{
                                    ...selectedResource,
                                    // Ensure backward compat fields if needed by panel
                                    imageUrl: (selectedResource as any).imageUrl || '',
                                }}
                                passageIndex={resources.indexOf(selectedResource)}
                                totalPassages={resources.length}
                                quizQuestionsLength={totalQuestions}
                                onUpdate={(updatedPassage: ContextResource) => {
                                    // Map back
                                    handleUpdateResource(selectedResource.id, updatedPassage);
                                }}
                                onClose={() => setSelectedResourceId(null)}
                                // Dummy prev/next implementation for now or can wire properly
                                onPrevious={() => {
                                    const idx = resources.indexOf(selectedResource);
                                    if (idx > 0) {
                                        const prev = resources[idx - 1];
                                        if (prev) setSelectedResourceId(prev.id);
                                    }
                                }}
                                onNext={() => {
                                    const idx = resources.indexOf(selectedResource);
                                    if (idx < resources.length - 1) {
                                        const next = resources[idx + 1];
                                        if (next) setSelectedResourceId(next.id);
                                    }
                                }}
                                isFirst={resources.indexOf(selectedResource) === 0}
                                isLast={resources.indexOf(selectedResource) === resources.length - 1}
                                readOnly={readOnly}
                            />
                        ) : selectedResource.type === 'audio' ? (
                            <AudioResourceEditor
                                resource={selectedResource}
                                previewUrl={selectedResource.assetId ? audioPreviewUrls?.[selectedResource.assetId] : undefined}
                                uploadAudio={uploadAudio}
                                onUpdate={(updated) => handleUpdateResource(selectedResource.id, updated)}
                                totalQuestions={totalQuestions}
                                readOnly={readOnly}
                            />
                        ) : (
                            <ImageResourceEditor
                                resource={selectedResource}
                                onUpdate={(updated: ContextResource) => handleUpdateResource(selectedResource.id, updated)}
                                totalQuestions={totalQuestions}
                                readOnly={readOnly}
                            />
                        )}
                    </Card>
                ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                        <p style={{ fontSize: 18 }}>Select a resource to edit context</p>
                    </div>
                )}
            </div>
        </div>
    );
};
