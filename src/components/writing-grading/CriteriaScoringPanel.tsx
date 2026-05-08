/**
 * CriteriaScoringPanel - editing-mode scoring rail for IELTS writing.
 * Uses 0.5-step criterion controls to match the active Stitch workspace.
 * NO MANTINE.
 */

import './CriteriaScoringPanel.css';

interface CriteriaScoringPanelProps {
    taskNumber: 1 | 2;
    scores: {
        ta: number | null;
        cc: number | null;
        lr: number | null;
        gra: number | null;
    };
    onChange: (scores: CriteriaScoringPanelProps['scores']) => void;
    isVoided?: boolean;
}

const CRITERIA = [
    { key: 'ta' as const, label1: 'Task Achievement', label2: 'Task Response', short1: 'TA', short2: 'TR' },
    { key: 'cc' as const, label1: 'Coherence & Cohesion', label2: 'Coherence & Cohesion', short1: 'CC', short2: 'CC' },
    { key: 'lr' as const, label1: 'Lexical Resource', label2: 'Lexical Resource', short1: 'LR', short2: 'LR' },
    { key: 'gra' as const, label1: 'Grammatical Range & Accuracy', label2: 'Grammatical Range & Accuracy', short1: 'GRA', short2: 'GRA' },
];

function formatScore(value: number | null) {
    return value === null ? '--' : value.toFixed(1);
}

export default function CriteriaScoringPanel({
    taskNumber,
    scores,
    onChange,
    isVoided = false,
}: CriteriaScoringPanelProps) {
    const handleScore = (key: keyof typeof scores, value: string) => {
        if (isVoided) {
            return;
        }

        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed)) {
            return;
        }

        onChange({ ...scores, [key]: parsed });
    };

    return (
        <section className={`criteria-scoring-panel ${isVoided ? 'criteria-scoring-panel--voided' : ''}`}>
            <div className="criteria-scoring-panel__grid">
                {CRITERIA.map((criterion) => {
                    const label = taskNumber === 1 ? criterion.label1 : criterion.label2;
                    const shortLabel = taskNumber === 1 ? criterion.short1 : criterion.short2;
                    const currentVal = scores[criterion.key];

                    return (
                        <div key={criterion.key} className="criteria-scoring-panel__card">
                            <div className="criteria-scoring-panel__header">
                                <label className="criteria-scoring-panel__label" htmlFor={`criterion-${criterion.key}`}>
                                    {label} ({shortLabel})
                                </label>
                                <span className={`criteria-scoring-panel__value ${currentVal === null ? 'is-unset' : ''}`}>
                                    {formatScore(currentVal)}
                                </span>
                            </div>

                            <input
                                id={`criterion-${criterion.key}`}
                                className="criteria-scoring-panel__slider"
                                type="range"
                                min="0"
                                max="9"
                                step="0.5"
                                value={currentVal ?? 0}
                                onChange={(event) => handleScore(criterion.key, event.target.value)}
                                aria-label={`${label} (${shortLabel})`}
                            />

                            <div className="criteria-scoring-panel__range-labels" aria-hidden="true">
                                <span>Band 0</span>
                                <span>Band 9</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
