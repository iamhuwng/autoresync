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
import type { THCSSection } from '../../types/thcs-test.types';

export interface THCSQuestionsStepProps {
    sections: THCSSection[];
    draftId: string | null;
    onSectionUpdate: (index: number, section: THCSSection) => void;
    onSectionDelete: (index: number) => void;
    onSectionMove: (index: number, direction: -1 | 1) => void;
    onAddSection: () => void;
    onReorder: (newSections: THCSSection[]) => void;
}

const THCSQuestionsStep: React.FC<THCSQuestionsStepProps> = ({
    sections,
    draftId,
    onSectionUpdate,
    onSectionDelete,
    onSectionMove,
    onAddSection,
    onReorder,
}) => {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        sections.length > 0 ? sections[0]!.id : null
    );

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

                    {/* 🔍 DEBUG: Editor diagnostic tools (Temporary) */}
                    <div style={{
                        padding: '0.75rem', background: 'rgba(245,158,11,0.06)', borderRadius: '0.5rem',
                        border: '1px dashed rgba(245,158,11,0.3)', marginTop: '1rem',
                    }}>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', marginBottom: '0.35rem' }}>
                            🔍 Debug Tools — Step 2 Editor (Temporary)
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(sections, null, 2));
                                    alert('✅ Full sections JSON copied to clipboard');
                                }}
                                style={{
                                    padding: '0.2rem 0.5rem', border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '0.375rem', background: 'transparent',
                                    color: '#d97706', fontWeight: 600, fontSize: '0.65rem', cursor: 'pointer',
                                }}
                            >📋 Copy Sections JSON</button>
                            <button
                                onClick={() => {
                                    const summary = sections.map((s, si) => {
                                        const qs = s.questions.map(q =>
                                            `  Q${q.questionNumber}: type=${q.type} intent=${q.intent || 'none'} answer=${q.correctAnswer || '⚠️ MISSING'} opts=${q.options.filter(o => o).length}`
                                        ).join('\n');
                                        return `[${si}] ${s.name} (${s.questions[0]?.type || '?'}) — ${s.questions.length} questions\n${qs}`;
                                    }).join('\n\n');
                                    navigator.clipboard.writeText(summary);
                                    alert('✅ Answer key summary copied to clipboard');
                                }}
                                style={{
                                    padding: '0.2rem 0.5rem', border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '0.375rem', background: 'transparent',
                                    color: '#d97706', fontWeight: 600, fontSize: '0.65rem', cursor: 'pointer',
                                }}
                            >🔑 Copy Answer Key Summary</button>
                            <button
                                onClick={() => {
                                    const breakdown = sections.map((s, si) => {
                                        const types = [...new Set(s.questions.map(q => q.type))];
                                        const intents = [...new Set(s.questions.map(q => q.intent).filter(Boolean))];
                                        const missingAnswers = s.questions.filter(q => !q.correctAnswer).length;
                                        return `[${si}] "${s.name}"\n  sectionType: ${s.questions[0]?.type || '?'}\n  qTypes: [${types.join(', ')}]\n  intents: [${intents.join(', ')}]\n  questions: ${s.questions.length}\n  missingAnswers: ${missingAnswers}\n  layout: ${s.layout || 'single-column'}`;
                                    }).join('\n\n');
                                    navigator.clipboard.writeText(breakdown);
                                    alert('✅ Section type breakdown copied to clipboard');
                                }}
                                style={{
                                    padding: '0.2rem 0.5rem', border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '0.375rem', background: 'transparent',
                                    color: '#d97706', fontWeight: 600, fontSize: '0.65rem', cursor: 'pointer',
                                }}
                            >📊 Copy Section Breakdown</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default THCSQuestionsStep;
