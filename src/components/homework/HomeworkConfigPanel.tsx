import { useState, useEffect } from 'react';
import type { HomeworkConfig } from '../../types/homework.types';
import './HomeworkConfigPanel.css';

interface HomeworkConfigPanelProps {
    config: HomeworkConfig;
    onChange: (config: HomeworkConfig) => void;
    materialDefaults?: {
        timerMinutes?: number;
        maxAttempts?: number;
    };
    onSaveAsTemplate?: () => void;
}

/**
 * HomeworkConfigPanel
 * 
 * Panel for configuring homework settings.
 * Only manages HomeworkConfig properties - dates are handled separately.
 */
export function HomeworkConfigPanel({
    config,
    onChange,
    materialDefaults,
    onSaveAsTemplate,
}: HomeworkConfigPanelProps) {
    const [localConfig, setLocalConfig] = useState<HomeworkConfig>(config);

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const handleChange = (updates: Partial<HomeworkConfig>) => {
        const newConfig = { ...localConfig, ...updates };
        setLocalConfig(newConfig);
        onChange(newConfig);
    };

    const handleTimerChange = (value: string) => {
        const minutes = value === '' ? null : parseInt(value, 10);
        handleChange({ timerMinutes: isNaN(minutes!) ? null : minutes });
    };

    const handleMaxAttemptsChange = (value: string) => {
        const attempts = value === '' ? null : parseInt(value, 10);
        handleChange({ maxAttempts: isNaN(attempts!) ? null : attempts });
    };

    return (
        <div className="homework-config-panel">
            {/* Timer Configuration */}
            <div className="config-section">
                <label className="config-label">
                    <span className="label-text">⏱️ Time Limit (minutes)</span>
                    {materialDefaults?.timerMinutes && (
                        <span className="default-hint">
                            Material default: {materialDefaults.timerMinutes} min
                        </span>
                    )}
                </label>
                <input
                    type="number"
                    className="config-input"
                    value={localConfig.timerMinutes ?? ''}
                    onChange={(e) => handleTimerChange(e.target.value)}
                    placeholder="No time limit"
                    min="1"
                />
                <p className="config-hint">Leave empty for no time limit</p>
            </div>

            {/* Max Attempts Configuration */}
            <div className="config-section">
                <label className="config-label">
                    <span className="label-text">🔄 Maximum Attempts</span>
                    {materialDefaults?.maxAttempts && (
                        <span className="default-hint">
                            Material default: {materialDefaults.maxAttempts}
                        </span>
                    )}
                </label>
                <input
                    type="number"
                    className="config-input"
                    value={localConfig.maxAttempts ?? ''}
                    onChange={(e) => handleMaxAttemptsChange(e.target.value)}
                    placeholder="Unlimited attempts"
                    min="1"
                />
                <p className="config-hint">Leave empty for unlimited attempts</p>
            </div>

            {/* Feedback Timing */}
            <div className="config-section">
                <label className="config-label">
                    <span className="label-text">📊 Feedback Timing</span>
                </label>
                <select
                    className="config-select"
                    value={localConfig.feedbackTiming}
                    onChange={(e) =>
                        handleChange({
                            feedbackTiming: e.target.value as HomeworkConfig['feedbackTiming'],
                        })
                    }
                >
                    <option value="immediate">Show answers after each question</option>
                    <option value="after_completion">Show answers after completion</option>
                    <option value="after_deadline">Show answers after deadline</option>
                    <option value="never">Only show score (no answers)</option>
                </select>
                <p className="config-hint">
                    {localConfig.feedbackTiming === 'immediate' &&
                        'Students see correct answers immediately after each question'}
                    {localConfig.feedbackTiming === 'after_completion' &&
                        'Students see correct answers after completing the test'}
                    {localConfig.feedbackTiming === 'after_deadline' &&
                        'Students must wait until deadline to see answers'}
                    {localConfig.feedbackTiming === 'never' &&
                        'Students only see their score, never the answers'}
                </p>
            </div>

            {/* Late Submission Toggle */}
            <div className="config-section">
                <label className="config-checkbox">
                    <input
                        type="checkbox"
                        checked={localConfig.lateSubmissionAllowed}
                        onChange={(e) =>
                            handleChange({ lateSubmissionAllowed: e.target.checked })
                        }
                    />
                    <span className="checkbox-label">⏰ Allow late submissions</span>
                </label>
                <p className="config-hint">
                    {localConfig.lateSubmissionAllowed
                        ? 'Students can submit after the deadline (marked as late)'
                        : 'Submissions locked after deadline'}
                </p>
            </div>

            {/* Save as Template */}
            {onSaveAsTemplate && (
                <div className="config-actions">
                    <button
                        type="button"
                        className="save-template-btn"
                        onClick={onSaveAsTemplate}
                    >
                        💾 Save as Template
                    </button>
                </div>
            )}
        </div>
    );
}
