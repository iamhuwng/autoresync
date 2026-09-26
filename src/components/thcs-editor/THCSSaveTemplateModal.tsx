/**
 * THCSSaveTemplateModal — Phase 3, Task 7.3
 *
 * Modal for saving the current test as a template.
 * Extracted from THCSTestEditorPage to keep the large editor file manageable.
 */

import { useEffect, useRef, useState } from 'react';
import { Button, toast } from '../modern';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { saveTestAsTemplate } from '../../services/thcsTemplateService';
import type { THCSTest } from '../../types/thcs-test.types';
import './THCSNestedDialog.css';

interface THCSSaveTemplateModalProps {
    opened: boolean;
    onClose: () => void;
    test: THCSTest;
}

export function THCSSaveTemplateModal({ opened, onClose, test }: THCSSaveTemplateModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [saving, setSaving] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (opened && !dialog.open) dialog.showModal();
        if (!opened && dialog.open) dialog.close();
    }, [opened]);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Template name is required.');
            return;
        }

        trackAction('saveTemplate');
        setSaving(true);
        try {
            const result = await saveTestAsTemplate(test, name.trim(), description.trim(), isPublic);
            toast.success(`Saved template "${name.trim()}" (ID: ${result.templateId.slice(0, 8)}…).`);
            // Reset form and close
            setName('');
            setDescription('');
            setIsPublic(false);
            onClose();
        } catch (err) {
            console.error('[THCSSaveTemplateModal] Save failed:', err);
            toast.error('Could not save template. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const sectionSummary = (test.sections || []).map(
        s => `${s.name} (${s.questions.length}Q, ${s.totalPoints}pts)`
    ).join(' · ');

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            aria-label="Save as Template"
            className="thcs-nested-dialog"
        >
            <h2 className="thcs-nested-dialog__title">Save as Template</h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>
                    Templates save the structure only — section names, point distribution, and question types.
                    Question content is NOT included.
                </p>

                {/* Preview */}
                <div style={{
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(139, 92, 246, 0.06)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(139, 92, 246, 0.15)',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                }}>
                    <p style={{ margin: '0 0 0.125rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        Structure: {(test.sections || []).length} section(s) · Grade {test.metadata?.gradeLevel || '?'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {sectionSummary || 'No sections'}
                    </p>
                </div>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Template Name
                    <input
                        placeholder="e.g. Đề Giữa Kì Lớp 9 – 4 kỹ năng"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        required
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                    />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Description
                    <textarea
                        placeholder="Describe the template structure..."
                        value={description}
                        onChange={(e) => setDescription(e.currentTarget.value)}
                        rows={3}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', resize: 'vertical' }}
                    />
                </label>

                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
                    <span>Share with other teachers (public)
                        <small style={{ display: 'block', color: '#64748b' }}>Public templates are visible to all teachers in the template picker.</small>
                    </span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <Button variant="glass" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} loading={saving}>
                        {saving ? 'Saving...' : 'Save Template'}
                    </Button>
                </div>
            </div>
        </dialog>
    );
}

export default THCSSaveTemplateModal;
