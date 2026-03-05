/**
 * THCSQuestionRenderer — Student-facing question display (PRD-0027 Task 5.4)
 * Renders individual MCQ questions with option cards, flag toggle, review mode.
 */
import React, { useState } from 'react';
import type { THCSQuestion, BlankResult, WritingGradingResult } from '../../types/thcs-test.types';
import THCSFillInRenderer from './THCSFillInRenderer';
import THCSWritingRenderer from './THCSWritingRenderer';
import THCSClozeRenderer from './THCSClozeRenderer';
import { plog } from '../thcs-editor/previewLogCollector';

interface THCSQuestionRendererProps {
    question: THCSQuestion;
    selectedAnswer: string | string[] | null;
    onAnswer: (answer: string | string[] | null) => void;
    isFlagged: boolean;
    onToggleFlag: () => void;
    isReviewMode: boolean;
    isCorrect?: boolean;
    blankResults?: BlankResult[];
    writingResult?: WritingGradingResult;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

/** Render underline markup for pronunciation/stress questions */
function renderUnderlines(text: string): React.ReactNode {
    if (!text || !text.includes('{{')) return text;
    const parts = text.split(/(\{\{.*?\}\})/g);
    return parts.map((part, i) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return <u key={i}>{part.slice(2, -2)}</u>;
        }
        return <span key={i}>{part}</span>;
    });
}

