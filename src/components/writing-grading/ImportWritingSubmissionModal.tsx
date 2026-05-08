import { useEffect, useMemo, useState } from 'react';
import {
    getWritingImportContext,
    importExternalWritingSubmission,
    listWritingImportHomeworkOptions,
} from '../../services/writingExternalSubmissionImport.service';
import type {
    WritingExternalSubmissionImportResult,
    WritingImportContext,
    WritingImportHomeworkOption,
} from '../../services/writingExternalSubmissionImport.service';
import type { WritingTestFormat } from '../../types/ielts-writing.types';
import './ImportWritingSubmissionModal.css';

interface ImportWritingSubmissionModalProps {
    isOpen: boolean;
    teacherId?: string;
    onClose: () => void;
    onImported: (
        result: WritingExternalSubmissionImportResult,
        options: { gradeNow: boolean }
    ) => void | Promise<void>;
    trackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

type FieldErrors = Partial<Record<'homeworkId' | 'studentId' | 'submittedAt' | 'task1' | 'task2', string>>;

const formatLabels: Record<WritingTestFormat, string> = {
    'task1-only': 'Task 1 only',
    'task2-only': 'Task 2 only',
    'full-test': 'Task 1 + Task 2',
};

function toDateTimeInputValue(timestamp: number): string {
    const date = new Date(timestamp);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function parseDateTimeInputValue(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function shouldShowTask(format: WritingTestFormat | undefined, taskNumber: 1 | 2): boolean {
    if (!format) return false;
    if (format === 'full-test') return true;
    if (format === 'task1-only') return taskNumber === 1;
    return taskNumber === 2;
}

function buildInitialSubmittedAt() {
    return toDateTimeInputValue(Date.now());
}

export function ImportWritingSubmissionModal({
    isOpen,
    teacherId,
    onClose,
    onImported,
    trackAction,
}: ImportWritingSubmissionModalProps) {
    const [homeworkOptions, setHomeworkOptions] = useState<WritingImportHomeworkOption[]>([]);
    const [selectedHomeworkId, setSelectedHomeworkId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [submittedAt, setSubmittedAt] = useState(buildInitialSubmittedAt);
    const [task1Text, setTask1Text] = useState('');
    const [task2Text, setTask2Text] = useState('');
    const [sourceNote, setSourceNote] = useState('');
    const [importContext, setImportContext] = useState<WritingImportContext | null>(null);
    const [sourceLoading, setSourceLoading] = useState(false);
    const [contextLoading, setContextLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [requiresInProgressConfirm, setRequiresInProgressConfirm] = useState(false);
    const [confirmInProgressOverwrite, setConfirmInProgressOverwrite] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setSelectedHomeworkId('');
        setSelectedStudentId('');
        setSubmittedAt(buildInitialSubmittedAt());
        setTask1Text('');
        setTask2Text('');
        setSourceNote('');
        setImportContext(null);
        setFieldErrors({});
        setError(null);
        setRequiresInProgressConfirm(false);
        setConfirmInProgressOverwrite(false);

        if (!teacherId) {
            setError('Teacher session is required before importing.');
            return;
        }

        let cancelled = false;
        setSourceLoading(true);
        void listWritingImportHomeworkOptions(teacherId)
            .then((result) => {
                if (cancelled) return;
                if (result.success && result.data) {
                    setHomeworkOptions(result.data);
                } else {
                    setError(result.error || 'Failed to load Writing homework.');
                }
            })
            .catch((loadError) => {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load Writing homework.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setSourceLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, teacherId]);

    useEffect(() => {
        if (!isOpen || !teacherId || !selectedHomeworkId) {
            setImportContext(null);
            return;
        }

        let cancelled = false;
        setContextLoading(true);
        setSelectedStudentId('');
        setRequiresInProgressConfirm(false);
        setConfirmInProgressOverwrite(false);
        setFieldErrors((current) => ({ ...current, homeworkId: undefined, studentId: undefined }));
        setError(null);

        void getWritingImportContext(selectedHomeworkId, teacherId)
            .then((result) => {
                if (cancelled) return;
                if (result.success && result.data) {
                    setImportContext(result.data);
                } else {
                    setError(result.error || 'Failed to load homework details.');
                }
            })
            .catch((loadError) => {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load homework details.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setContextLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, selectedHomeworkId, teacherId]);

    const selectedStudent = useMemo(
        () => importContext?.students.find((student) => student.studentId === selectedStudentId) ?? null,
        [importContext?.students, selectedStudentId]
    );

    const format = importContext?.material.metadata.format;
    const task1Prompt = importContext?.material.tasks.find((task) => task.taskNumber === 1);
    const task2Prompt = importContext?.material.tasks.find((task) => task.taskNumber === 2);
    const showTask1 = shouldShowTask(format, 1);
    const showTask2 = shouldShowTask(format, 2);

    const validate = (): { valid: boolean; errors: FieldErrors; submittedAtMs: number } => {
        const nextErrors: FieldErrors = {};
        const submittedAtMs = parseDateTimeInputValue(submittedAt);

        if (!selectedHomeworkId) {
            nextErrors.homeworkId = 'Choose a Writing homework.';
        }
        if (!selectedStudentId) {
            nextErrors.studentId = 'Choose an assigned student.';
        }
        if (!submittedAtMs || submittedAtMs > Date.now() + 60_000) {
            nextErrors.submittedAt = 'Choose a valid submitted time.';
        }
        if (showTask1 && !task1Text.trim()) {
            nextErrors.task1 = 'Task 1 response is required.';
        }
        if (showTask2 && !task2Text.trim()) {
            nextErrors.task2 = 'Task 2 response is required.';
        }

        return {
            valid: Object.keys(nextErrors).length === 0,
            errors: nextErrors,
            submittedAtMs,
        };
    };

    const handleSubmit = async (gradeNow: boolean) => {
        if (!teacherId) {
            setError('Teacher session is required before importing.');
            return;
        }

        const validation = validate();
        setFieldErrors(validation.errors);
        if (!validation.valid) {
            trackAction?.('importSubmissionValidationFailure', {
                fields: Object.keys(validation.errors),
                homeworkId: selectedHomeworkId || null,
            });
            return;
        }

        setSubmitting(true);
        setError(null);
        trackAction?.('importSubmissionSubmit', {
            homeworkId: selectedHomeworkId,
            studentId: selectedStudentId,
            gradeNow,
        });

        const taskResponses = [
            ...(showTask1 ? [{ taskNumber: 1 as const, essayText: task1Text }] : []),
            ...(showTask2 ? [{ taskNumber: 2 as const, essayText: task2Text }] : []),
        ];

        try {
            const result = await importExternalWritingSubmission({
                homeworkId: selectedHomeworkId,
                studentId: selectedStudentId,
                studentName: selectedStudent?.studentName,
                taskResponses,
                submittedAt: validation.submittedAtMs,
                sourceNote,
                importerTeacherId: teacherId,
                confirmInProgressOverwrite,
            });

            if (!result.success || !result.data) {
                if (result.code === 'duplicate') {
                    trackAction?.('importSubmissionDuplicateBlock', {
                        homeworkId: selectedHomeworkId,
                        studentId: selectedStudentId,
                    });
                } else if (result.code === 'in-progress') {
                    setRequiresInProgressConfirm(true);
                    setConfirmInProgressOverwrite(false);
                    trackAction?.('importSubmissionValidationFailure', {
                        homeworkId: selectedHomeworkId,
                        studentId: selectedStudentId,
                        code: 'in-progress',
                    });
                } else {
                    trackAction?.('importSubmissionFailure', {
                        homeworkId: selectedHomeworkId,
                        studentId: selectedStudentId,
                        code: result.code || 'unknown',
                    });
                }
                setError(result.error || 'Failed to import Writing submission.');
                return;
            }

            trackAction?.('importSubmissionSuccess', {
                homeworkId: selectedHomeworkId,
                studentId: selectedStudentId,
                submissionId: result.data.submissionId,
                gradeNow,
            });
            if (gradeNow) {
                trackAction?.('importSubmissionGradeNow', {
                    submissionId: result.data.submissionId,
                });
            }
            await onImported(result.data, { gradeNow });
        } catch (submitError) {
            trackAction?.('importSubmissionFailure', {
                homeworkId: selectedHomeworkId,
                studentId: selectedStudentId,
                code: 'exception',
            });
            setError(submitError instanceof Error ? submitError.message : 'Failed to import Writing submission.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="iwsm-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="iwsm-panel" role="dialog" aria-modal="true" aria-labelledby="iwsm-title">
                <header className="iwsm-header">
                    <div>
                        <h2 id="iwsm-title">Import submission</h2>
                        <p>IELTS Writing homework</p>
                    </div>
                    <button className="iwsm-icon-button" type="button" onClick={onClose} aria-label="Close import modal">
                        x
                    </button>
                </header>

                <div className="iwsm-body">
                    {error && (
                        <div className="iwsm-error" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="iwsm-grid">
                        <label className="iwsm-field">
                            <span>Homework</span>
                            <select
                                value={selectedHomeworkId}
                                disabled={sourceLoading || submitting}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setSelectedHomeworkId(value);
                                    setRequiresInProgressConfirm(false);
                                    setConfirmInProgressOverwrite(false);
                                    trackAction?.('importSubmissionHomeworkSelect', { homeworkId: value || null });
                                }}
                            >
                                <option value="">{sourceLoading ? 'Loading homework...' : 'Choose homework'}</option>
                                {homeworkOptions.map((homework) => (
                                    <option key={homework.homeworkId} value={homework.homeworkId}>
                                        {homework.title}
                                    </option>
                                ))}
                            </select>
                            {fieldErrors.homeworkId && <small>{fieldErrors.homeworkId}</small>}
                        </label>

                        <label className="iwsm-field">
                            <span>Student</span>
                            <select
                                value={selectedStudentId}
                                disabled={!importContext || contextLoading || submitting}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setSelectedStudentId(value);
                                    setRequiresInProgressConfirm(false);
                                    setConfirmInProgressOverwrite(false);
                                    trackAction?.('importSubmissionStudentSelect', {
                                        homeworkId: selectedHomeworkId,
                                        studentId: value || null,
                                    });
                                }}
                            >
                                <option value="">
                                    {contextLoading ? 'Loading students...' : 'Choose student'}
                                </option>
                                {importContext?.students.map((student) => (
                                    <option key={student.studentId} value={student.studentId}>
                                        {student.studentName}
                                    </option>
                                ))}
                            </select>
                            {importContext && importContext.students.length === 0 && (
                                <small>No assigned students found for this homework.</small>
                            )}
                            {fieldErrors.studentId && <small>{fieldErrors.studentId}</small>}
                        </label>
                    </div>

                    {importContext && (
                        <div className="iwsm-material">
                            <div>
                                <strong>{importContext.material.metadata.title}</strong>
                                <span>{format ? formatLabels[format] : 'Writing test'}</span>
                            </div>
                            <span>Due {new Date(importContext.homework.scheduling.dueDate).toLocaleString()}</span>
                        </div>
                    )}

                    <label className="iwsm-field">
                        <span>Submitted time</span>
                        <input
                            type="datetime-local"
                            value={submittedAt}
                            disabled={submitting}
                            onChange={(event) => setSubmittedAt(event.target.value)}
                        />
                        {fieldErrors.submittedAt && <small>{fieldErrors.submittedAt}</small>}
                    </label>

                    {showTask1 && (
                        <label className="iwsm-field iwsm-task-field">
                            <span>Task 1 response</span>
                            {task1Prompt?.promptText && <em>{task1Prompt.promptText}</em>}
                            <textarea
                                value={task1Text}
                                disabled={submitting}
                                onChange={(event) => setTask1Text(event.target.value)}
                                rows={7}
                            />
                            {fieldErrors.task1 && <small>{fieldErrors.task1}</small>}
                        </label>
                    )}

                    {showTask2 && (
                        <label className="iwsm-field iwsm-task-field">
                            <span>Task 2 response</span>
                            {task2Prompt?.promptText && <em>{task2Prompt.promptText}</em>}
                            <textarea
                                value={task2Text}
                                disabled={submitting}
                                onChange={(event) => setTask2Text(event.target.value)}
                                rows={8}
                            />
                            {fieldErrors.task2 && <small>{fieldErrors.task2}</small>}
                        </label>
                    )}

                    <label className="iwsm-field">
                        <span>Source note</span>
                        <textarea
                            value={sourceNote}
                            disabled={submitting}
                            onChange={(event) => setSourceNote(event.target.value)}
                            rows={3}
                        />
                    </label>

                    {requiresInProgressConfirm && (
                        <label className="iwsm-confirm">
                            <input
                                type="checkbox"
                                checked={confirmInProgressOverwrite}
                                disabled={submitting}
                                onChange={(event) => setConfirmInProgressOverwrite(event.target.checked)}
                            />
                            <span>Replace the student's in-progress attempt with this imported submission.</span>
                        </label>
                    )}
                </div>

                <footer className="iwsm-footer">
                    <button type="button" className="iwsm-secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="iwsm-secondary" onClick={() => void handleSubmit(false)} disabled={submitting}>
                        {submitting ? 'Importing...' : 'Import'}
                    </button>
                    <button type="button" className="iwsm-primary" onClick={() => void handleSubmit(true)} disabled={submitting}>
                        {submitting ? 'Importing...' : 'Import and grade now'}
                    </button>
                </footer>
            </section>
        </div>
    );
}

export default ImportWritingSubmissionModal;
