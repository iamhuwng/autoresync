/**
 * THCSAnswerKeyStep — Step 3 of the THCS Test Editor Wizard.
 * 
 * Progress bar with working "Auto-fill remaining" / "Clear all" /
 * "Bulk Input" (modal) action buttons, then the answer key panel.
 */
import React, { useState, useMemo, useCallback } from 'react';
import THCSAnswerKeyPanel from './THCSAnswerKeyPanel';
import type { THCSSection } from '../../types/thcs-test.types';
import { INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';

export interface THCSAnswerKeyStepProps {
    sections: THCSSection[];
    onUpdateAnswer: (sectionIndex: number, questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => void;
    onUpdateFillInAnswers: (sectionIndex: number, questionIndex: number, blankIndex: number, answers: string[]) => void;
    onUpdateModelAnswers: (sectionIndex: number, questionIndex: number, answers: string[]) => void;
    onUpdateClozeMapping: (sectionIndex: number, questionIndex: number, blankNum: number, word: string) => void;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;
type ValidAnswer = typeof VALID_ANSWERS[number];

/**
 * Parse bulk answer text input. Supports multiple formats:
 * - "1A 2B 3C 4D" or "1.A 2.B 3.C 4.D"
 * - "1-A 2-B 3-C" or "1: A  2: B"
 * - "A B C D A B C D" (sequential letters, no numbers)
 * - "ABCDABCD" (continuous letters)
 * - Multi-line: "1. A\n2. B\n3. C"
 * Returns: Map<questionNumber, answer>
 */
function parseBulkAnswers(text: string): Map<number, ValidAnswer> {
    const result = new Map<number, ValidAnswer>();
    const cleaned = text.trim();
    if (!cleaned) return result;

    // Strategy 1: Try numbered format first (e.g., "1.A", "1-A", "1: A", "1A")
    const numberedPattern = /(\d+)\s*[.\-:)]\s*([ABCDabcd])/g;
    let match;
    while ((match = numberedPattern.exec(cleaned)) !== null) {
        const num = parseInt(match[1]!, 10);
        const ans = match[2]!.toUpperCase() as ValidAnswer;
        if (num > 0 && VALID_ANSWERS.includes(ans)) {
            result.set(num, ans);
        }
    }
    if (result.size > 0) return result;

    // Strategy 2: Try "1A 2B 3C" (number directly followed by letter, no separator)
    const compactNumbered = /(\d+)([ABCDabcd])/g;
    while ((match = compactNumbered.exec(cleaned)) !== null) {
        const num = parseInt(match[1]!, 10);
        const ans = match[2]!.toUpperCase() as ValidAnswer;
        if (num > 0 && VALID_ANSWERS.includes(ans)) {
            result.set(num, ans);
        }
    }
    if (result.size > 0) return result;

    // Strategy 3: Sequential letters only (space/comma/newline separated or continuous)
    // e.g., "A B C D A B" or "ABCDAB" or "A, B, C, D"
    const lettersOnly = cleaned.replace(/[^ABCDabcd]/g, '').toUpperCase();
    if (lettersOnly.length > 0) {
        for (let i = 0; i < lettersOnly.length; i++) {
            const ans = lettersOnly[i] as ValidAnswer;
            if (VALID_ANSWERS.includes(ans)) {
                result.set(i + 1, ans);
            }
        }
    }

    return result;
}

const THCSAnswerKeyStep: React.FC<THCSAnswerKeyStepProps> = ({
    sections,
    onUpdateAnswer,
    onUpdateFillInAnswers,
    onUpdateModelAnswers,
    onUpdateClozeMapping,
}) => {
    const [showBulkModal, setShowBulkModal] = useState(false);

    // Gather all MCQ questions with their indices
    const mcqQuestions = useMemo(() => {
        const result: Array<{
            sectionIndex: number;
            questionIndex: number;
            questionNumber: number;
            correctAnswer: string;
            type: string;
        }> = [];
        sections.forEach((s, si) => {
            s.questions.forEach((q, qi) => {
                if (q.type in INSTRUCTION_TEMPLATES) {
                    result.push({
                        sectionIndex: si,
                        questionIndex: qi,
                        questionNumber: q.questionNumber,
                        correctAnswer: q.correctAnswer,
                        type: q.type,
                    });
                }
            });
        });
        return result;
    }, [sections]);

    const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
    const answeredCount = sections.reduce((sum, s) =>
        sum + s.questions.filter(q => {
            const t = q.type;
            if (t === 'verb-form' || t === 'word-form') return (q.blankAnswers?.length || 0) > 0;
            if (t === 'sentence-rewrite' || t === 'sentence-rewrite-keyword') return (q.modelAnswers?.length || 0) > 0;
            if (t === 'reading-cloze-wordbank') return Object.keys(q.blankMapping || {}).length > 0;
            return !!q.correctAnswer;
        }).length
        , 0);
    const percentage = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

    // ── Auto-fill remaining MCQ with random answers ──
    const handleAutoFill = useCallback(() => {
        const unanswered = mcqQuestions.filter(q => !q.correctAnswer);
        if (unanswered.length === 0) return;
        unanswered.forEach(q => {
            const randomAnswer = VALID_ANSWERS[Math.floor(Math.random() * 4)]!;
            onUpdateAnswer(q.sectionIndex, q.questionIndex, randomAnswer);
        });
    }, [mcqQuestions, onUpdateAnswer]);

    // ── Clear all MCQ answers ──
    const handleClearAll = useCallback(() => {
        mcqQuestions.forEach(q => {
            if (q.correctAnswer) {
                // Set to '' which clears it — the type expects A|B|C|D but
                // the internal state stores '' for unanswered
                onUpdateAnswer(q.sectionIndex, q.questionIndex, '' as any);
            }
        });
    }, [mcqQuestions, onUpdateAnswer]);

    // ── Apply bulk input ──
    const handleBulkApply = useCallback((parsed: Map<number, ValidAnswer>) => {
        parsed.forEach((answer, questionNumber) => {
            const mcq = mcqQuestions.find(q => q.questionNumber === questionNumber);
            if (mcq) {
                onUpdateAnswer(mcq.sectionIndex, mcq.questionIndex, answer);
            }
        });
        setShowBulkModal(false);
    }, [mcqQuestions, onUpdateAnswer]);

    const unansweredMcqCount = mcqQuestions.filter(q => !q.correctAnswer).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Progress bar with action buttons */}
            <div style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(12px)',
                borderRadius: '1rem',
                border: '1px solid rgba(139,92,246,0.1)',
                padding: '1rem 1.5rem',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.625rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                }}>
                    {/* Left: progress text */}
                    <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: '#1e293b',
                    }}>
                        {answeredCount}/{totalQuestions} answers completed
                    </span>

                    {/* Right: working action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <ActionPill
                            label={`Auto-fill remaining${unansweredMcqCount > 0 ? ` (${unansweredMcqCount})` : ''}`}
                            onClick={handleAutoFill}
                            disabled={unansweredMcqCount === 0}
                            icon="🎲"
                        />
                        <ActionPill
                            label="Clear all"
                            onClick={handleClearAll}
                            disabled={mcqQuestions.filter(q => q.correctAnswer).length === 0}
                            icon="🗑️"
                            variant="danger"
                        />
                        <ActionPill
                            label="Bulk Input"
                            onClick={() => setShowBulkModal(true)}
                            disabled={mcqQuestions.length === 0}
                            icon="📋"
                            variant="primary"
                        />
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{
                    height: 6,
                    background: '#e2e8f0',
                    borderRadius: 3,
                    overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: percentage === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
                        borderRadius: 3,
                        transition: 'width 0.5s ease',
                    }} />
                </div>
            </div>

            {/* Answer Key Panel (reused unchanged) */}
            <THCSAnswerKeyPanel
                sections={sections}
                onUpdateAnswer={onUpdateAnswer}
                onUpdateFillInAnswers={onUpdateFillInAnswers}
                onUpdateModelAnswers={onUpdateModelAnswers}
                onUpdateClozeMapping={onUpdateClozeMapping}
            />

            {/* Bulk Input Modal */}
            {showBulkModal && (
                <BulkInputModal
                    mcqCount={mcqQuestions.length}
                    mcqQuestions={mcqQuestions}
                    onApply={handleBulkApply}
                    onClose={() => setShowBulkModal(false)}
                />
            )}
        </div>
    );
};

