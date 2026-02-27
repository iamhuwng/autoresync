/**
 * HomeworkEditModal
 * 
 * Modal for editing an existing homework assignment's settings:
 * - Title & description
 * - Scheduling (available from, due date)
 * - Config (timer, attempts, feedback timing, late submission)
 * - Status
 * 
 * Uses native HTML elements only (NO Mantine).
 */

import { useState, useEffect, useCallback } from 'react';
import { updateHomework } from '../../services/homeworkManager';
import type {
    HomeworkAssignment,
    HomeworkConfig,
    HomeworkScheduling,
    HomeworkStatus,
} from '../../types/homework.types';
import './HomeworkEditModal.css';

interface HomeworkEditModalProps {
    isOpen: boolean;
    homework: HomeworkAssignment | null;
    onClose: () => void;
    onSuccess: () => void;
}

/** Convert timestamp (ms) → `datetime-local` input value */
function tsToDateInput(ts: number | undefined): string {
    if (!ts) return '';
    const d = new Date(ts);
    // Adjust for local timezone offset
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return local.toISOString().slice(0, 16);
}

/** Convert `datetime-local` input value → timestamp (ms) */
function dateInputToTs(val: string): number | undefined {
    if (!val) return undefined;
    return new Date(val).getTime();
}

export function HomeworkEditModal({
    isOpen,
    homework,
    onClose,
    onSuccess,
}: HomeworkEditModalProps) {
    // ---------- Form state ----------
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [availableFrom, setAvailableFrom] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [timerMinutes, setTimerMinutes] = useState<string>('');
    const [maxAttempts, setMaxAttempts] = useState<string>('');
    const [feedbackTiming, setFeedbackTiming] = useState<HomeworkConfig['feedbackTiming']>('after_completion');
    const [lateSubmissionAllowed, setLateSubmissionAllowed] = useState(false);
    const [status, setStatus] = useState<HomeworkStatus>('active');

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // ---------- Populate form when homework changes ----------
    const populateForm = useCallback((hw: HomeworkAssignment) => {
        setTitle(hw.title || hw.materialTitle || '');
        setDescription(hw.description || '');
        setAvailableFrom(tsToDateInput(hw.scheduling.availableFrom));
        setDueDate(tsToDateInput(hw.scheduling.dueDate));
        setTimerMinutes(hw.config.timerMinutes != null ? String(hw.config.timerMinutes) : '');
        setMaxAttempts(hw.config.maxAttempts != null ? String(hw.config.maxAttempts) : '');
        setFeedbackTiming(hw.config.feedbackTiming);
        setLateSubmissionAllowed(hw.config.lateSubmissionAllowed);
        setStatus(hw.status);
        setError(null);
        setSuccessMsg(null);
    }, []);

    useEffect(() => {
        if (homework && isOpen) {
            populateForm(homework);
        }
    }, [homework, isOpen, populateForm]);

    // ---------- Handlers ----------
    const handleSave = async () => {
        if (!homework) return;

        // Validate due date
        const dueDateTs = dateInputToTs(dueDate);
        if (!dueDateTs) {
            setError('Due date is required.');
            return;
        }

        const availableFromTs = dateInputToTs(availableFrom);
        if (availableFromTs && dueDateTs <= availableFromTs) {
            setError('Due date must be after available date.');
            return;
        }

        setError(null);
        setSuccessMsg(null);
        setSaving(true);

        try {
            const updates: Partial<Omit<HomeworkAssignment, 'id' | 'createdAt' | 'createdBy'>> = {
                title,
                description,
                scheduling: {
                    availableFrom: availableFromTs,
                    dueDate: dueDateTs,
                } as HomeworkScheduling,
                config: {
                    timerMinutes: timerMinutes === '' ? null : parseInt(timerMinutes, 10),
                    maxAttempts: maxAttempts === '' ? null : parseInt(maxAttempts, 10),
                    feedbackTiming,
                    lateSubmissionAllowed,
                },
                status,
            };

            await updateHomework(homework.id, updates);
            setSuccessMsg('Homework updated successfully!');
            // Brief delay so user sees the success message
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 600);
        } catch (err: any) {
            console.error('Failed to save homework:', err);
            setError(err?.message || 'Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !saving) {
            onClose();
        }
    };

    // ---------- Render ----------
    if (!isOpen || !homework) return null;

    const materialTypeLabel =
        homework.materialType === 'thcs-test'
            ? 'THCS Test'
            : homework.materialType === 'test'
                ? 'IELTS Test'
                : 'Quiz';

    return (
        <div className="hw-edit-overlay" onClick={handleOverlayClick}>
            <div className="hw-edit-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="hw-edit-header">
                    <h2>✏️ Edit Homework</h2>
                    <button
                        className="hw-edit-close-btn"
                        onClick={onClose}
                        disabled={saving}
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="hw-edit-body">
                    {/* Error / Success banners */}
                    {error && <div className="hw-edit-error">{error}</div>}
                    {successMsg && <div className="hw-edit-success">{successMsg}</div>}

                    {/* Material info (read-only) */}
                    <div className="hw-edit-material-info">
                        <span className="material-icon">
                            {homework.materialType === 'thcs-test' ? '📝' : '📄'}
                        </span>
                        <div className="material-details">
                            <p className="material-name">{homework.materialTitle}</p>
                            <span className="material-type-badge">{materialTypeLabel}</span>
                        </div>
                    </div>

                    {/* Title */}
                    <div className="hw-edit-field">
                        <label htmlFor="hw-edit-title">Title</label>
                        <input
                            id="hw-edit-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Custom homework title (optional)"
                        />
                        <p className="field-hint">Leave blank to use the material title.</p>
                    </div>

                    {/* Description */}
                    <div className="hw-edit-field">
                        <label htmlFor="hw-edit-desc">Instructions / Description</label>
                        <textarea
                            id="hw-edit-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional instructions for students…"
                            rows={3}
                        />
                    </div>

                    {/* Scheduling */}
                    <h3 className="hw-edit-section-title">📅 Scheduling</h3>
                    <div className="hw-edit-row">
                        <div className="hw-edit-field">
                            <label htmlFor="hw-edit-avail">Available From</label>
                            <input
                                id="hw-edit-avail"
                                type="datetime-local"
                                value={availableFrom}
                                onChange={(e) => setAvailableFrom(e.target.value)}
                            />
                            <p className="field-hint">When students can start.</p>
                        </div>
                        <div className="hw-edit-field">
                            <label htmlFor="hw-edit-due">Due Date *</label>
                            <input
                                id="hw-edit-due"
                                type="datetime-local"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Configuration */}
                    <h3 className="hw-edit-section-title">⚙️ Configuration</h3>
                    <div className="hw-edit-row">
                        <div className="hw-edit-field">
                            <label htmlFor="hw-edit-timer">Time Limit (min)</label>
                            <input
                                id="hw-edit-timer"
                                type="number"
                                value={timerMinutes}
                                onChange={(e) => setTimerMinutes(e.target.value)}
                                placeholder="No limit"
                                min="1"
                            />
                        </div>
                        <div className="hw-edit-field">
                            <label htmlFor="hw-edit-attempts">Max Attempts</label>
                            <input
                                id="hw-edit-attempts"
                                type="number"
                                value={maxAttempts}
                                onChange={(e) => setMaxAttempts(e.target.value)}
                                placeholder="Unlimited"
                                min="1"
                            />
                        </div>
                    </div>

                    <div className="hw-edit-field">
                        <label htmlFor="hw-edit-feedback">Feedback Timing</label>
                        <select
                            id="hw-edit-feedback"
                            value={feedbackTiming}
                            onChange={(e) =>
                                setFeedbackTiming(e.target.value as HomeworkConfig['feedbackTiming'])
                            }
                        >
                            <option value="immediate">Show answers after each question</option>
                            <option value="after_completion">Show after completion</option>
                            <option value="after_deadline">Show after deadline</option>
                            <option value="never">Score only (no answers)</option>
                        </select>
                    </div>

                    <label className="hw-edit-checkbox">
                        <input
                            type="checkbox"
                            checked={lateSubmissionAllowed}
                            onChange={(e) => setLateSubmissionAllowed(e.target.checked)}
                        />
                        <span>⏰ Allow late submissions</span>
                    </label>

                    {/* Status */}
                    <h3 className="hw-edit-section-title">📊 Status</h3>
                    <div className="hw-edit-field">
                        <label htmlFor="hw-edit-status">Homework Status</label>
                        <select
                            id="hw-edit-status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as HomeworkStatus)}
                        >
                            <option value="draft">📝 Draft</option>
                            <option value="scheduled">⏰ Scheduled</option>
                            <option value="active">✅ Active</option>
                            <option value="past_due">⚠️ Past Due</option>
                            <option value="closed">🔒 Closed</option>
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="hw-edit-footer">
                    <button
                        className="hw-edit-cancel-btn"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        className="hw-edit-save-btn"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving && <span className="spinner" />}
                        {saving ? 'Saving…' : '💾 Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default HomeworkEditModal;
