import { Modal } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WritingTask, WritingTestDraft, WritingTestMetadata } from '../../types/ielts-writing.types';
import { Button, Card } from '../modern';
import { EditTestFrame, type EditorTab } from '../test/editor/EditTestFrame';
import WritingMetadataPanel from './WritingMetadataPanel';
import WritingTaskPanel, { type WritingTaskWithKey } from './WritingTaskPanel';
import WritingValidationSummary, { validateWritingTest } from './WritingValidationSummary';
import { publishWritingTest, saveWritingDraft } from '../../services/writingTestService';
import r2StorageService from '../../services/r2Storage';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import './WritingTestBuilder.css';

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

interface WritingTestEditModalProps {
    draft: WritingTestDraft | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: (draftId: string) => void;
    onPublished?: (testId?: string, draftId?: string) => void;
}

function buildTaskState(
    draft: WritingTestDraft,
    taskNumber: 1 | 2,
    fallback: WritingTaskWithKey
): WritingTaskWithKey {
    const existingTask = draft.tasks.find((task) => task.taskNumber === taskNumber);
    return existingTask ? { ...fallback, ...existingTask } : { ...fallback };
}

function buildSignature(
    metadata: WritingTestMetadata,
    task1: WritingTaskWithKey,
    task2: WritingTaskWithKey,
    isPublic: boolean
): string {
    return JSON.stringify({ metadata, task1, task2, isPublic });
}

