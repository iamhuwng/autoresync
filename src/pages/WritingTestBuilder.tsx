/**
 * WritingTestBuilder — PRD-0030 Task 2.4 & 2.5
 * Main page component for creating/editing IELTS Writing tests.
 * [GAP-06] Auto-save with useRef debounce timer.
 * [GAP-07] Reads draftId from URL params.
 * NO MANTINE.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { buildRoute } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';
import WritingMetadataPanel from '../components/writing/WritingMetadataPanel';
import WritingTaskPanel from '../components/writing/WritingTaskPanel';
import type { WritingTaskWithKey } from '../components/writing/WritingTaskPanel';
import WritingValidationSummary, { validateWritingTest } from '../components/writing/WritingValidationSummary';
import {
    saveWritingDraft,
    getWritingDraft,
    publishWritingTest,
} from '../services/writingTestService';
import r2StorageService from '../services/r2Storage';
import type { WritingTestMetadata, WritingTask } from '../types/ielts-writing.types';
import '../components/writing/WritingTestBuilder.css';

const DEFAULT_TASK1: WritingTaskWithKey = {
    taskNumber: 1,
    taskType: 'line-graph',
    promptText: '',
    wordMinimum: 150,
    recommendedTimeMinutes: 20,
    showModelAnswerToStudent: false,
};

const DEFAULT_TASK2: WritingTaskWithKey = {
    taskNumber: 2,
    taskType: 'opinion',
    promptText: '',
    wordMinimum: 250,
    recommendedTimeMinutes: 40,
    showModelAnswerToStudent: false,
};

const DEFAULT_METADATA: WritingTestMetadata = {
    title: '',
    duration: 60,
    format: 'full-test',
};

export default function WritingTestBuilder() {
    const { draftId } = useParams<{ draftId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [metadata, setMetadata] = useState<WritingTestMetadata>(DEFAULT_METADATA);
    const [task1, setTask1] = useState<WritingTaskWithKey>(DEFAULT_TASK1);
    const [task2, setTask2] = useState<WritingTaskWithKey>(DEFAULT_TASK2);
    const [saveStatus, setSaveStatus] = useState<string>('');
    const [publishing, setPublishing] = useState(false);
    const [showPublishDialog, setShowPublishDialog] = useState(false);
    const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);
    const [loading, setLoading] = useState(!!draftId);
    const [loadError, setLoadError] = useState<string | null>(null);

    // [GAP-06] Auto-save debounce using useRef — NOT useState
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Load existing draft on edit mode
    useEffect(() => {
        if (!draftId) return;
        let cancelled = false;

        (async () => {
            setLoading(true);
            setLoadError(null);
            const result = await getWritingDraft(draftId);
            if (cancelled) return;

            if (result.success && result.data) {
                const draft = result.data;
                setMetadata({ ...DEFAULT_METADATA, ...draft.metadata });

                const t1 = draft.tasks.find(t => t.taskNumber === 1);
                const t2 = draft.tasks.find(t => t.taskNumber === 2);
                if (t1) setTask1({ ...DEFAULT_TASK1, ...t1 });
                if (t2) setTask2({ ...DEFAULT_TASK2, ...t2 });
                setCurrentDraftId(draftId);
            } else {
                setLoadError(result.error || 'Failed to load writing draft.');
            }
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [draftId]);

    // Get active tasks based on format
    const getActiveTasks = useCallback((): WritingTaskWithKey[] => {
        switch (metadata.format) {
            case 'task1-only': return [task1];
            case 'task2-only': return [task2];
            case 'full-test': return [task1, task2];
            default: return [task1, task2];
        }
    }, [metadata.format, task1, task2]);

    // Validation
    const validationState = validateWritingTest(metadata, getActiveTasks());

    const userId = user?.uid || '';

    // [GAP-06] Auto-save with useRef debounce
    useEffect(() => {
        if (!userId || loading) return;

        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
            setSaveStatus('Saving...');
            const tasks: WritingTask[] = getActiveTasks().map(({ _imageKey, ...rest }) => rest);
            const result = await saveWritingDraft(userId, {
                id: currentDraftId,
                metadata,
                tasks,
            });
            if (result.success) {
                if (result.draftId && !currentDraftId) {
                    setCurrentDraftId(result.draftId);
                }
                setSaveStatus('Saved ✓');
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                setSaveStatus('Save failed');
            }
        }, 2000);

        return () => clearTimeout(autoSaveTimerRef.current);
    }, [metadata, task1, task2, userId, currentDraftId, loading, getActiveTasks]);

    // Manual save
    const handleSave = async () => {
        if (!userId) {
            alert('You must be signed in to save this draft.');
            return;
        }
        setSaveStatus('Saving...');
        const tasks: WritingTask[] = getActiveTasks().map(({ _imageKey, ...rest }) => rest);
        const result = await saveWritingDraft(userId, {
            id: currentDraftId,
            metadata,
            tasks,
        });
        if (result.success) {
            if (result.draftId) setCurrentDraftId(result.draftId);
            setSaveStatus('Saved ✓');
        } else {
            setSaveStatus('Save failed');
        }
    };

    // [Task 2.5] Publish flow
    const handlePublish = async () => {
        if (!userId) {
            alert('You must be signed in to publish this test.');
            return;
        }

        // Check blocking errors
        if (validationState.errors.length > 0) {
            alert('Please fix all validation errors before publishing.');
            return;
        }

        // Warnings confirmation
        if (validationState.warnings.length > 0) {
            const proceed = window.confirm(
                `There are ${validationState.warnings.length} warning(s):\n\n` +
                validationState.warnings.join('\n') +
                '\n\nContinue publishing?'
            );
            if (!proceed) return;
        }

        setPublishing(true);

        try {
            // Move temp images to permanent (R2)
            const activeTasks = getActiveTasks();
            for (const task of activeTasks) {
                if (task._imageKey && r2StorageService.isTempFile(task._imageKey)) {
                    const moved = await r2StorageService.moveToPermanent(task._imageKey);
                    task.promptImageUrl = moved.newUrl;
                    delete task._imageKey;
                }
            }

            // Strip _imageKey from tasks before publishing
            const cleanTasks: WritingTask[] = activeTasks.map(({ _imageKey, ...rest }) => rest);

            const result = await publishWritingTest({
                id: currentDraftId || '',
                userId,
                testType: 'IELTS',
                skill: 'Writing',
                metadata,
                tasks: cleanTasks,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            if (result.success) {
                if (result.draftId) {
                    setCurrentDraftId(result.draftId);
                }
                setShowPublishDialog(true);
            } else {
                alert('Failed to publish: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Publish error:', err);
            alert('An error occurred while publishing.');
        } finally {
            setPublishing(false);
        }
    };

    if (loading) {
        return (
            <div className="wtb-page">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
                    <div className="wtb-spinner" />
                    <span style={{ marginLeft: 12, color: '#64748b' }}>Loading draft...</span>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="wtb-page">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                    <div className="wtb-dialog" style={{ maxWidth: 520 }}>
                        <h2>Unable to open draft</h2>
                        <p>{loadError}</p>
                        <div className="wtb-dialog-actions">
                            <button
                                className="wtb-btn wtb-btn--primary"
                                onClick={() => navigate(buildRoute('LOBBY'))}
                            >
                                Back to Materials
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="wtb-page">
            {/* Header */}
            <div className="wtb-header">
                <div className="wtb-header-left">
                    <button className="wtb-back-btn" onClick={() => navigate(-1)}>
                        ← Back
                    </button>
                    <h1 className="wtb-title">
                        {draftId ? 'Edit Writing Test' : 'Create Writing Test'}
                    </h1>
                </div>
                <div className="wtb-header-right">
                    {saveStatus && <span className="wtb-save-status">{saveStatus}</span>}
                    <button className="wtb-btn wtb-btn--outline" onClick={handleSave}>
                        Save Draft
                    </button>
                    <button
                        className="wtb-btn wtb-btn--primary"
                        onClick={handlePublish}
                        disabled={publishing || validationState.errors.length > 0}
                    >
                        {publishing ? 'Publishing...' : 'Publish Test'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="wtb-content">
                <WritingMetadataPanel value={metadata} onChange={setMetadata} />

                {/* Task 1 — hidden via CSS when not in format, keeps state */}
                <div style={{
                    display: metadata.format === 'task2-only' ? 'none' : 'block'
                }}>
                    <WritingTaskPanel taskNumber={1} task={task1} onChange={setTask1} />
                </div>

                {/* Task 2 — hidden via CSS when not in format, keeps state */}
                <div style={{
                    display: metadata.format === 'task1-only' ? 'none' : 'block'
                }}>
                    <WritingTaskPanel taskNumber={2} task={task2} onChange={setTask2} />
                </div>

                <WritingValidationSummary validationState={validationState} />
            </div>

            {/* Publish Success Dialog */}
            {showPublishDialog && (
                <div className="wtb-dialog-overlay">
                    <div className="wtb-dialog">
                        <h2>🎉 Test Published!</h2>
                        <p>Your IELTS Writing test is now available.</p>
                        <div className="wtb-dialog-actions">
                            <button
                                className="wtb-btn wtb-btn--primary"
                                onClick={() => navigate(buildRoute('LOBBY'))}
                            >
                                📚 Go to Materials
                            </button>
                            <button
                                className="wtb-btn wtb-btn--outline"
                                onClick={() => navigate(buildRoute('TEACHER_HOMEWORK'))}
                            >
                                📋 Assign as Homework
                            </button>
                            <button
                                className="wtb-btn wtb-btn--outline"
                                onClick={() => setShowPublishDialog(false)}
                            >
                                Keep Editing
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
