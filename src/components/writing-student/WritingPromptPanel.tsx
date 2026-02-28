/**
 * WritingPromptPanel — PRD-0030 Task 3.1
 * Left panel showing task prompt, image, word minimum.
 * Mobile: collapsible floating button.
 * NO MANTINE.
 */

import { useState } from 'react';
import type { WritingTask } from '../../types/ielts-writing.types';
import './WritingTestPage.css';

interface WritingPromptPanelProps {
    task: WritingTask;
    taskNumber: number;
}

export default function WritingPromptPanel({ task, taskNumber }: WritingPromptPanelProps) {
    const [mobileOpen, setMobileOpen] = useState(false);

    const content = (
        <>
            <div className="wtp-prompt-header">
                <span className="wtp-task-label">WRITING TASK {taskNumber}</span>
                <span className="wtp-rec-time">
                    You should spend about {task.recommendedTimeMinutes || 20} minutes on this task
                </span>
            </div>

            {task.promptImageUrl && (
                <div className="wtp-prompt-image-wrapper">
                    <img
                        src={task.promptImageUrl}
                        alt={task.promptImageCaption || 'Task image'}
                        className="wtp-prompt-image"
                    />
                    {task.promptImageCaption && (
                        <p className="wtp-image-caption">{task.promptImageCaption}</p>
                    )}
                </div>
            )}

            <div className="wtp-prompt-text">
                {task.promptText}
            </div>

            <div className="wtp-word-min">
                Write at least <strong>{task.wordMinimum}</strong> words.
            </div>
        </>
    );

    return (
        <>
            {/* Desktop panel */}
            <div className="wtp-prompt-panel wtp-prompt-panel--desktop">
                {content}
            </div>

            {/* Mobile: floating button + overlay */}
            <button
                className="wtp-prompt-mobile-btn"
                onClick={() => setMobileOpen(true)}
            >
                📖 Show Prompt
            </button>
            {mobileOpen && (
                <div className="wtp-prompt-mobile-overlay" onClick={() => setMobileOpen(false)}>
                    <div className="wtp-prompt-mobile-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="wtp-prompt-mobile-close"
                            onClick={() => setMobileOpen(false)}
                        >
                            ✕
                        </button>
                        {content}
                    </div>
                </div>
            )}
        </>
    );
}
