/**
 * THCSTemplatePicker — Phase 3, Task 7.4
 *
 * Modal for browsing and selecting a test template.
 * Shows "My Templates" and "Public Templates" tabs.
 */

import { useState, useEffect, useRef } from 'react';
import { IconBook, IconWorld } from '@tabler/icons-react';
import { Button } from '../modern';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useAuth } from '../../hooks/useAuth';
import { getMyTemplates, getPublicTemplates } from '../../services/thcsTemplateService';
import type { THCSTestTemplate } from '../../services/thcsTemplateService';
import './THCSNestedDialog.css';

interface THCSTemplatePickerProps {
    opened: boolean;
    onClose: () => void;
    onSelect: (template: THCSTestTemplate) => void;
}

export function THCSTemplatePicker({ opened, onClose, onSelect }: THCSTemplatePickerProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'mine' | 'public'>('mine');
    const [myTemplates, setMyTemplates] = useState<THCSTestTemplate[]>([]);
    const [publicTemplates, setPublicTemplates] = useState<THCSTestTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (opened && !dialog.open) dialog.showModal();
        if (!opened && dialog.open) dialog.close();
    }, [opened]);

    useEffect(() => {
        if (!opened || !user?.uid) return;

        const load = async () => {
            setLoading(true);
            try {
                const [mine, pub] = await Promise.all([
                    getMyTemplates(user.uid),
                    getPublicTemplates(),
                ]);
                setMyTemplates(mine);
                // Exclude own templates from public list
                setPublicTemplates(pub.filter(t => t.ownerId !== user.uid));
            } catch (err) {
                console.error('[THCSTemplatePicker] Load error:', err);
            } finally {
                setLoading(false);
            }
        };

        load();
        setSelectedId(null);
    }, [opened, user?.uid]);

    const currentList = activeTab === 'mine' ? myTemplates : publicTemplates;
    const selectedTemplate = [...myTemplates, ...publicTemplates].find(t => t.id === selectedId);

    const handleCreate = () => {
        if (selectedTemplate) {
            trackAction('selectTemplate', { source: activeTab });
            onSelect(selectedTemplate);
            onClose();
        }
    };

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            aria-label="Create from Template"
            className="thcs-nested-dialog thcs-nested-dialog--large"
        >
            <h2 className="thcs-nested-dialog__title">Create from Template</h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>
                    Templates provide pre-built structures — section names, question counts, and point distribution.
                    You'll fill in the question content after creation.
                </p>

                <div role="tablist" aria-label="Template source" style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                    <button type="button" role="tab" aria-selected={activeTab === 'mine'} onClick={() => { setActiveTab('mine'); trackAction('viewTemplateSource', { source: 'mine' }); }} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem', border: 0, borderBottom: activeTab === 'mine' ? '2px solid #7c3aed' : '2px solid transparent', background: 'transparent', color: activeTab === 'mine' ? '#6d28d9' : '#64748b', cursor: 'pointer' }}>
                        <IconBook size={14} /> My Templates ({myTemplates.length})
                    </button>
                    <button type="button" role="tab" aria-selected={activeTab === 'public'} onClick={() => { setActiveTab('public'); trackAction('viewTemplateSource', { source: 'public' }); }} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem', border: 0, borderBottom: activeTab === 'public' ? '2px solid #7c3aed' : '2px solid transparent', background: 'transparent', color: activeTab === 'public' ? '#6d28d9' : '#64748b', cursor: 'pointer' }}>
                        <IconWorld size={14} /> Public ({publicTemplates.length})
                    </button>
                </div>

                {loading ? (
                    <p role="status" style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>Loading templates...</p>
                ) : currentList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#64748b', padding: '1rem' }}>
                        {activeTab === 'mine'
                            ? 'No templates yet. Save a test as template from the editor.'
                            : 'No public templates available.'}
                    </p>
                ) : (
                    <div role="group" aria-label="Templates" style={{ display: 'grid', gap: '0.5rem' }}>
                            {currentList.map(template => (
                                <label
                                    key={template.id}
                                    style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        padding: '0.75rem',
                                        border: '1px solid',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer',
                                        borderColor: selectedId === template.id ? '#7c3aed' : '#e2e8f0',
                                        background: selectedId === template.id ? 'rgba(139, 92, 246, 0.04)' : '#fff',
                                    }}
                                >
                                    <input type="radio" name="thcs-template" value={template.id} checked={selectedId === template.id} onChange={() => setSelectedId(template.id)} />
                                        <span style={{ display: 'grid', gap: '0.125rem', flex: 1 }}>
                                            <strong style={{ fontSize: '0.875rem' }}>{template.name}</strong>
                                            {template.description && (
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.description}</span>
                                            )}
                                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem', color: '#64748b', fontSize: '0.75rem' }}>
                                                <span>Grade {template.gradeLevel}</span>
                                                <span>{template.sections.length} sections</span>
                                                <span>{template.sections.reduce((s, sec) => s + sec.questionCount, 0)} Qs</span>
                                                <span>{template.totalDuration} min</span>
                                            </span>
                                        </span>
                                </label>
                            ))}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <Button variant="glass" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={!selectedTemplate}
                        onClick={handleCreate}
                    >
                        Create Test →
                    </Button>
                </div>
            </div>
        </dialog>
    );
}

export default THCSTemplatePicker;