export default function WritingTestEditModal({
    draft,
    isOpen,
    onClose,
    onSaved,
    onPublished,
}: WritingTestEditModalProps) {
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);
    const [metadata, setMetadata] = useState<WritingTestMetadata>({
        title: '',
        duration: 60,
        format: 'full-test',
    });
    const [task1, setTask1] = useState<WritingTaskWithKey>({ ...DEFAULT_TASK1 });
    const [task2, setTask2] = useState<WritingTaskWithKey>({ ...DEFAULT_TASK2 });
    const [saveStatus, setSaveStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [initialSignature, setInitialSignature] = useState('');
    const [activeTab, setActiveTab] = useState<EditorTab>('questions');
    const [selectedTaskNumber, setSelectedTaskNumber] = useState<1 | 2 | null>(1);
    const [isPublic, setIsPublic] = useState(false);
    const isPublishedDraft = draft?.status === 'published' || Boolean(draft?.publishedTestId);

    useEffect(() => {
        if (!isOpen || !draft) {
            return;
        }

        const nextMetadata: WritingTestMetadata = {
            title: '',
            duration: 60,
            format: 'full-test',
            ...draft.metadata,
        };
        const nextTask1 = buildTaskState(draft, 1, DEFAULT_TASK1);
        const nextTask2 = buildTaskState(draft, 2, DEFAULT_TASK2);

        setMetadata(nextMetadata);
        setTask1(nextTask1);
        setTask2(nextTask2);
        setSaveStatus('');
        setSaving(false);
        setPublishing(false);
        setIsPublic(Boolean(draft.isPublic));
        setActiveTab('questions');
        setInitialSignature(buildSignature(nextMetadata, nextTask1, nextTask2, Boolean(draft.isPublic)));
    }, [draft, isOpen]);

    const activeTasks = useMemo(() => {
        if (metadata.format === 'task1-only') {
            return [task1];
        }
        if (metadata.format === 'task2-only') {
            return [task2];
        }
        return [task1, task2];
    }, [metadata.format, task1, task2]);

    const resourceCount = useMemo(
        () => activeTasks.filter((task) => Boolean(task.promptImageUrl)).length,
        [activeTasks]
    );

    const validationState = useMemo(
        () => validateWritingTest(metadata, activeTasks),
        [activeTasks, metadata]
    );

    useEffect(() => {
        const availableTaskNumbers = activeTasks.map((task) => task.taskNumber);
        if (availableTaskNumbers.length === 0) {
            setSelectedTaskNumber(null);
            return;
        }

        if (selectedTaskNumber === null || !availableTaskNumbers.includes(selectedTaskNumber)) {
            setSelectedTaskNumber(availableTaskNumbers[0] ?? null);
        }
    }, [activeTasks, selectedTaskNumber]);

    const hasUnsavedChanges = useMemo(
        () => initialSignature.length > 0
            && initialSignature !== buildSignature(metadata, task1, task2, isPublic),
        [initialSignature, isPublic, metadata, task1, task2]
    );

    const buildDraftTasks = useCallback((): WritingTask[] => activeTasks.map(({ _imageKey, ...rest }) => rest), [activeTasks]);

    const refreshInitialSignature = useCallback(() => {
        setInitialSignature(buildSignature(metadata, task1, task2, isPublic));
    }, [isPublic, metadata, task1, task2]);

    const handleCloseRequest = useCallback(() => {
        if (saving || publishing) {
            return;
        }

        if (hasUnsavedChanges && !window.confirm('Discard unsaved writing test changes?')) {
            return;
        }

        onClose();
    }, [hasUnsavedChanges, onClose, publishing, saving]);

    const handleSaveDraft = useCallback(async () => {
        if (!draft) {
            return;
        }

        setSaving(true);
        setSaveStatus('Saving...');

        try {
            const result = await saveWritingDraft(draft.userId, {
                id: draft.id,
                metadata,
                tasks: buildDraftTasks(),
                isPublic,
            });

            if (!result.success || !result.draftId) {
                throw new Error(result.error || 'Failed to save writing draft');
            }

            trackAction('saveDraft', {
                draftId: result.draftId,
                source: 'writing_edit_modal',
            });
            setSaveStatus('Saved');
            refreshInitialSignature();
            onSaved?.(result.draftId);
        } catch (error) {
            console.error('Failed to save writing draft:', error);
            setSaveStatus('Save failed');
            alert(error instanceof Error ? error.message : 'Failed to save writing draft.');
        } finally {
            setSaving(false);
        }
    }, [buildDraftTasks, draft, isPublic, metadata, onSaved, refreshInitialSignature, trackAction]);

    const handlePublish = useCallback(async () => {
        if (!draft) {
            return;
        }

        if (validationState.errors.length > 0) {
            alert('Please fix all validation errors before publishing.');
            return;
        }

        if (validationState.warnings.length > 0) {
            const proceed = window.confirm(
                `There are ${validationState.warnings.length} warning(s):\n\n`
                + `${validationState.warnings.join('\n')}\n\nContinue publishing?`
            );

            if (!proceed) {
                return;
            }
        }

        setPublishing(true);
        setSaveStatus('Publishing...');

        try {
            const preparedTasks = activeTasks.map((task) => ({ ...task }));

            for (const task of preparedTasks) {
                if (task._imageKey && r2StorageService.isTempFile(task._imageKey)) {
                    const movedImage = await r2StorageService.moveToPermanent(task._imageKey);
                    task.promptImageUrl = movedImage.newUrl;
                    delete task._imageKey;
                }
            }

            const persistedTasks: WritingTask[] = preparedTasks.map(({ _imageKey, ...rest }) => rest);
            const result = await publishWritingTest({
                id: draft.id,
                userId: draft.userId,
                testType: 'IELTS',
                skill: 'Writing',
                metadata,
                tasks: persistedTasks,
                isPublic,
                status: 'published',
                createdAt: draft.createdAt,
                updatedAt: new Date(),
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to publish writing test');
            }

            trackAction('publishTest', {
                draftId: result.draftId || draft.id,
                testId: result.testId || null,
                source: 'writing_edit_modal',
            });
            setSaveStatus('Published');
            refreshInitialSignature();
            onPublished?.(result.testId, result.draftId || draft.id);
            onClose();
        } catch (error) {
            console.error('Failed to publish writing test:', error);
            setSaveStatus('Publish failed');
            alert(error instanceof Error ? error.message : 'Failed to publish writing test.');
        } finally {
            setPublishing(false);
        }
    }, [activeTasks, draft, isPublic, metadata, onClose, onPublished, refreshInitialSignature, trackAction, validationState.errors.length, validationState.warnings]);

    const handleSave = useCallback(() => {
        if (isPublishedDraft) {
            void handlePublish();
            return;
        }

        void handleSaveDraft();
    }, [handlePublish, handleSaveDraft, isPublishedDraft]);

    if (!isOpen || !draft) {
        return null;
    }

    const selectedTask = selectedTaskNumber === 1 ? task1 : selectedTaskNumber === 2 ? task2 : null;

    const frameProps = {
        title: metadata.title || draft.metadata.title || 'Untitled Writing Test',
        onTitleChange: (title: string) => {
            setMetadata((current) => ({ ...current, title }));
        },
        activeTab,
        onTabChange: setActiveTab,
        onSave: handleSave,
        onCancel: handleCloseRequest,
        isSaving: saving || publishing,
        saveLabel: isPublishedDraft ? 'Save Changes' : 'Save Draft',
        extraActions: !isPublishedDraft ? (
            <Button
                variant="glass"
                onClick={handlePublish}
                disabled={saving || publishing || validationState.errors.length > 0}
            >
                {publishing ? 'Publishing...' : 'Publish Test'}
            </Button>
        ) : null,
        questionCount: activeTasks.length,
        resourceCount,
        duration: metadata.duration,
        onDurationChange: (duration: number) => {
            setMetadata((current) => ({
                ...current,
                duration: Math.max(1, duration || current.duration || 60),
            }));
        },
        isPublic,
        onIsPublicChange: (nextIsPublic: boolean) => {
            setIsPublic(nextIsPublic);
            trackAction('toggleVisibility', {
                source: 'writing_edit_modal',
                isPublic: nextIsPublic,
                draftId: draft.id,
            });
        },
        hiddenTabs: ['answerKey'] as EditorTab[],
    };

    return (
        <Modal
            opened={isOpen}
            onClose={handleCloseRequest}
            size="auto"
            padding={0}
            withCloseButton={false}
            centered
            aria-label="Edit Writing Test"
            styles={{
                body: { padding: 0, background: 'transparent' },
                content: { background: 'transparent', boxShadow: 'none' },
                inner: { padding: 0 },
            }}
        >
                <EditTestFrame {...frameProps}>
                    {activeTab === 'questions' && (
                        <div
                            style={{
                                display: 'flex',
                                gap: '1.5rem',
                                height: '100%',
                                minHeight: 0,
                                minWidth: 0,
                                padding: '1rem',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    flex: '0 1 320px',
                                    width: '100%',
                                    maxWidth: '380px',
                                    minWidth: 0,
                                    height: '100%',
                                    minHeight: 0,
                                }}
                            >
                                <Card variant="glass" style={{ height: '100%', padding: 0, overflow: 'hidden' }}>
                                    <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                            Writing Tasks
                                        </div>
                                        <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#64748b' }}>
                                            {isPublishedDraft ? 'Published material' : 'Draft'} - {saveStatus || 'Select a task to edit'}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            padding: '1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem',
                                            overflow: 'auto',
                                        }}
                                    >
                                        {activeTasks.map((task) => {
                                            const isSelected = selectedTaskNumber === task.taskNumber;
                                            return (
                                                <button
                                                    key={task.taskNumber}
                                                    type="button"
                                                    onClick={() => setSelectedTaskNumber(task.taskNumber)}
                                                    style={{
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '1rem',
                                                        borderRadius: '0.9rem',
                                                        border: isSelected
                                                            ? '1px solid rgba(139, 92, 246, 0.35)'
                                                            : '1px solid rgba(15, 23, 42, 0.08)',
                                                        background: isSelected
                                                            ? 'linear-gradient(135deg, rgba(245, 243, 255, 0.98) 0%, rgba(237, 233, 254, 0.9) 100%)'
                                                            : 'rgba(255, 255, 255, 0.94)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                                            Task {task.taskNumber}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed' }}>
                                                            {task.taskType}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginTop: '0.55rem', fontSize: '0.85rem', color: '#475569' }}>
                                                        {task.promptText?.trim() ? task.promptText.slice(0, 120) : 'Prompt not added yet.'}
                                                    </div>
                                                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                                                        {task.wordMinimum} words minimum
                                                        {task.promptImageUrl ? ' - includes image' : ''}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </Card>
                            </div>

                            <div
                                style={{
                                    flex: '1 1 520px',
                                    minWidth: 0,
                                    width: '100%',
                                    height: '100%',
                                    minHeight: 0,
                                    overflow: 'hidden',
                                }}
                            >
                                {selectedTask && selectedTaskNumber ? (
                                    <div
                                        style={{
                                            width: '100%',
                                            minWidth: 0,
                                            maxWidth: '100%',
                                            height: '100%',
                                            minHeight: 0,
                                            overflow: 'auto',
                                            animation: 'slideInFromRight 0.3s ease',
                                        }}
                                    >
                                        <WritingTaskPanel
                                            taskNumber={selectedTaskNumber}
                                            task={selectedTask}
                                            onChange={(updatedTask) => {
                                                if (updatedTask.taskNumber === 1) {
                                                    setTask1(updatedTask);
                                                    return;
                                                }
                                                setTask2(updatedTask);
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            height: '100%',
                                            flexDirection: 'column',
                                            opacity: 0.5,
                                        }}
                                    >
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                                            Select a task to edit
                                        </div>
                                        <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#64748b' }}>
                                            The task editor will appear here.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'context' && (
                        <div style={{ width: '100%', height: '100%', padding: '1rem', overflow: 'auto' }}>
                            <div className="wtb-content" style={{ maxWidth: '960px', padding: 0 }}>
                                <WritingMetadataPanel value={metadata} onChange={setMetadata} />
                                <WritingValidationSummary validationState={validationState} />
                            </div>
                        </div>
                    )}
                </EditTestFrame>
                <style>{`
                    @keyframes slideInFromRight {
                        from { opacity: 0; transform: translateX(20px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                `}</style>
        </Modal>
    );
}
