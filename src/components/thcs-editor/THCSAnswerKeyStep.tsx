/**
 * THCSAnswerKeyStep — Step 3 of the THCS Test Editor Wizard.
 * 
 * Mockup-faithful: Progress bar with "Auto-fill remaining" / "Clear all" /
 * "Import from clipboard" action buttons, then the answer key panel.
 */
import React from 'react';
import THCSAnswerKeyPanel from './THCSAnswerKeyPanel';
import type { THCSSection } from '../../types/thcs-test.types';

export interface THCSAnswerKeyStepProps {
    sections: THCSSection[];
    onUpdateAnswer: (sectionIndex: number, questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => void;
    onUpdateFillInAnswers: (sectionIndex: number, questionIndex: number, blankIndex: number, answers: string[]) => void;
    onUpdateModelAnswers: (sectionIndex: number, questionIndex: number, answers: string[]) => void;
    onUpdateClozeMapping: (sectionIndex: number, questionIndex: number, blankNum: number, word: string) => void;
}

const THCSAnswerKeyStep: React.FC<THCSAnswerKeyStepProps> = ({
    sections,
    onUpdateAnswer,
    onUpdateFillInAnswers,
    onUpdateModelAnswers,
    onUpdateClozeMapping,
}) => {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Progress bar with action buttons — matches mockup */}
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
                }}>
                    {/* Left: progress text */}
                    <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: '#1e293b',
                    }}>
                        {answeredCount}/{totalQuestions} answers completed
                    </span>

                    {/* Right: action buttons (from mockup) */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <ActionPill label="Auto-fill remaining" onClick={() => {/* no-op for now */ }} />
                        <ActionPill label="Clear all" onClick={() => {/* no-op for now */ }} />
                        <ActionPill label="Import from clipboard" onClick={() => {/* no-op for now */ }} />
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
        </div>
    );
};

/* ── Action pill button (matches mockup's small text buttons) ── */
const ActionPill: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        style={{
            padding: '0.25rem 0.625rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            background: '#fff',
            fontSize: '0.6875rem',
            fontWeight: 500,
            color: '#64748b',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s',
        }}
        onMouseOver={(e) => {
            e.currentTarget.style.borderColor = '#8b5cf6';
            e.currentTarget.style.color = '#8b5cf6';
        }}
        onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.color = '#64748b';
        }}
    >
        {label}
    </button>
);

export default THCSAnswerKeyStep;
