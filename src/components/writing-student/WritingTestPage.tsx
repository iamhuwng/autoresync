/**
 * WritingTestPage — PRD-0030 Task 3.7 & 3.8
 * Student writing test interface for live sessions.
 * [GAP-11] Props: testData, sessionCode.
 * [GAP-12] Auth from useAuth().
 * NO MANTINE.
 */

import { useState, useEffect, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import WritingPromptPanel from './WritingPromptPanel';
import WritingEditor from './WritingEditor';
import WritingSubmitModal from './WritingSubmitModal';
import { useActiveTimeTracking } from '../../hooks/useActiveTimeTracking';
import { useWritingAutoSave } from '../../hooks/useWritingAutoSave';
import { autoSubmitFromRTDB } from '../../services/writingSubmissionService';
import type { IELTSWritingTest } from '../../types/ielts-writing.types';
import './WritingTestPage.css';

interface WritingTestPageProps {
    testData: IELTSWritingTest;
    sessionCode: string;
}

export default function WritingTestPage({ testData, sessionCode }: WritingTestPageProps) {
    const { user } = useAuth();
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    // [GAP-10] taskCount is CONSTANT for session lifetime
    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const hasBothTasks = taskCount === 2;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';

    // State
    const [activeTask, setActiveTask] = useState<1 | 2>(showTask1 ? 1 : 2);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [submitted, setSubmitted] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Hooks
    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const autoSave = useWritingAutoSave(sessionCode, studentId);

    // Load saved state on mount (reconnect)
    useEffect(() => {
        let cancelled = false;
        autoSave.loadSavedState().then((saved) => {
            if (cancelled || !saved) return;
            setEssays({
                1: saved.task1Text || '',
                2: saved.task2Text || '',
            });
            if (saved.activeTask === 1 || saved.activeTask === 2) {
                setActiveTask(saved.activeTask as 1 | 2);
            }
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // [Task 3.7] Teacher reopen subscription
    useEffect(() => {
        if (!studentId || !sessionCode) return;
        const reopenRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentId}/writing/reopened`
        );
        const unsub = onValue(reopenRef, (snap) => {
            if (snap.val() === true) {
                setSubmitted(false);
            }
        });
        return () => unsub();
    }, [sessionCode, studentId]);

    // beforeunload warning
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (essays[1] || essays[2]) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [essays]);

    // Essay change handler
    const handleEssayChange = useCallback((text: string) => {
        setEssays(prev => ({ ...prev, [activeTask]: text }));
        activeTime.onKeystroke(activeTask);
        autoSave.saveTask(activeTask, text);
    }, [activeTask, activeTime, autoSave]);

    // Tab switch
    const handleTabSwitch = useCallback((taskNum: 1 | 2) => {
        autoSave.flushPendingSave();
        autoSave.saveActiveTab(taskNum);
        activeTime.switchTask(taskNum);
        setActiveTask(taskNum);
    }, [autoSave, activeTime]);

    // Get word counts
    const getWordCount = (text: string) => {
        return text.trim() ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    };

    // Submit flow
    const handleSubmit = async () => {
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            // Flush auto-save
            autoSave.flushPendingSave();

            // [Task 3.8] Call centralized auto-submit function
            await autoSubmitFromRTDB(sessionCode, studentId, studentName, testData);

            setSubmitted(true);
        } catch (err) {
            console.error('Submit failed:', err);
            alert('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Get current task data — testData always has at least one task
    const currentTestTask = (testData.tasks.find(t => t.taskNumber === activeTask) || testData.tasks[0])!;

    // Build submit task list
    const submitTasks = testData.tasks
        .filter(t => {
            if (testData.metadata.format === 'task1-only') return t.taskNumber === 1;
            if (testData.metadata.format === 'task2-only') return t.taskNumber === 2;
            return true;
        })
        .map(t => ({
            taskNumber: t.taskNumber,
            wordCount: getWordCount(essays[t.taskNumber as 1 | 2] || ''),
        }));

    // Submitted overlay
    if (submitted) {
        return (
            <div className="wtp-submitted-overlay">
                <div style={{ fontSize: 64 }}>✅</div>
                <h1>Test Submitted</h1>
                <p>Your writing test has been submitted for review.</p>
            </div>
        );
    }

    return (
        <div className="wtp-page">
            {/* Tab Bar (only if multiple tasks) */}
            {hasBothTasks && (
                <div className="wtp-tab-bar">
                    {showTask1 && (
                        <button
                            className={`wtp-tab ${activeTask === 1 ? 'wtp-tab--active' : ''}`}
                            onClick={() => handleTabSwitch(1)}
                        >
                            Task 1 ({getWordCount(essays[1])} words)
                        </button>
                    )}
                    {showTask2 && (
                        <button
                            className={`wtp-tab ${activeTask === 2 ? 'wtp-tab--active' : ''}`}
                            onClick={() => handleTabSwitch(2)}
                        >
                            Task 2 ({getWordCount(essays[2])} words)
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                        className="wtp-tab"
                        style={{ color: '#3b82f6', fontWeight: 600 }}
                        onClick={() => setShowSubmitModal(true)}
                        disabled={submitting}
                    >
                        {submitting ? 'Submitting...' : '📤 Submit'}
                    </button>
                </div>
            )}

            {/* Submit button for single-task formats */}
            {!hasBothTasks && (
                <div className="wtp-tab-bar">
                    <span className="wtp-tab wtp-tab--active">
                        Task {activeTask} ({getWordCount(essays[activeTask])} words)
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                        className="wtp-tab"
                        style={{ color: '#3b82f6', fontWeight: 600 }}
                        onClick={() => setShowSubmitModal(true)}
                        disabled={submitting}
                    >
                        {submitting ? 'Submitting...' : '📤 Submit'}
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="wtp-main">
                <WritingPromptPanel
                    task={currentTestTask}
                    taskNumber={activeTask}
                />
                <WritingEditor
                    value={essays[activeTask]}
                    onChange={handleEssayChange}
                    disabled={submitted || submitting}
                />
            </div>

            {/* Submit Modal */}
            <WritingSubmitModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onConfirm={handleSubmit}
                tasks={submitTasks}
            />
        </div>
    );
}
