/**
 * SummaryMasterBlock
 *
 * Props:
 * - groupQuestions {Array}   All sibling questions in the group, in order.
 *                            The group leader (with the paragraph) is detected internally.
 * - onGroupUpdate {Function} Callback: onGroupUpdate(updatedGroupQuestions)
 *                            Called with a full fresh copy of the group array whenever
 *                            any text segment or word bank item changes.
 *                            The caller (TestEditor) will update its state.
 */
import React, { useState, useEffect } from 'react';
import { findGroupLeader, parseToAST, serializeToFlat, applyDeletionGuard } from '../utils/summaryGroupUtils';

export default function SummaryMasterBlock({ groupQuestions, onGroupUpdate }) {
    const leader = findGroupLeader(groupQuestions);
    const isList = leader.type === 'summary-completion-list';

    // Internal AST state — array of SummarySegment objects
    const [segments, setSegments] = useState(() => {
        // If the leader already has a summaryAST, use it directly
        if (leader.summaryAST && leader.summaryAST.length > 0) {
            return leader.summaryAST;
        }
        // Otherwise parse from flat string
        return parseToAST(leader.question || '', groupQuestions);
    });

    // Re-sync AST when the parent changes the group (e.g. navigation)
    useEffect(() => {
        if (leader.summaryAST && leader.summaryAST.length > 0) {
            setSegments(leader.summaryAST);
        } else {
            setSegments(parseToAST(leader.question || '', groupQuestions));
        }
    }, [leader.question, JSON.stringify(leader.summaryAST)]);

    /**
     * Builds fresh copies of all group questions using the latest segments
     * and updated options, then calls onGroupUpdate once.
     *
     * @param newSegments {Array}  The updated segments array
     * @param newOptions  {Array}  The updated options array (only used for summary-completion-list)
     * @param customGroup {Array}  Optional override of the full group (used by deletion guard).
     *                             If omitted, current groupQuestions is used.
     */
    const propagate = (newSegments, newOptions, customGroup) => {
        const flat = serializeToFlat(newSegments);
        const base = customGroup || groupQuestions;
        const updatedGroup = base.map(q => {
            const isLeader = (q === leader || q.number === leader.number);
            if (isLeader) {
                return {
                    ...q,
                    question: flat,        // flat string for Student View backward compat
                    summaryAST: newSegments,  // rich format for Edit Modal
                    ...(isList ? { options: newOptions } : {}),
                };
            }
            return { ...q };
        });
        onGroupUpdate(updatedGroup);
    };

    const handleTextBlur = (segIndex, newValue) => {
        const newSegments = segments.map((seg, i) =>
            i === segIndex ? { ...seg, value: newValue } : seg
        );
        setSegments(newSegments);
        propagate(newSegments, leader.options || []);
    };

    const handleOptionChange = (optIndex, newValue) => {
        const newOptions = (leader.options || []).map((opt, i) =>
            i === optIndex ? newValue : opt
        );
        propagate(segments, newOptions);
    };

    const handleAddOption = () => {
        const newOptions = [...(leader.options || []), ''];
        propagate(segments, newOptions);
    };

    const handleRemoveOption = (optIndex) => {
        // 1. Apply deletion guard — auto-clears sibling answers
        const { updatedQuestions, clearedNumbers } = applyDeletionGuard(
            groupQuestions.map(q => ({ ...q })),
            optIndex
        );
        // 2. Remove the option from the leader's options array
        const newOptions = (leader.options || []).filter((_, i) => i !== optIndex);
        // 3. Show toast listing which questions had their answer cleared
        if (clearedNumbers.length > 0) {
            window.alert(
                `Option ${String.fromCharCode(65 + optIndex)} was removed. ` +
                `The answer for question(s) ${clearedNumbers.join(', ')} has been cleared automatically.`
            );
        }
        // 4. Propagate — pass updatedQuestions as customGroup so the cleared answers are saved
        propagate(segments, newOptions, updatedQuestions);
    };

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem' }}>

            {/* Header bar */}
            <div style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.06)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6' }}>
                    Summary Paragraph
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {leader.summaryGroupId ? `(Group ${leader.summaryGroupId} · Q${groupQuestions[0]?.number}–Q${groupQuestions[groupQuestions.length - 1]?.number} · edit text, then click away)` : `(Q${groupQuestions[0]?.number}–Q${groupQuestions[groupQuestions.length - 1]?.number} group · edit text, then click away)`}
                </span>
            </div>

            {/* Inline segment editor */}
            <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', fontFamily: 'Arial, sans-serif', fontSize: '0.9375rem', lineHeight: 1.8 }}>
                {segments.map((seg, i) => {
                    if (seg.type === 'blank') {
                        // Render a non-editable blank badge
                        return (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', background: '#dbeafe', color: '#1d4ed8', borderRadius: '0.25rem', padding: '0 0.375rem', fontWeight: 700, fontSize: '0.8125rem', height: '24px', whiteSpace: 'nowrap' }}>
                                Q{seg.questionNumber}
                            </span>
                        );
                    }
                    // Render an auto-resizing editable text input
                    return (
                        <input
                            key={i}
                            type="text"
                            defaultValue={seg.value}
                            onBlur={(e) => handleTextBlur(i, e.target.value)}
                            style={{
                                border: 'none',
                                borderBottom: '1px dashed #cbd5e1',
                                outline: 'none',
                                background: 'transparent',
                                fontSize: '0.9375rem',
                                color: '#1e293b',
                                fontFamily: 'Arial, sans-serif',
                                padding: '0 2px',
                                minWidth: '4px',
                                width: `${Math.max(seg.value.length, 1) * 8}px`,
                            }}
                            onFocus={(e) => { e.target.style.borderBottomColor = '#3b82f6'; }}
                            onBlurCapture={(e) => { e.target.style.borderBottomColor = '#cbd5e1'; }}
                        />
                    );
                })}
            </div>

            {/* Phase 2 placeholder note for add/remove blanks */}
            <div style={{ padding: '0.375rem 1rem', borderTop: '1px solid #e2e8f0', background: '#fafafa', fontSize: '0.75rem', color: '#94a3b8' }}>
                ℹ Adding or removing blanks is available in a future update.
            </div>

            {isList && (
                <div style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                    {/* Header */}
                    <div style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.06)', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6' }}>
                            Word Bank (shared by all blanks)
                        </span>
                    </div>

                    {/* Option rows */}
                    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(leader.options || []).map((opt, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {/* Letter badge */}
                                <span style={{ minWidth: '20px', fontWeight: 700, color: '#475569', fontSize: '0.875rem' }}>
                                    {String.fromCharCode(65 + i)}.
                                </span>
                                {/* Editable option text */}
                                <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleOptionChange(i, e.target.value)}
                                    style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0.25rem 0.5rem', fontSize: '0.875rem', color: '#1e293b', outline: 'none' }}
                                    onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; }}
                                    onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
                                />
                                {/* Remove button */}
                                <button
                                    onClick={() => handleRemoveOption(i)}
                                    title="Remove this option"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', lineHeight: 1, padding: '0 4px' }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}

                        {/* Add option button */}
                        <button
                            onClick={handleAddOption}
                            style={{ alignSelf: 'flex-start', marginTop: '0.25rem', background: 'transparent', border: '1px dashed #3b82f6', borderRadius: '0.375rem', color: '#3b82f6', fontSize: '0.8125rem', fontWeight: 600, padding: '0.25rem 0.75rem', cursor: 'pointer' }}
                        >
                            + Add Option
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
