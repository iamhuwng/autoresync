import React, { useState } from 'react';
import { THCSTemplatePicker } from './THCSTemplatePicker';
import type { THCSTestMetadata } from '../../types/thcs-test.types';
import { DURATION_PRESETS, GRADE_LEVELS, EXAM_TYPE_OPTIONS } from '../../types/thcs-test.types';
import './THCSSetupStep.css';

export interface THCSSetupStepProps {
    metadata: THCSTestMetadata;
    isPublic: boolean;
    isEditMode: boolean;
    onMetadataChange: <K extends keyof THCSTestMetadata>(field: K, value: THCSTestMetadata[K]) => void;
    onIsPublicChange: (value: boolean) => void;
    onTemplateSelect?: (template: any) => void;
    onDocumentParsed?: (parsed: any) => void;
    onParsedProceed?: (finalParsed: any) => void;
    onStartBlank?: () => void;
    onStartPasteText?: () => void;
    onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const THCSSetupStep: React.FC<THCSSetupStepProps> = ({ metadata, isPublic, isEditMode,
    onMetadataChange, onIsPublicChange, onTemplateSelect, onStartBlank, onStartPasteText, onAction }) => {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !metadata.tags?.includes(tag)) onMetadataChange('tags', [...(metadata.tags || []), tag]);
        setTagInput('');
    };

    return <div className="thcs-setup">
        <div className="thcs-setup-fields">
            <label className="thcs-setup-field">Test Title
                <input type="text" placeholder="Đề kiểm tra giữa kì 1 — Tiếng Anh 9" maxLength={200}
                    value={metadata.title} onChange={e => onMetadataChange('title', e.target.value)} />
            </label>
            <div className="thcs-setup-grid">
                <label className="thcs-setup-field">Grade Level
                    <select value={metadata.gradeLevel?.toString() || ''}
                        onChange={e => onMetadataChange('gradeLevel', Number(e.target.value) as THCSTestMetadata['gradeLevel'])}>
                        <option value="" disabled>Select grade</option>
                        {GRADE_LEVELS.map(grade => <option key={grade} value={grade}>Grade {grade}</option>)}
                    </select>
                </label>
                <label className="thcs-setup-field">Exam Type
                    <select value={metadata.examType || ''} onChange={e => onMetadataChange('examType', e.target.value)}>
                        <option value="" disabled>Select exam type</option>
                        {EXAM_TYPE_OPTIONS.map(exam => <option key={exam} value={exam}>{exam}</option>)}
                    </select>
                </label>
            </div>
            <div className="thcs-setup-divider" />
            <fieldset className="thcs-setup-duration">
                <legend>Duration</legend>
                <div className="thcs-setup-duration-row">
                    {DURATION_PRESETS.map(duration => <button type="button" key={duration}
                        aria-pressed={metadata.duration === duration} onClick={() => onMetadataChange('duration', duration)}>
                        {duration}m
                    </button>)}
                    <label className="thcs-setup-custom">Custom
                        <input type="number" min={5} max={300} step={5} aria-label="Custom duration in minutes"
                            value={!DURATION_PRESETS.includes(metadata.duration as any) ? metadata.duration : ''}
                            onChange={e => { const value = Number(e.target.value); if (value > 0) onMetadataChange('duration', value); }} />
                        <span>min</span>
                    </label>
                </div>
            </fieldset>
            <button type="button" className="thcs-setup-disclosure" aria-expanded={advancedOpen} aria-controls="thcs-setup-advanced"
                onClick={() => { onAction?.('thcsSetupAdvancedToggled', { expanded: !advancedOpen }); setAdvancedOpen(!advancedOpen); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined }}>
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>Advanced Settings
            </button>
            <div id="thcs-setup-advanced" hidden={!advancedOpen}>
                <div className="thcs-setup-advanced-fields">
                    <label className="thcs-setup-field">Timer Mode
                        <select value={metadata.timerMode || 'strict'}
                            onChange={e => onMetadataChange('timerMode', e.target.value as THCSTestMetadata['timerMode'])}>
                            <option value="strict">Strict — auto-submit at 0:00</option>
                            <option value="informational">Informational — timer shown, no auto-submit</option>
                            <option value="none">None — no timer displayed</option>
                        </select>
                    </label>
                    <div className="thcs-setup-grid">
                        <label className="thcs-setup-field">Subject Variant<input placeholder="e.g., Global Success" value={metadata.subjectVariant || ''}
                            onChange={e => onMetadataChange('subjectVariant', e.target.value || undefined)} /></label>
                        <label className="thcs-setup-field">Province<input placeholder="e.g., Hà Nội" value={metadata.province || ''}
                            onChange={e => onMetadataChange('province', e.target.value || undefined)} /></label>
                    </div>
                    <label className="thcs-setup-field">School<input placeholder="e.g., THCS Nguyễn Du" value={metadata.school || ''}
                        onChange={e => onMetadataChange('school', e.target.value || undefined)} /></label>
                    <label className="thcs-setup-field">Description<textarea placeholder="Optional description" rows={2} value={metadata.description || ''}
                        onChange={e => onMetadataChange('description', e.target.value || undefined)} /></label>
                    <label className="thcs-setup-field">Tags<input placeholder="Press Enter to add" value={tagInput}
                        onChange={e => setTagInput(e.target.value)} onBlur={addTag}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} /></label>
                    {!!metadata.tags?.length && <div className="thcs-setup-tags">{metadata.tags.map(tag => <button type="button" key={tag}
                        aria-label={`Remove tag ${tag}`} onClick={() => onMetadataChange('tags', metadata.tags?.filter(value => value !== tag))}>{tag} ×</button>)}</div>}
                    <label className="thcs-setup-public"><input type="checkbox" checked={isPublic} onChange={e => onIsPublicChange(e.target.checked)} />
                        <span>Share in Public Library<small>Allow other teachers to use this test</small></span>
                    </label>
                </div>
            </div>
        </div>
        {!isEditMode && <section className="thcs-setup-start" aria-label="Start from">
            <h3>Start from</h3>
            <div className="thcs-setup-start-grid">
                <button type="button" className="thcs-setup-start-card" onClick={() => { onAction?.('thcsSetupTemplateOpened'); setShowTemplatePicker(true); }}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    <strong>Template</strong><span>Reuse a saved test structure.</span>
                </button>
                <button type="button" className="thcs-setup-start-card" onClick={onStartPasteText}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <strong>Paste Test</strong><span>Paste extracted content and open it in Studio.</span>
                </button>
                <button type="button" className="thcs-setup-start-card" onClick={onStartBlank}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    <strong>Start Blank</strong><span>Go straight to the full question builder.</span>
                </button>

            </div>
        </section>}
        <THCSTemplatePicker opened={showTemplatePicker} onClose={() => { onAction?.('thcsSetupTemplateClosed'); setShowTemplatePicker(false); }}
            onSelect={template => { setShowTemplatePicker(false); onTemplateSelect?.(template); }} />
    </div>;
};

export default THCSSetupStep;
