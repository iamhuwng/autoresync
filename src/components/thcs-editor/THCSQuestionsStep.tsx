/**
 * THCSQuestionsStep — Step 2 of the THCS Test Editor Wizard.
 * 
 * Renders a section sidebar navigator + main content area for editing
 * sections and questions. Reuses THCSSectionBlock, THCSDndSectionsContainer.
 */
import React, { useState } from 'react';
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
    onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

const THCSQuestionsStep: React.FC<THCSQuestionsStepProps> = ({
    sections,
    draftId,
    onSectionUpdate,
    onSectionDelete,
    onSectionMove,
    onAddSection,
    onReorder,
    onTrackAction,
}) => {
    const [activeSectionId, setActiveSectionId] = useState<string | null>(
        sections.length > 0 ? sections[0]!.id : null
    );
    const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
    const activeIndex = activeSectionId === null
        ? sections.length - 1
        : sections.findIndex(section => section.id === activeSectionId);
    const selectedIndex = activeIndex >= 0 ? activeIndex : 0;
    const selectedSection = sections[selectedIndex];
    const globalQuestionOffset = sections.slice(0, selectedIndex)
        .reduce((sum, section) => sum + section.questions.length, 0);
    const addSectionAndSelect = () => {
        setActiveSectionId(null);
        onAddSection();
    };

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
                        Step 2 of 4: <strong>Build Test</strong>
                    </h2>
                    <p style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8125rem',
                        color: '#64748b',
                    }}>
                        {sections.length} section{sections.length !== 1 ? 's' : ''} · {totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {/* Section sidebar + content layout */}
            <div className="thcs-studio-layout" style={{ display: 'flex', gap: '1rem' }}>
                {/* Section Navigator Sidebar */}
                <div className="thcs-studio-sidebar" style={{
                    width: '220px',
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
                        <THCSDndSectionsContainer
                            sections={sections}
                            onReorder={onReorder}
                            renderSection={(section, idx) => {
                                const isActive = section.id === selectedSection?.id;
                                const qCount = section.questions.length;
                                return (
                                    <button
                                        onClick={() => setActiveSectionId(section.id)}
                                        aria-current={isActive ? 'true' : undefined}
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
                                                {section.importSourceNeedsReview !== false && (section.isRawTextFallback || section.questions.some(q => q.type === 'raw-text-fallback')) && ' · Needs review'}
                                            </div>
                                        </div>
                                    </button>
                                );
                            }}
                        />

                        {/* Add Section button */}
                        <button
                            onClick={addSectionAndSelect}
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
                        <div role="status" style={{ padding: '1rem', borderRadius: '0.75rem', color: '#6d28d9', background: '#f5f3ff' }}>
                            No sections yet. Click "+ Add Section" in the sidebar to start.
                        </div>
                    ) : selectedSection && (
                        <THCSSectionBlock
                            key={selectedSection.id}
                            section={selectedSection}
                            sectionIndex={selectedIndex}
                            totalSections={sections.length}
                            globalQuestionOffset={globalQuestionOffset}
                            draftId={draftId}
                            onUpdate={(section) => onSectionUpdate(selectedIndex, section)}
                            onDelete={() => onSectionDelete(selectedIndex)}
                            onMoveUp={() => onSectionMove(selectedIndex, -1)}
                            onMoveDown={() => onSectionMove(selectedIndex, 1)}
                            onTrackAction={onTrackAction}
                        />
                    )}

                    {/* Bottom Add Section */}
                    <button
                        onClick={addSectionAndSelect}
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