/* ── Action pill button (enhanced with icon, disabled state, variant) ── */
const ActionPill: React.FC<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: string;
    variant?: 'default' | 'danger' | 'primary';
}> = ({ label, onClick, disabled, icon, variant = 'default' }) => {
    const variantColors = {
        default: { hover: '#8b5cf6', border: '#8b5cf6' },
        danger: { hover: '#ef4444', border: '#ef4444' },
        primary: { hover: '#fff', border: '#8b5cf6' },
    };
    const v = variantColors[variant];
    const isPrimary = variant === 'primary';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '0.3rem 0.75rem',
                border: isPrimary ? '1px solid #8b5cf6' : '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                background: isPrimary ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#fff',
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: isPrimary ? '#fff' : '#64748b',
                cursor: disabled ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                opacity: disabled ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
            }}
            onMouseOver={(e) => {
                if (disabled) return;
                if (!isPrimary) {
                    e.currentTarget.style.borderColor = v.border;
                    e.currentTarget.style.color = v.hover;
                } else {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #7c3aed, #6d28d9)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(139,92,246,0.3)';
                }
            }}
            onMouseOut={(e) => {
                if (disabled) return;
                if (!isPrimary) {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#64748b';
                } else {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
                    e.currentTarget.style.boxShadow = 'none';
                }
            }}
        >
            {icon && <span style={{ fontSize: '0.75rem' }}>{icon}</span>}
            {label}
        </button>
    );
};

