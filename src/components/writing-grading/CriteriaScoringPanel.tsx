/**
 * CriteriaScoringPanel — PRD-0030 Task 5.2
 * 4 IELTS Writing criteria with 0-9 score buttons per criterion.
 * Shows live task band calculation.
 * NO MANTINE.
 */

import { useMemo } from 'react';
import { calculateTaskBand } from '../../utils/ieltsWritingBandCalculator';

interface CriteriaScoringPanelProps {
    taskNumber: 1 | 2;
    scores: {
        ta: number | null;  // Task Achievement (T1) / Task Response (T2)
        cc: number | null;  // Coherence & Cohesion
        lr: number | null;  // Lexical Resource
        gra: number | null; // Grammatical Range & Accuracy
    };
    onChange: (scores: CriteriaScoringPanelProps['scores']) => void;
    isVoided?: boolean;
}

const CRITERIA = [
    { key: 'ta' as const, label1: 'Task Achievement', label2: 'Task Response', color: '#3b82f6' },
    { key: 'cc' as const, label1: 'Coherence & Cohesion', label2: 'Coherence & Cohesion', color: '#10b981' },
    { key: 'lr' as const, label1: 'Lexical Resource', label2: 'Lexical Resource', color: '#f97316' },
    { key: 'gra' as const, label1: 'Grammatical Range', label2: 'Grammatical Range', color: '#ef4444' },
];

export default function CriteriaScoringPanel({
    taskNumber,
    scores,
    onChange,
    isVoided = false,
}: CriteriaScoringPanelProps) {
    const taskBand = useMemo(() => {
        if (isVoided) return null;
        if (scores.ta === null || scores.cc === null || scores.lr === null || scores.gra === null) return null;
        const mapped = taskNumber === 1
            ? { TA: scores.ta, CC: scores.cc, LR: scores.lr, GRA: scores.gra }
            : { TR: scores.ta, CC: scores.cc, LR: scores.lr, GRA: scores.gra };
        return calculateTaskBand(mapped);
    }, [scores, isVoided, taskNumber]);

    const handleScore = (key: keyof typeof scores, value: number) => {
        if (isVoided) return;
        // Toggle — deselect if already selected
        const newVal = scores[key] === value ? null : value;
        onChange({ ...scores, [key]: newVal });
    };

    return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: isVoided ? '#f8fafc' : '#fff',
            opacity: isVoided ? 0.5 : 1,
            pointerEvents: isVoided ? 'none' : 'auto',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid #f1f5f9',
            }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>
                    Task {taskNumber} Criteria
                </span>
                {taskBand !== null && (
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                    }}>
                        Band {taskBand}
                    </span>
                )}
            </div>

            {/* Criteria rows */}
            {CRITERIA.map(criterion => {
                const label = taskNumber === 1 ? criterion.label1 : criterion.label2;
                const currentVal = scores[criterion.key];

                return (
                    <div key={criterion.key} style={{ marginBottom: '0.75rem' }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px',
                        }}>
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: criterion.color,
                            }}>
                                {label}
                            </span>
                            {currentVal !== null && (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {currentVal}/9
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                            {Array.from({ length: 10 }, (_, i) => {
                                const isSelected = currentVal === i;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleScore(criterion.key, i)}
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '6px',
                                            border: isSelected ? `2px solid ${criterion.color}` : '1px solid #e2e8f0',
                                            background: isSelected ? `${criterion.color}15` : '#fff',
                                            color: isSelected ? criterion.color : '#64748b',
                                            fontSize: '0.8rem',
                                            fontWeight: isSelected ? 700 : 400,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            padding: 0,
                                        }}
                                    >
                                        {i}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
