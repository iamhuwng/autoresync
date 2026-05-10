/**
 * THCSReviewStep — Step 4 of the THCS Test Editor Wizard.
 * 
 * Mockup-faithful layout:
 *   Left column:  Test Summary card (title bold + metadata inline + sections list)
 *                  Validation checklist card (green ✓ items)
 *   Right column: Preview card (mini thumbnail + "Open Full Preview")
 *                  Publish Settings card (Public toggle + Save as Template checkbox)
 *                  Actions card (Publish, Save as Draft, Duplicate)
 */
import React, { useState } from 'react';
import { Modal, Button as MButton, Checkbox } from '@mantine/core';
import { Button } from '../modern';
import { THCSPreviewOverlay } from './THCSPreviewOverlay';
import { THCSVersionDropdown } from './THCSVersionDropdown';
import { THCSSaveTemplateModal } from './THCSSaveTemplateModal';
import type { THCSTestMetadata, THCSSection, THCSTest } from '../../types/thcs-test.types';
import type { ParsedMetadataConflict } from '../../pages/THCSTestEditorPage';

export interface THCSReviewStepProps {
    metadata: THCSTestMetadata;
    sections: THCSSection[];
    isPublic: boolean;
    errors: string[];
    warnings: string[];
    isValid: boolean;
    isPublishing: boolean;
    publishedTestId: string | null;
    draftId: string | null;
    userId: string;
    showPublishWarnings: boolean;
    onPublish: () => void;
    onSaveDraft: () => void;
    onDuplicate: () => void;
    onSetShowPublishWarnings: (val: boolean) => void;
    onIsPublicChange: (value: boolean) => void;
    parsedMetadataConflicts?: ParsedMetadataConflict[];
    onApplyParsedMetadata?: () => void;
    onDismissParsedMetadataConflicts?: () => void;
}

