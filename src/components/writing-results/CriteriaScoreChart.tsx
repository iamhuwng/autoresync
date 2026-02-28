/**
 * CriteriaScoreChart — PRD-0030 Task 6.3
 * CSS-only horizontal bar chart for IELTS Writing criteria scores.
 * Full test: two bars per criterion (Task 1 light, Task 2 dark).
 * NO MANTINE. No external chart library.
 */

import type { WritingTaskGradingResult } from '../../types/ielts-writing.types';

interface CriteriaScoreChartProps {
    perTask: WritingTaskGradingResult[];
}

const CRITERIA_CONFIG = [
    { key: 'TA', altKey: 'TR', label: 'Task Achievement / Response', color: '#3b82f6' },
    { key: 'CC', altKey: 'CC', label: 'Coherence & Cohesion', color: '#10b981' },
    { key: 'LR', altKey: 'LR', label: 'Lexical Resource', color: '#f97316' },
    { key: 'GRA', altKey: 'GRA', label: 'Grammatical Range & Accuracy', color: '#ef4444' },
];

export default function CriteriaScoreChart({ perTask }: CriteriaScoreChartProps) {
    const isFullTest = perTask.length > 1;

    return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: '#fff',
        }}>
            <div style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#475569',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                Criteria Scores
            </div>

            {/* Legend for full test */}
            {isFullTest && (
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '0.75rem',
                    fontSize: '0.7rem',
                    color: '#64748b',
                }}>
                    <span>■ Task 1 (lighter)</span>
                    <span>■ Task 2 (darker)</span>
                </div>
            )}

            {CRITERIA_CONFIG.map(criterion => {
                // Get scores from each task
                const bars: Array<{ taskNum: number; score: number; isVoided: boolean }> = [];

                for (const task of perTask) {
                    const scores = task.criteriaScores;
                    const score = (scores as Record<string, number | undefined>)[criterion.key]
                        ?? (scores as Record<string, number | undefined>)[criterion.altKey]
                        ?? 0;
                    bars.push({
                        taskNum: task.taskNumber,
                        score: task.isVoided ? 0 : score,
                        isVoided: task.isVoided,
                    });
                }

                return (
                    <div key={criterion.key} style={{ marginBottom: '0.65rem' }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '4px',
                        }}>
                            <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: criterion.color,
                            }}>
                                {criterion.label}
                            </span>
                        </div>

                        {bars.map((bar, i) => (
                            <div
                                key={bar.taskNum}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: i < bars.length - 1 ? '3px' : 0,
                                }}
                            >
                                {isFullTest && (
                                    <span style={{
                                        fontSize: '0.65rem',
                                        color: '#94a3b8',
                                        width: '18px',
                                        flexShrink: 0,
                                    }}>
                                        T{bar.taskNum}
                                    </span>
                                )}

                                <div style={{
                                    flex: 1,
                                    height: '24px',
                                    borderRadius: '4px',
                                    background: '#f1f5f9',
                                    overflow: 'hidden',
                                    position: 'relative',
                                }}>
                                    {bar.isVoided ? (
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.65rem',
                                            color: '#94a3b8',
                                            fontStyle: 'italic',
                                        }}>
                                            Voided
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${(bar.score / 9) * 100}%`,
                                                borderRadius: '4px',
                                                background: criterion.color,
                                                opacity: i === 0 ? 0.65 : 1,
                                                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-end',
                                                paddingRight: '6px',
                                                minWidth: bar.score > 0 ? '28px' : '0',
                                            }}
                                        >
                                            {bar.score > 0 && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    color: '#fff',
                                                }}>
                                                    {bar.score}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
