/**
 * WritingTaskPanel — PRD-0030 Task 2.2
 * Panel for a single writing task (Task 1 or Task 2).
 * Image upload via R2 Storage (Task 1 only).
 * NO MANTINE.
 */

import React, { useState } from 'react';
import r2StorageService from '../../services/r2Storage';
import type {
    WritingTask,
    WritingTask1Type,
    WritingTask2Type,
} from '../../types/ielts-writing.types';
import './WritingTestBuilder.css';

/** Extended task type with UI-only _imageKey for temp→permanent tracking */
export type WritingTaskWithKey = WritingTask & { _imageKey?: string };

interface WritingTaskPanelProps {
    taskNumber: 1 | 2;
    task: WritingTaskWithKey;
    onChange: (task: WritingTaskWithKey) => void;
}

const TASK1_TYPES: { value: WritingTask1Type; label: string }[] = [
    { value: 'bar-chart', label: 'Bar Chart' },
    { value: 'line-graph', label: 'Line Graph' },
    { value: 'pie-chart', label: 'Pie Chart' },
    { value: 'table', label: 'Table' },
    { value: 'process-diagram', label: 'Process Diagram' },
    { value: 'map', label: 'Map' },
    { value: 'mixed', label: 'Mixed' },
];

const TASK2_TYPES: { value: WritingTask2Type; label: string }[] = [
    { value: 'opinion', label: 'Opinion' },
    { value: 'discussion', label: 'Discussion' },
    { value: 'problem-solution', label: 'Problem/Solution' },
    { value: 'advantages-disadvantages', label: 'Advantages/Disadvantages' },
    { value: 'two-part-question', label: 'Two-Part Question' },
];

const MAX_PROMPT_CHARS = 2000;