/* ══════════════════════════════════════════════════════════════
 * Bulk Input Modal
 * Allows teachers to paste answer keys in various common formats
 * ══════════════════════════════════════════════════════════════ */
const BulkInputModal: React.FC<{
    mcqCount: number;
    mcqQuestions: Array<{
        questionNumber: number;
        correctAnswer: string;
    }>;
    onApply: (parsed: Map<number, ValidAnswer>) => void;
    onClose: () => void;
}> = ({ mcqCount, mcqQuestions, onApply, onClose }) => {
    const [text, setText] = useState('');
    const parsed = useMemo(() => parseBulkAnswers(text), [text]);

    // Count how many parsed answers actually match MCQ question numbers
    const mcqNumbers = new Set(mcqQuestions.map(q => q.questionNumber));
    const matchedCount = Array.from(parsed.keys()).filter(n => mcqNumbers.has(n)).length;
    const unmatchedEntries = Array.from(parsed.entries()).filter(([n]) => !mcqNumbers.has(n));

    // Build preview grid
    const previewItems = mcqQuestions.map(q => ({
        questionNumber: q.questionNumber,
        current: q.correctAnswer || '—',
        newAnswer: parsed.get(q.questionNumber) || null,
    }));

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s ease',
                }}
            />
            {/* Modal */}
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: '#fff',
                borderRadius: '1.25rem',
                boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
                zIndex: 1001,
                width: 'min(640px, 92vw)',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.25s ease',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <h3 style={{
                            margin: 0,
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            color: '#1e293b',
                        }}>📋 Bulk Answer Key Input</h3>
                        <p style={{
                            margin: '0.25rem 0 0',
                            fontSize: '0.8125rem',
                            color: '#64748b',
                        }}>
                            Paste your answer key below — {mcqCount} MCQ questions detected
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.25rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '0.25rem',
                            borderRadius: '0.375rem',
                        }}
                    >✕</button>
                </div>

                {/* Body */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    overflowY: 'auto',
                    flex: 1,
                }}>
                    {/* Format help */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(99,102,241,0.06))',
                        borderRadius: '0.75rem',
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        border: '1px solid rgba(139,92,246,0.1)',
                    }}>
                        <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#8b5cf6',
                            marginBottom: '0.375rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Supported Formats
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '0.25rem 1rem',
                            fontSize: '0.75rem',
                            color: '#475569',
                        }}>
                            <div><code style={codeStyle}>1.A 2.B 3.C 4.D</code></div>
                            <div><code style={codeStyle}>1A 2B 3C 4D</code></div>
                            <div><code style={codeStyle}>1-A 2-B 3-C</code></div>
                            <div><code style={codeStyle}>ABCDABCD...</code></div>
                            <div><code style={codeStyle}>A B C D A B</code></div>
                            <div><code style={codeStyle}>1. A (one per line)</code></div>
                        </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste your answer key here, e.g.:\n1.A 2.B 3.C 4.D 5.A 6.B 7.C 8.D\n9.A 10.B 11.C 12.D..."
                        autoFocus
                        style={{
                            width: '100%',
                            minHeight: 120,
                            padding: '0.875rem 1rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '0.75rem',
                            fontSize: '0.875rem',
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            lineHeight: 1.6,
                            resize: 'vertical',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                            boxSizing: 'border-box',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#8b5cf6'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    />

                    {/* Parse status */}
                    {text.trim() && (
                        <div style={{
                            marginTop: '0.75rem',
                            padding: '0.625rem 0.875rem',
                            borderRadius: '0.625rem',
                            background: matchedCount > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                            border: `1px solid ${matchedCount > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                        }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: matchedCount > 0 ? '#059669' : '#d97706' }}>
                                {parsed.size > 0
                                    ? `✓ Parsed ${parsed.size} answer${parsed.size !== 1 ? 's' : ''} — ${matchedCount} match MCQ questions`
                                    : '⚠ No valid answers detected. Check your format.'
                                }
                            </div>
                            {unmatchedEntries.length > 0 && (
                                <div style={{ fontSize: '0.6875rem', color: '#92400e', marginTop: '0.25rem' }}>
                                    ⚠ {unmatchedEntries.length} answer(s) don't match any MCQ question number:
                                    {' '}{unmatchedEntries.slice(0, 5).map(([n, a]) => `Q${n}=${a}`).join(', ')}
                                    {unmatchedEntries.length > 5 && ` (+${unmatchedEntries.length - 5} more)`}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preview grid */}
                    {matchedCount > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#8b5cf6',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '0.5rem',
                            }}>
                                Preview Changes
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                                gap: '0.25rem',
                                maxHeight: 160,
                                overflowY: 'auto',
                                padding: '0.25rem',
                            }}>
                                {previewItems.map(item => (
                                    <div
                                        key={item.questionNumber}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.375rem',
                                            fontSize: '0.75rem',
                                            background: item.newAnswer
                                                ? (item.newAnswer !== item.current ? 'rgba(139,92,246,0.08)' : 'rgba(148,163,184,0.08)')
                                                : 'transparent',
                                            border: item.newAnswer
                                                ? `1px solid ${item.newAnswer !== item.current ? 'rgba(139,92,246,0.2)' : 'rgba(148,163,184,0.15)'}`
                                                : '1px solid transparent',
                                        }}
                                    >
                                        <span style={{ fontWeight: 700, color: '#64748b', minWidth: 28 }}>
                                            Q{item.questionNumber}
                                        </span>
                                        {item.newAnswer ? (
                                            <>
                                                {item.current !== '—' && item.newAnswer !== item.current && (
                                                    <span style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '0.625rem' }}>
                                                        {item.current}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: item.newAnswer !== item.current ? '#8b5cf6' : '#64748b',
                                                }}>
                                                    {item.newAnswer}
                                                </span>
                                                {item.newAnswer !== item.current && (
                                                    <span style={{ color: '#8b5cf6', fontSize: '0.5rem' }}>●</span>
                                                )}
                                            </>
                                        ) : (
                                            <span style={{ color: '#cbd5e1' }}>{item.current}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.5rem 1.25rem',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.625rem',
                            background: '#fff',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: '#64748b',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onApply(parsed)}
                        disabled={matchedCount === 0}
                        style={{
                            padding: '0.5rem 1.5rem',
                            border: 'none',
                            borderRadius: '0.625rem',
                            background: matchedCount > 0
                                ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                                : '#e2e8f0',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: matchedCount > 0 ? '#fff' : '#94a3b8',
                            cursor: matchedCount > 0 ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            boxShadow: matchedCount > 0 ? '0 2px 8px rgba(139,92,246,0.3)' : 'none',
                        }}
                    >
                        Apply {matchedCount > 0 ? `${matchedCount} Answer${matchedCount !== 1 ? 's' : ''}` : ''}
                    </button>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, -46%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
            `}</style>
        </>
    );
};

const codeStyle: React.CSSProperties = {
    background: 'rgba(139,92,246,0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    fontSize: '0.6875rem',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#7c3aed',
};

export default THCSAnswerKeyStep;
