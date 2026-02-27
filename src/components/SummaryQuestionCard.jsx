/**
 * SummaryQuestionCard
 *
 * Props:
 * - question {Object}          The individual question (Q27, Q28, etc.)
 * - questionIndex {number}     0-based index in allQuestions array (used for onUpdate call)
 * - allSegments {Array}        The current AST from SummaryMasterBlock. Used to build read-only context.
 * - isHighlighted {boolean}    True when this card is the currently selected question.
 * - onUpdate {Function}        onUpdate(index, updatedQuestion) — same callback as generic editor.
 * - usedAnswers {string[]}     Letters already used by OTHER blanks in the group.
 */
import React from 'react';
import { extractContext } from '../utils/summaryGroupUtils';

export default function SummaryQuestionCard({
    question,
    questionIndex,
    allSegments,
    isHighlighted,
    onUpdate,
    usedAnswers = [],
}) {
    const isList = question.type === 'summary-completion-list';
    const context = extractContext(allSegments, question.number);

    // For summary-completion-list: answer is a letter string like "A"
    const handleDropdownChange = (e) => {
        onUpdate(questionIndex, { ...question, answer: e.target.value });
    };

    // For summary-completion-text: answer is the word from the passage
    const handleTextChange = (e) => {
        onUpdate(questionIndex, { ...question, answer: e.target.value });
    };

    return (
        <div style={{
            border: isHighlighted ? '2px solid #3b82f6' : '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            marginBottom: '0.75rem',
            overflow: 'hidden',
            background: '#ffffff',
        }}>

            {/* Card header with question number */}
            <div style={{ padding: '0.5rem 1rem', background: isHighlighted ? 'rgba(59, 130, 246, 0.08)' : '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b' }}>
                    Question {question.number}
                </span>
                {question.answer && (
                    <span style={{ marginLeft: 'auto', padding: '0.125rem 0.5rem', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white', borderRadius: '0.25rem', fontSize: '0.6875rem', fontWeight: 600 }}>
                        SET
                    </span>
                )}
            </div>

            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Read-only context paragraph */}
                <div style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '0.375rem', fontSize: '0.875rem', color: '#475569', fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                        Context (read-only)
                    </span>
                    {context}
                </div>

                {/* Answer section */}
                <div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b', display: 'block', marginBottom: '0.375rem' }}>
                        Correct Answer *
                    </span>

                    {isList ? (
                        // summary-completion-list: dropdown from word bank
                        <select
                            value={question.answer || ''}
                            onChange={handleDropdownChange}
                            style={{ width: '100%', padding: '0.375rem 0.5rem', border: '2px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9375rem', color: '#1e293b', background: '#ffffff', outline: 'none' }}
                        >
                            <option value="">— Select answer —</option>
                            {(question.options || []).map((opt, i) => {
                                const letter = String.fromCharCode(65 + i);
                                const isUsedByOther = usedAnswers.includes(letter);
                                return (
                                    <option
                                        key={i}
                                        value={letter}
                                        disabled={isUsedByOther}
                                        style={{ color: isUsedByOther ? '#94a3b8' : '#000000' }}
                                    >
                                        {letter}. {opt}{isUsedByOther ? ' (used)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    ) : (
                        // summary-completion-text: free text from passage
                        <input
                            type="text"
                            value={question.answer || ''}
                            onChange={handleTextChange}
                            placeholder="Enter the correct word(s) from the passage"
                            style={{ width: '100%', padding: '0.375rem 0.5rem', border: '2px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.9375rem', color: '#1e293b', background: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                        />
                    )}
                </div>

            </div>
        </div>
    );
}