export default function WritingTaskPanel({ taskNumber, task, onChange }: WritingTaskPanelProps) {
    const [uploading, setUploading] = useState(false);
    const [imageUrlInput, setImageUrlInput] = useState('');
    const [showModelAnswer, setShowModelAnswer] = useState(false);

    const types = taskNumber === 1 ? TASK1_TYPES : TASK2_TYPES;

    const update = <K extends keyof WritingTaskWithKey>(key: K, val: WritingTaskWithKey[K]) => {
        onChange({ ...task, [key]: val });
    };

    // [R2] Image upload handler
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (≤5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be 5MB or smaller.');
            return;
        }

        setUploading(true);
        try {
            const result = await r2StorageService.uploadImage(file, 'images');
            onChange({ ...task, promptImageUrl: result.url, _imageKey: result.key });
        } catch (err) {
            console.error('Image upload failed:', err);
            alert('Failed to upload image. Please try again.');
        } finally {
            setUploading(false);
            // Reset file input
            e.target.value = '';
        }
    };

    const handlePasteUrl = () => {
        if (imageUrlInput.trim()) {
            onChange({ ...task, promptImageUrl: imageUrlInput.trim(), _imageKey: undefined });
            setImageUrlInput('');
        }
    };

    const handleDeleteImage = () => {
        onChange({ ...task, promptImageUrl: undefined, _imageKey: undefined, promptImageCaption: undefined });
    };

    return (
        <div className="wtb-panel">
            <div className="wtb-task-header">
                <h3 className="wtb-panel-title" style={{ border: 'none', padding: 0, margin: 0 }}>
                    Task {taskNumber}
                </h3>
                <span className="wtb-task-badge">
                    {taskNumber === 1 ? '📊 Data Description' : '✍️ Essay'}
                </span>
            </div>

            {/* Task Type */}
            <label className="wtb-label">
                Task Type
                <select
                    className="wtb-select"
                    value={task.taskType}
                    onChange={(e) => update('taskType', e.target.value as WritingTask1Type | WritingTask2Type)}
                >
                    {types.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </label>

            {/* Prompt Text */}
            <label className="wtb-label">
                Prompt / Instructions <span className="wtb-required">*</span>
                <textarea
                    className="wtb-textarea wtb-textarea--tall"
                    value={task.promptText}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_PROMPT_CHARS) {
                            update('promptText', e.target.value);
                        }
                    }}
                    placeholder="Enter the writing prompt for students..."
                    rows={6}
                />
                <span className="wtb-text-counter">
                    {task.promptText.length}/{MAX_PROMPT_CHARS}
                </span>
            </label>

            {/* Image Section (Task 1 Only) */}
            {taskNumber === 1 && (
                <div className="wtb-image-section">
                    <strong style={{ fontSize: 14, color: '#334155' }}>
                        📷 Image (Graph / Chart / Diagram)
                    </strong>

                    {task.promptImageUrl && (
                        <div>
                            <img
                                src={task.promptImageUrl}
                                alt={task.promptImageCaption || 'Task 1 image'}
                                className="wtb-image-preview"
                            />
                        </div>
                    )}

                    <div className="wtb-image-actions">
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileUpload}
                            className="wtb-file-input"
                            disabled={uploading}
                        />
                        {uploading && <span style={{ fontSize: 13, color: '#3b82f6' }}>Uploading...</span>}

                        <span className="wtb-or">or</span>

                        <input
                            type="text"
                            className="wtb-input"
                            value={imageUrlInput}
                            onChange={(e) => setImageUrlInput(e.target.value)}
                            placeholder="Paste image URL"
                            style={{ flex: 1, minWidth: 200 }}
                        />
                        <button
                            type="button"
                            className="wtb-btn wtb-btn--outline"
                            onClick={handlePasteUrl}
                            disabled={!imageUrlInput.trim()}
                        >
                            Use URL
                        </button>

                        {task.promptImageUrl && (
                            <button type="button" className="wtb-delete-btn" onClick={handleDeleteImage}>
                                Remove Image
                            </button>
                        )}
                    </div>

                    {task.promptImageUrl && (
                        <label className="wtb-label">
                            Image Caption (alt text)
                            <input
                                type="text"
                                className="wtb-input"
                                value={task.promptImageCaption || ''}
                                onChange={(e) => update('promptImageCaption', e.target.value)}
                                placeholder="e.g., Line graph showing temperature changes from 2000 to 2020"
                            />
                        </label>
                    )}
                </div>
            )}

            {/* Word Minimum & Recommended Time */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label className="wtb-label" style={{ flex: 1, minWidth: 140 }}>
                    Minimum Words
                    <input
                        type="number"
                        className="wtb-input wtb-input-short"
                        value={task.wordMinimum}
                        onChange={(e) => update('wordMinimum', Math.max(1, parseInt(e.target.value) || (taskNumber === 1 ? 150 : 250)))}
                        min={1}
                    />
                </label>
                <label className="wtb-label" style={{ flex: 1, minWidth: 140 }}>
                    Recommended Time (min)
                    <input
                        type="number"
                        className="wtb-input wtb-input-short"
                        value={task.recommendedTimeMinutes}
                        onChange={(e) => update('recommendedTimeMinutes', Math.max(1, parseInt(e.target.value) || (taskNumber === 1 ? 20 : 40)))}
                        min={1}
                    />
                </label>
            </div>

            {/* Model Answer (Expandable) */}
            <div className="wtb-expandable">
                <button
                    type="button"
                    className="wtb-expandable-header"
                    onClick={() => setShowModelAnswer(!showModelAnswer)}
                >
                    <span>📝 Model Answer (Optional)</span>
                    <span>{showModelAnswer ? '▲' : '▼'}</span>
                </button>
                {showModelAnswer && (
                    <div className="wtb-expandable-body">
                        <textarea
                            className="wtb-textarea wtb-textarea--tall"
                            value={task.modelAnswer || ''}
                            onChange={(e) => update('modelAnswer', e.target.value)}
                            placeholder="Enter a model answer for reference..."
                            rows={8}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 14 }}>
                            <input
                                type="checkbox"
                                checked={task.showModelAnswerToStudent}
                                onChange={(e) => update('showModelAnswerToStudent', e.target.checked)}
                            />
                            Show model answer to student after grading
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
}
