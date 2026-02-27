/**
 * WritingSubmitModal — PRD-0030 Task 3.6
 * Confirmation modal before submitting writing test.
 * Shows word counts per task.
 * NO MANTINE.
 */

import './WritingTestPage.css';

interface WritingSubmitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    tasks: Array<{ taskNumber: number; wordCount: number }>;
}

export default function WritingSubmitModal({ isOpen, onClose, onConfirm, tasks }: WritingSubmitModalProps) {
    if (!isOpen) return null;

    return (
        <div className="wtp-submit-overlay">
            <div className="wtp-submit-modal">
                <h2>Submit Writing Test?</h2>
                <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                    Please review your word counts before submitting.
                    You cannot edit your essays after submission.
                </p>

                <div className="wtp-submit-tasks">
                    {tasks.map((t) => (
                        <div key={t.taskNumber} className="wtp-submit-task-row">
                            <span>Task {t.taskNumber}</span>
                            <span style={{ fontWeight: 600, color: t.wordCount < 150 ? '#f59e0b' : '#10b981' }}>
                                {t.wordCount} words
                            </span>
                        </div>
                    ))}
                </div>

                <div className="wtp-submit-actions">
                    <button className="wtp-submit-btn wtp-submit-btn--cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="wtp-submit-btn wtp-submit-btn--confirm" onClick={onConfirm}>
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
}