/** Render error identification preview */
function renderErrorParts(text: string): React.ReactNode {
    if (!text || !text.includes('{{')) return text;
    const parts = text.split(/(\{\{.*?\}\})/g);
    let partIdx = 0;
    return parts.map((part, i) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
            const label = LABELS[partIdx++] || '?';
            return (
                <span key={i}>
                    <u style={{ fontWeight: 600 }}>{part.slice(2, -2)}</u>
                    <sup style={{ fontSize: '0.625rem', fontWeight: 700, color: '#8b5cf6' }}>({label})</sup>
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

const THCSQuestionRenderer: React.FC<THCSQuestionRendererProps> = ({
    question, selectedAnswer, onAnswer, isFlagged, onToggleFlag,
    isReviewMode, isCorrect: _isCorrect, blankResults, writingResult,
}) => {
    const [showImageModal, setShowImageModal] = useState(false);

    const isPronunciation = question.intent === 'pronunciation' || question.intent === 'word-stress';
    const isErrorId = question.intent === 'error-identification';
    const isSynonymAntonym = question.intent === 'synonym-mcq' || question.intent === 'antonym-mcq'
        || question.intent === 'closest-meaning' || question.intent === 'word-reference';
    const isFillIn = question.type === 'verb-form' || question.type === 'word-form';
    const isWriting = question.type === 'sentence-rewrite' || question.type === 'sentence-rewrite-keyword';
    const isCloze = question.type === 'reading-cloze-wordbank';
    const isSentenceArrangement = question.intent === 'sentence-arrangement' || question.type === 'sentence-arrangement';
    const hasUnderlines = isPronunciation && question.optionUnderlines;

    // ─── Render-path diagnostic ───────────────────────────────
    const renderPath = isFillIn ? 'FILL-IN' :
        isWriting ? 'WRITING' :
            isCloze ? 'CLOZE' :
                isErrorId ? 'ERROR-ID (underlined parts)' :
                    isSynonymAntonym ? (question.intent === 'word-reference' ? 'WORD-REFERENCE (underlined word)' : 'SYNONYM/ANTONYM (underlined parts)') :
                        isSentenceArrangement ? 'SENTENCE-ARRANGEMENT (sub-items)' :
                            hasUnderlines ? 'MCQ + pronunciation underlines' :
                                'STANDARD MCQ';

    plog(`[Renderer] Q${question.questionNumber}: type=${question.type}, intent=${question.intent || 'none'}, render=${renderPath}, opts=${question.options?.length || 0}, text=${question.questionText ? question.questionText.slice(0, 50) + (question.questionText.length > 50 ? '...' : '') : '(empty)'}, underlinedParts=${question.underlinedParts ? 'yes' : 'no'}, optUnderlines=${question.optionUnderlines ? 'yes' : 'no'}`);

    return (
        <div style={{
            padding: '0.6rem 0.75rem',
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(139,92,246,0.1)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '0.35rem',
            }}>
                <span style={{
                    fontWeight: 700, fontSize: '0.875rem', color: '#8b5cf6',
                    background: 'rgba(139,92,246,0.1)', padding: '0.15rem 0.5rem',
                    borderRadius: '0.25rem',
                }}>
                    Q{question.questionNumber}
                </span>
                {!isReviewMode && (
                    <button
                        onClick={onToggleFlag}
                        aria-label={isFlagged ? 'Unflag question' : 'Flag question'}
                        style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: '1rem', opacity: isFlagged ? 1 : 0.4,
                            filter: isFlagged ? 'none' : 'grayscale(1)',
                        }}
                    >
                        ⚑
                    </button>
                )}
            </div>

            {/* Question text */}
            {isErrorId && question.underlinedParts ? (
                <div style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '0.5rem' }}>
                    {renderErrorParts(question.underlinedParts)}
                </div>
            ) : isSynonymAntonym && question.underlinedParts ? (
                <div style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '0.5rem', color: '#1e293b' }}>
                    {renderUnderlines(question.underlinedParts)}
                </div>
            ) : isSentenceArrangement && question.questionText && (question.questionText.match(/\b[a-e]\.\s/g) || []).length >= 2 ? (
                <div style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '0.5rem', color: '#1e293b' }}>
                    {question.questionText.split(/(?=\b[a-e]\.\s)/).filter(Boolean).map((item, idx) => {
                        const letterMatch = item.match(/^([a-e])\.\s(.*)/s);
                        if (letterMatch) {
                            return (
                                <div key={idx} style={{ marginBottom: '0.35rem', paddingLeft: '0.25rem' }}>
                                    <strong>{letterMatch[1]}.</strong> {letterMatch[2]?.trim()}
                                </div>
                            );
                        }
                        return <div key={idx} style={{ marginBottom: '0.35rem' }}>{item.trim()}</div>;
                    })}
                </div>
            ) : (
                <div style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '0.5rem', color: '#1e293b' }}>
                    {question.questionText?.includes('{{') ? renderUnderlines(question.questionText) : question.questionText}
                </div>
            )}

            {/* Image */}
            {question.imageUrl && (
                <>
                    <img
                        src={question.imageUrl}
                        alt={question.imageCaption || question.questionText}
                        style={{
                            maxWidth: 400, width: '100%', borderRadius: '0.5rem',
                            marginBottom: '0.75rem', cursor: 'pointer',
                        }}
                        onClick={() => setShowImageModal(true)}
                    />
                    {showImageModal && (
                        <div
                            onClick={() => setShowImageModal(false)}
                            style={{
                                position: 'fixed',
                                top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                zIndex: 9999,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2rem'
                            }}
                        >
                            <img
                                src={question.imageUrl}
                                alt={question.imageCaption || question.questionText}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    borderRadius: '0.5rem',
                                    backgroundColor: 'white',
                                    padding: '0.5rem'
                                }}
                            />
                        </div>
                    )}
                </>
            )}
            {/* Phase 2: Fill-in renderer */}
            {isFillIn && (
                <THCSFillInRenderer
                    question={question}
                    answers={Array.isArray(selectedAnswer) ? selectedAnswer : []}
                    onAnswer={(answers) => onAnswer(answers)}
                    isReviewMode={isReviewMode}
                    blankResults={blankResults}
                />
            )}

            {/* Phase 2: Writing renderer */}
            {isWriting && (
                <THCSWritingRenderer
                    question={question}
                    answer={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                    onAnswer={(answer) => onAnswer(answer)}
                    isReviewMode={isReviewMode}
                    writingResult={writingResult}
                />
            )}

            {/* Phase 2: Cloze renderer */}
            {isCloze && (
                <THCSClozeRenderer
                    question={question}
                    answers={Array.isArray(selectedAnswer) ? selectedAnswer : []}
                    onAnswer={(answers) => onAnswer(answers)}
                    isReviewMode={isReviewMode}
                    blankResults={blankResults}
                />
            )}

            {/* MCQ Options (only for MCQ types) */}
            {!isFillIn && !isWriting && !isCloze && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {LABELS.map((label, i) => {
                        const isSelected = selectedAnswer === label;
                        const isCorrectAnswer = question.correctAnswer === label;

                        let borderColor = 'rgba(139,92,246,0.15)';
                        let bgColor = 'transparent';
                        let textColor = '#1e293b';

                        if (isReviewMode) {
                            if (isCorrectAnswer) {
                                borderColor = '#10b981';
                                bgColor = 'rgba(16,185,129,0.08)';
                            } else if (isSelected && !isCorrectAnswer) {
                                borderColor = '#ef4444';
                                bgColor = 'rgba(239,68,68,0.08)';
                            }
                        } else if (isSelected) {
                            borderColor = '#8b5cf6';
                            bgColor = 'rgba(139,92,246,0.08)';
                        }

                        const optionText = hasUnderlines && question.optionUnderlines?.[i]
                            ? renderUnderlines(question.optionUnderlines[i]!)
                            : question.options[i];

                        return (
                            <div
                                key={label}
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={0}
                                onClick={() => {
                                    if (isReviewMode) return;
                                    // Toggle: click again to deselect
                                    onAnswer(isSelected ? null : label);
                                }}
                                onKeyDown={(e) => {
                                    if (isReviewMode) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onAnswer(isSelected ? null : label);
                                    }
                                }}
                                style={{
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '0.375rem',
                                    border: `1.5px solid ${borderColor}`,
                                    background: bgColor,
                                    cursor: isReviewMode ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    transition: 'all 0.15s ease',
                                    pointerEvents: isReviewMode ? 'none' as const : 'auto' as const,
                                }}
                            >
                                <span style={{
                                    fontWeight: 700, fontSize: '0.875rem',
                                    color: isSelected ? '#8b5cf6' : '#64748b',
                                    minWidth: 20,
                                }}>
                                    {label}.
                                </span>
                                <span style={{ color: textColor, flex: 1 }}>
                                    {optionText}
                                </span>
                                {isReviewMode && isCorrectAnswer && (
                                    <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                                )}
                                {isReviewMode && isSelected && !isCorrectAnswer && (
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>✕</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Explanation (review mode only) */}
            {isReviewMode && question.explanation?.text && (
                <div style={{
                    marginTop: '0.5rem', padding: '0.5rem 0.75rem',
                    background: 'rgba(59,130,246,0.06)', borderRadius: '0.375rem',
                    border: '1px solid rgba(59,130,246,0.15)',
                    fontSize: '0.875rem', color: '#1e40af',
                }}>
                    <strong>💡 Explanation:</strong> {question.explanation.text}
                </div>
            )}
        </div>
    );
};

export default THCSQuestionRenderer;
