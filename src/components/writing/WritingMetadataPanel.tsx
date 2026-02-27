/**
 * WritingMetadataPanel — PRD-0030 Task 2.1
 * Form panel for IELTS Writing test metadata.
 * NO MANTINE — uses native HTML/CSS only.
 */

import type { WritingTestMetadata, WritingTestFormat } from '../../types/ielts-writing.types';
import './WritingTestBuilder.css';

interface WritingMetadataPanelProps {
    value: WritingTestMetadata;
    onChange: (updated: WritingTestMetadata) => void;
}

const FORMAT_OPTIONS: { value: WritingTestFormat; label: string; description: string }[] = [
    { value: 'task1-only', label: 'Task 1 Only', description: 'Graph/Chart/Diagram description (150+ words)' },
    { value: 'task2-only', label: 'Task 2 Only', description: 'Essay writing (250+ words)' },
    { value: 'full-test', label: 'Full Test', description: 'Both Task 1 & Task 2' },
];

export default function WritingMetadataPanel({ value, onChange }: WritingMetadataPanelProps) {
    const update = <K extends keyof WritingTestMetadata>(key: K, val: WritingTestMetadata[K]) => {
        onChange({ ...value, [key]: val });
    };

    return (
        <div className="wtb-panel">
            <h3 className="wtb-panel-title">Test Metadata</h3>

            {/* Title */}
            <label className="wtb-label">
                Title <span className="wtb-required">*</span>
                <input
                    type="text"
                    className="wtb-input"
                    value={value.title}
                    onChange={(e) => update('title', e.target.value)}
                    placeholder="e.g., IELTS Writing Practice — Line Graphs"
                    required
                />
            </label>

            {/* Description */}
            <label className="wtb-label">
                Description
                <textarea
                    className="wtb-textarea"
                    value={value.description || ''}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="Optional description for students"
                    rows={2}
                />
            </label>

            {/* Duration */}
            <label className="wtb-label">
                Duration (minutes) <span className="wtb-required">*</span>
                <input
                    type="number"
                    className="wtb-input wtb-input-short"
                    value={value.duration}
                    onChange={(e) => update('duration', Math.max(1, parseInt(e.target.value) || 60))}
                    min={1}
                    max={180}
                />
            </label>

            {/* Format */}
            <fieldset className="wtb-fieldset">
                <legend className="wtb-legend">Test Format <span className="wtb-required">*</span></legend>
                <div className="wtb-radio-group">
                    {FORMAT_OPTIONS.map((opt) => (
                        <label key={opt.value} className={`wtb-radio-card ${value.format === opt.value ? 'wtb-radio-card--active' : ''}`}>
                            <input
                                type="radio"
                                name="writing-format"
                                value={opt.value}
                                checked={value.format === opt.value}
                                onChange={() => update('format', opt.value)}
                            />
                            <div>
                                <strong>{opt.label}</strong>
                                <span className="wtb-radio-desc">{opt.description}</span>
                            </div>
                        </label>
                    ))}
                </div>
            </fieldset>

            {/* Difficulty */}
            <label className="wtb-label">
                Difficulty
                <select
                    className="wtb-select"
                    value={value.difficulty || ''}
                    onChange={(e) => update('difficulty', (e.target.value || undefined) as WritingTestMetadata['difficulty'])}
                >
                    <option value="">Not set</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                </select>
            </label>

            {/* Target Band */}
            <label className="wtb-label">
                Target Band
                <input
                    type="number"
                    className="wtb-input wtb-input-short"
                    value={value.targetBand || ''}
                    onChange={(e) => update('targetBand', parseFloat(e.target.value) || undefined)}
                    min={0}
                    max={9}
                    step={0.5}
                    placeholder="e.g., 6.5"
                />
            </label>

            {/* Tags */}
            <label className="wtb-label">
                Tags
                <input
                    type="text"
                    className="wtb-input"
                    value={(value.tags || []).join(', ')}
                    onChange={(e) => update('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    placeholder="e.g., academic, line-graph, environment"
                />
            </label>
        </div>
    );
}