const THCSReviewStep: React.FC<THCSReviewStepProps> = ({
    metadata,
    sections,
    isPublic,
    errors,
    warnings,
    isValid,
    isPublishing,
    publishedTestId,
    draftId,
    userId,
    showPublishWarnings,
    onPublish,
    onSaveDraft,
    onDuplicate,
    onSetShowPublishWarnings,
    onIsPublicChange,
    parsedMetadataConflicts = [],
    onApplyParsedMetadata,
    onDismissParsedMetadataConflicts,
}) => {
    const [showPreview, setShowPreview] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [saveAsTemplate, setSaveAsTemplate] = useState(false);

    const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
    const totalPoints = sections.reduce((sum, s) => sum + s.totalPoints, 0);

    const testObj: THCSTest = {
        id: publishedTestId || draftId || '',
        testType: 'THCS-THPT',
        createdBy: userId,
        ownerId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata,
        sections,
        totalPoints,
        questionCount: totalQuestions,
        isPublic,
        isComplete: true,
    } as THCSTest;

    // Validation checklist items
    const allAnswered = sections.every(s =>
        s.questions.every(q => {
            const t = q.type;
            if (t === 'verb-form' || t === 'word-form') return (q.blankAnswers?.length || 0) > 0;
            if (t === 'sentence-rewrite' || t === 'sentence-rewrite-keyword') return (q.modelAnswers?.length || 0) > 0;
            if (t === 'reading-cloze-wordbank') return Object.keys(q.blankMapping || {}).length > 0;
            return !!q.correctAnswer;
        })
    );
    const pointsConfigured = totalPoints > 0;
    const titleSet = !!metadata.title?.trim();
    const durationSet = metadata.duration > 0;

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: '1rem',
        border: '1px solid rgba(139,92,246,0.1)',
        padding: '1.25rem',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Two-column layout matching mockup */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>
                {/* ═══ LEFT COLUMN ═══ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Test Summary Card */}
                    <div style={cardStyle}>
                        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                            Test Summary
                        </h3>

                        {/* Title as bold headline */}
                        <h2 style={{
                            margin: '0 0 0.5rem',
                            fontSize: '1.375rem',
                            fontWeight: 800,
                            color: '#1e293b',
                        }}>
                            {metadata.title || '(untitled)'}
                        </h2>

                        {/* Metadata inline with separators */}
                        <p style={{
                            margin: '0 0 0.75rem',
                            fontSize: '0.8125rem',
                            color: '#64748b',
                            display: 'flex',
                            gap: '0.375rem',
                            flexWrap: 'wrap',
                        }}>
                            <span><strong>Grade:</strong> {metadata.gradeLevel}</span>
                            <span>│</span>
                            <span><strong>Duration:</strong> {metadata.duration} minutes</span>
                            <span>│</span>
                            <span><strong>Type:</strong> {metadata.examType || '—'}</span>
                        </p>

                        {/* Totals */}
                        <p style={{
                            margin: '0 0 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            color: '#1e293b',
                        }}>
                            Total Questions: {totalQuestions} │ Total Points: {totalPoints}
                        </p>

                        {/* Section list */}
                        <div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b' }}>Sections</span>
                            <p style={{
                                margin: '0.125rem 0 0',
                                fontSize: '0.8125rem',
                                color: '#64748b',
                            }}>
                                {sections.map((s, i) =>
                                    `${s.name || `Part ${i + 1}`} (${s.questions.length}Q, ${s.totalPoints}pts)`
                                ).join(', ')}
                            </p>
                        </div>
                    </div>

                    {/* Validation Card — green checkmarks like mockup */}
                    <div style={cardStyle}>
                        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                            Validation
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            <CheckItem label="All questions have answers" ok={allAnswered} />
                            <CheckItem label="Total points configured" ok={pointsConfigured} />
                            <CheckItem label="Test title set" ok={titleSet} />
                            <CheckItem label="Duration configured" ok={durationSet} />

                            {/* Extra errors from validation hook */}
                            {errors.filter(e =>
                                !e.toLowerCase().includes('answer') &&
                                !e.toLowerCase().includes('points') &&
                                !e.toLowerCase().includes('title') &&
                                !e.toLowerCase().includes('duration')
                            ).map((err, i) => (
                                <CheckItem key={i} label={err} ok={false} />
                            ))}
                        </div>

                        {/* Ready badge */}
                        <div style={{
                            marginTop: '0.75rem',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.5rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            background: isValid ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            color: isValid ? '#059669' : '#dc2626',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                        }}>
                            {isValid ? '✅ Ready to publish' : '⚠️ Fix issues before publishing'}
                        </div>
                    </div>

                    {parsedMetadataConflicts.length > 0 && (
                        <div style={{
                            ...cardStyle,
                            borderColor: 'rgba(59,130,246,0.2)',
                            background: 'rgba(239,246,255,0.9)',
                        }}>
                            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#1d4ed8' }}>
                                Review Parsed Metadata
                            </h3>
                            <p style={{
                                margin: '0 0 0.75rem',
                                fontSize: '0.8125rem',
                                lineHeight: 1.5,
                                color: '#334155',
                            }}>
                                The imported document suggests different test information. Your step-1 setup is still active. Choose whether to keep it or apply the parsed values before publishing.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
                                {parsedMetadataConflicts.map((conflict) => (
                                    <div
                                        key={conflict.field}
                                        style={{
                                            padding: '0.625rem 0.75rem',
                                            borderRadius: '0.625rem',
                                            background: '#fff',
                                            border: '1px solid rgba(59,130,246,0.14)',
                                        }}
                                    >
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
                                            {conflict.label}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.45 }}>
                                            Current setup: <strong>{conflict.currentValue}</strong>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.45 }}>
                                            Parsed document: <strong>{conflict.parsedValue}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <Button variant="glass" onClick={onDismissParsedMetadataConflicts}>
                                    Keep Current Setup
                                </Button>
                                <Button variant="primary" onClick={onApplyParsedMetadata}>
                                    Apply Parsed Values
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Warnings if any */}
                    {warnings.length > 0 && (
                        <div style={{
                            ...cardStyle,
                            borderColor: 'rgba(245,158,11,0.2)',
                        }}>
                            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>
                                ⚠️ Warnings
                            </h3>
                            {warnings.map((w, i) => (
                                <div key={i} style={{
                                    padding: '0.25rem 0',
                                    fontSize: '0.8125rem',
                                    color: '#92400e',
                                }}>• {w}</div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══ RIGHT COLUMN ═══ */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'sticky',
                    top: '1rem',
                }}>
                    {/* Preview Card */}
                    <div style={cardStyle}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b' }}>
                            Preview
                        </h4>

                        {/* Mini preview thumbnail placeholder */}
                        <div style={{
                            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            marginBottom: '0.75rem',
                            textAlign: 'center',
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            minHeight: '80px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.25rem',
                        }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#64748b' }}>
                                {metadata.title || 'Untitled Test'}
                            </span>
                            <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>
                                {totalQuestions}Q · {totalPoints}pts · {metadata.duration}min
                            </span>
                        </div>

                        <button
                            onClick={() => setShowPreview(true)}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid rgba(139,92,246,0.2)',
                                borderRadius: '0.5rem',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: '#8b5cf6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                            }}
                        >
                            👁️ Open Full Preview
                        </button>
                    </div>

                    {/* Publish Settings Card */}
                    <div style={cardStyle}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b' }}>
                            Publish Settings
                        </h4>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#1e293b' }}>
                                Share in Public Library
                            </span>
                            <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => onIsPublicChange(e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                    position: 'absolute', inset: 0,
                                    background: isPublic ? '#8b5cf6' : '#cbd5e1',
                                    borderRadius: 10,
                                    transition: 'background 0.2s',
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        top: 2, left: isPublic ? 18 : 2,
                                        width: 16, height: 16,
                                        background: '#fff',
                                        borderRadius: '50%',
                                        transition: 'left 0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    }} />
                                </span>
                            </label>
                        </div>

                        <Checkbox
                            label="Save as Template"
                            checked={saveAsTemplate}
                            onChange={(e) => setSaveAsTemplate(e.currentTarget.checked)}
                            size="sm"
                            color="violet"
                        />
                    </div>

                    {/* Version Dropdown (for re-publish) */}
                    {publishedTestId && (
                        <div style={cardStyle}>
                            <THCSVersionDropdown
                                testId={publishedTestId}
                                currentData={testObj}
                            />
                        </div>
                    )}

                    {/* Actions Card */}
                    <div style={cardStyle}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b' }}>
                            Actions
                        </h4>

                        <Button
                            variant="primary"
                            onClick={() => {
                                if (saveAsTemplate) setShowTemplateModal(true);
                                onPublish();
                            }}
                            disabled={!isValid || isPublishing}
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                        >
                            {isPublishing ? '⏳ Publishing...' : '🚀 Publish Test'}
                        </Button>

                        <button
                            onClick={onSaveDraft}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #e2e8f0',
                                borderRadius: '0.5rem',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: '#64748b',
                                marginBottom: '0.375rem',
                            }}
                        >
                            💾 Save as Draft
                        </button>

                        {draftId && (
                            <button
                                onClick={onDuplicate}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '0.5rem',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.8125rem',
                                    fontWeight: 600,
                                    color: '#64748b',
                                }}
                            >
                                📋 Duplicate
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Publish Warnings Dialog */}
            <Modal
                opened={showPublishWarnings}
                onClose={() => onSetShowPublishWarnings(false)}
                title="Publish with Warnings?"
                centered
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {warnings.map((w, i) => (
                        <div key={i} style={{
                            padding: '0.375rem 0.75rem',
                            background: 'rgba(245,158,11,0.08)',
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            color: '#92400e',
                        }}>
                            ⚠️ {w}
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <MButton variant="subtle" onClick={() => onSetShowPublishWarnings(false)}>Cancel</MButton>
                    <MButton color="violet" onClick={onPublish}>Proceed Anyway</MButton>
                </div>
            </Modal>

            {/* Preview Overlay */}
            {showPreview && (
                <THCSPreviewOverlay
                    sections={sections}
                    metadata={metadata}
                    onClose={() => setShowPreview(false)}
                />
            )}

            {/* Save as Template Modal */}
            <THCSSaveTemplateModal
                opened={showTemplateModal}
                onClose={() => setShowTemplateModal(false)}
                test={testObj}
            />
        </div>
    );
};

/* ── Validation checklist item (green ✓ / red ✗) ── */
const CheckItem: React.FC<{ label: string; ok: boolean }> = ({ label, ok }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.8125rem',
        color: ok ? '#1e293b' : '#dc2626',
    }}>
        <span style={{
            color: ok ? '#10b981' : '#ef4444',
            fontSize: '0.875rem',
        }}>
            {ok ? '✅' : '❌'}
        </span>
        {label} {ok && <span style={{ color: '#10b981' }}>✓</span>}
    </div>
);

export default THCSReviewStep;
