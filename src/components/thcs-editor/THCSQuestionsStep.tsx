/**
 * THCSQuestionsStep — Step 2 of the THCS Test Editor Wizard.
 * 
 * Renders a section sidebar navigator + main content area for editing
 * sections and questions. Reuses THCSSectionBlock, THCSDndSectionsContainer.
 */
import React, { useState } from 'react';
import { Alert } from '@mantine/core';
import THCSSectionBlock from './THCSSectionBlock';
import { THCSDndSectionsContainer } from './THCSDndSectionsContainer';
import type { THCSSection, THCSTestMetadata } from '../../types/thcs-test.types';
import { generateDiagnosticLog } from '../../services/test-creation/thcs-diagnostic-log';
import type { ParseDebugData } from '../../services/test-creation/thcs-diagnostic-log';

export interface THCSQuestionsStepProps {
    sections: THCSSection[];
    draftId: string | null;
    metadata: THCSTestMetadata;
    onSectionUpdate: (index: number, section: THCSSection) => void;
    onSectionDelete: (index: number) => void;
    onSectionMove: (index: number, direction: -1 | 1) => void;
    onAddSection: () => void;
    onReorder: (newSections: THCSSection[]) => void;
}

const THCSQuestionsStep: React.FC<THCSQuestionsStepProps> = ({
    sections,
    draftId,
    metadata,
    onSectionUpdate,
    onSectionDelete,
    onSectionMove,
    onAddSection,
    onReorder,
}) => {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        sections.length > 0 ? sections[0]!.id : null
    );
    const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
    const [logCopied, setLogCopied] = useState(false);

    const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
    const answeredCount = sections.reduce((sum, s) =>
        sum + s.questions.filter(q => q.correctAnswer || q.modelAnswers?.length || q.blankAnswers?.length).length
        , 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Heading matches mockup format */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{
                        margin: 0,
                        fontSize: '1.125rem',
                        fontWeight: 700,
                        color: '#1e293b',
                    }}>
                        Step 2 of 4: <strong>Questions</strong>
                    </h2>
                    <p style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8125rem',
                        color: '#64748b',
                    }}>
                        {sections.length} section{sections.length !== 1 ? 's' : ''} · {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} · {answeredCount} answered
                    </p>
                </div>
            </div>

            {/* Section sidebar + content layout */}
            <div style={{ display: 'flex', gap: '1rem' }}>
                {/* Section Navigator Sidebar */}
                <div style={{
                    width: '200px',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '1rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                    padding: '1rem',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    position: 'sticky',
                    top: '1rem',
                    alignSelf: 'flex-start',
                    maxHeight: 'calc(100vh - 200px)',
                    overflowY: 'auto',
                }}>
                    <div style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                    }}>
                        Sections
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {sections.map((section, idx) => {
                            const isActive = section.id === activeSectionId;
                            const qCount = section.questions.length;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => {
                                        setActiveSectionId(section.id);
                                        // Scroll to section
                                        const el = document.getElementById(`section-${section.id}`);
                                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem 0.75rem',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer',
                                        background: isActive ? 'rgba(139,92,246,0.1)' : 'transparent',
                                        transition: 'all 0.15s ease',
                                        textAlign: 'left',
                                        width: '100%',
                                    }}
                                >
                                    <div style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.625rem',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                        background: isActive ? '#8b5cf6' : '#e2e8f0',
                                        color: isActive ? '#fff' : '#64748b',
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <div style={{ overflow: 'hidden', flex: 1 }}>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            fontWeight: isActive ? 700 : 500,
                                            color: isActive ? '#8b5cf6' : '#1e293b',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}>
                                            {section.name || 'Untitled'}
                                        </div>
                                        <div style={{
                                            fontSize: '0.625rem',
                                            color: '#94a3b8',
                                        }}>
                                            {qCount} Q · {section.totalPoints}pts
                                        </div>
                                    </div>
                                </button>
                            );
                        })}

                        {/* Add Section button */}
                        <button
                            onClick={onAddSection}
                            style={{
                                padding: '0.5rem',
                                border: '1px dashed rgba(139,92,246,0.3)',
                                borderRadius: '0.5rem',
                                background: 'transparent',
                                color: '#8b5cf6',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                marginTop: '0.5rem',
                            }}
                        >
                            + Add Section
                        </button>
                    </div>

                    {/* ── Diagnostics Accordion ── */}
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(139,92,246,0.1)', paddingTop: '0.5rem' }}>
                        <button
                            onClick={() => setDiagnosticsOpen(prev => !prev)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                width: '100%',
                                padding: '0.375rem 0.5rem',
                                border: 'none',
                                borderRadius: '0.375rem',
                                background: diagnosticsOpen ? 'rgba(245,158,11,0.08)' : 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                color: '#94a3b8',
                                textAlign: 'left',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{
                                display: 'inline-block',
                                transform: diagnosticsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s',
                                fontSize: '0.5rem',
                            }}>▶</span>
                            🔍 Diagnostics
                        </button>

                        {diagnosticsOpen && (
                            <div style={{ marginTop: '0.375rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                <button
                                    onClick={() => {
                                        const parseDebug = (window as any).__PARSE_DEBUG as ParseDebugData | undefined;
                                        const log = generateDiagnosticLog({ parseDebug: parseDebug || null, sections, metadata });
                                        navigator.clipboard.writeText(log).then(() => {
                                            setLogCopied(true);
                                            setTimeout(() => setLogCopied(false), 2000);
                                        });
                                    }}
                                    style={{
                                        padding: '0.375rem 0.5rem',
                                        border: '1px solid rgba(139,92,246,0.2)',
                                        borderRadius: '0.375rem',
                                        background: logCopied ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.06)',
                                        color: logCopied ? '#059669' : '#7c3aed',
                                        fontWeight: 600,
                                        fontSize: '0.6875rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        width: '100%',
                                        textAlign: 'center',
                                    }}
                                >
                                    {logCopied ? '✅ Copied!' : '📋 Copy Full Log'}
                                </button>
                                <pre style={{
                                    margin: 0,
                                    padding: '0.5rem',
                                    background: 'rgba(15,23,42,0.04)',
                                    borderRadius: '0.375rem',
                                    fontSize: '0.5625rem',
                                    lineHeight: 1.4,
                                    color: '#475569',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    border: '1px solid rgba(0,0,0,0.05)',
                                }}>
                                    {generateDiagnosticLog({
                                        parseDebug: (window as any).__PARSE_DEBUG as ParseDebugData | undefined || null,
                                        sections,
                                        metadata,
                                    })}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content — Sections */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {sections.length === 0 ? (
                        <Alert color="violet" variant="light">
                            No sections yet. Click "+ Add Section" in the sidebar to start.
                        </Alert>
                    ) : (
                        <THCSDndSectionsContainer
                            sections={sections}
                            onReorder={onReorder}
                            renderSection={(section, si) => {
                                const offset = sections.slice(0, si).reduce((sum, s) => sum + s.questions.length, 0);
                                return (
                                    <div id={`section-${section.id}`} key={section.id}>
                                        <THCSSectionBlock
                                            section={section}
                                            sectionIndex={si}
                                            totalSections={sections.length}
                                            globalQuestionOffset={offset}
                                            draftId={draftId}
                                            onUpdate={(s) => onSectionUpdate(si, s)}
                                            onDelete={() => onSectionDelete(si)}
                                            onMoveUp={() => onSectionMove(si, -1)}
                                            onMoveDown={() => onSectionMove(si, 1)}
                                        />
                                    </div>
                                );
                            }}
                        />
                    )}

                    {/* Bottom Add Section */}
                    <button
                        onClick={onAddSection}
                        style={{
                            padding: '0.75rem',
                            border: '2px dashed rgba(139,92,246,0.3)',
                            borderRadius: '1rem',
                            background: 'rgba(139,92,246,0.04)',
                            color: '#8b5cf6',
                            fontWeight: 700,
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            width: '100%',
                            marginTop: '1rem',
                        }}
                    >
                        + Add Section
                    </button>


                </div>
            </div>
        </div>
    );
};

export default THCSQuestionsStep;
