import React, { useState, useEffect } from 'react';
import { IconMessageCircle, IconAlertCircle } from '@tabler/icons-react';
import { FeedbackEditor } from '../feedback/FeedbackEditor';
import {
    saveQuestionFeedback,
    saveOverallFeedback,
    getAllQuestionFeedback,
    getOverallFeedback,
    canTeacherEditFeedback
} from '@/services/feedbackService';
import { buildRoute } from '@/constants/routes';
import { getTestResult } from '@/services/testResults.service';
import { createTrustedNotification } from '@/services/notificationProducerClient';

const TRUSTED_NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const isTrustedNotificationIdentifier = (value: unknown): value is string =>
    typeof value === 'string' && TRUSTED_NOTIFICATION_ID.test(value);

const notifyStudentOfFeedback = async (
    resultId: string,
    testName: string,
    teacherName: string | undefined,
    operationKey: string,
): Promise<void> => {
    try {
        const result = await getTestResult(resultId);
        const recipientId = result?.studentId;
        const authorityRecordId = result?.resultId;
        if (
            !result
            || authorityRecordId !== resultId
            || !isTrustedNotificationIdentifier(recipientId)
            || !isTrustedNotificationIdentifier(authorityRecordId)
            || typeof testName !== 'string'
            || !testName.trim()
        ) {
            console.warn('Skipped feedback notification: trusted recipient or authority was unavailable.');
            return;
        }

        await createTrustedNotification({
            producerFamily: 'feedback',
            authorityRecordId,
            recipientId,
            operationKey,
            type: 'feedback',
            title: 'New Feedback Available',
            message: `${teacherName ? `${teacherName} has` : 'Your teacher has'} provided feedback on "${testName}"`,
            link: buildRoute('RESULT_DETAIL', { resultId: authorityRecordId }),
        }).catch((error) => {
            console.warn('Feedback notification failed (non-blocking):', error);
        });
    } catch (error) {
        console.warn('Feedback notification authority lookup failed (non-blocking):', error);
    }
};

/**
 * TeacherFeedbackManager Component
 * 
 * Manages teacher feedback for a student's test result.
 * Displays feedback editors for each question and overall feedback.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface Question {
    id: string;
    number: number;
    text: string;
    type: string;
}

export interface TeacherFeedbackManagerProps {
    /** The test result ID */
    resultId: string;
    /** The student's user ID */
    studentId: string;
    /** The student's name */
    studentName: string;
    /** The test name */
    testName: string;
    /** Array of questions from the test */
    questions: Question[];
    /** Current teacher's user ID */
    teacherId: string;
    /** Current teacher's name */
    teacherName?: string;
    /** Course ID for permission checking */
    courseId?: string;
    /** Whether to notify the student after a successful feedback save */
    notifyStudentOnSave?: boolean;
}

export const TeacherFeedbackManager: React.FC<TeacherFeedbackManagerProps> = ({
    resultId,
    studentId: _studentId,
    studentName,
    testName,
    questions,
    teacherId,
    teacherName,
    courseId: _courseId,
    notifyStudentOnSave = false,
}) => {
    const [loading, setLoading] = useState(true);
    const [canEdit, setCanEdit] = useState(false);
    const [questionFeedback, setQuestionFeedback] = useState<Record<string, any>>({});
    const [overallFeedback, setOverallFeedback] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load existing feedback and check permissions
     */
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Check if teacher can edit feedback
                const hasPermission = await canTeacherEditFeedback(resultId, teacherId);
                setCanEdit(hasPermission);

                if (!hasPermission) {
                    setError('You do not have permission to add feedback to this result.');
                    setLoading(false);
                    return;
                }

                // Load existing feedback
                const [qFeedback, oFeedback] = await Promise.all([
                    getAllQuestionFeedback(resultId),
                    getOverallFeedback(resultId)
                ]);

                setQuestionFeedback(qFeedback);
                setOverallFeedback(oFeedback);
                setLoading(false);
            } catch (err) {
                console.error('Error loading feedback:', err);
                setError('Failed to load feedback data');
                setLoading(false);
            }
        };

        loadData();
    }, [resultId, teacherId]);

    /**
     * Handle saving question feedback
     */
    const handleSaveQuestionFeedback = async (questionId: string, feedback: string) => {
        try {
            await saveQuestionFeedback(
                resultId,
                questionId,
                feedback,
                teacherId,
                teacherName
            );

            // Send notification to student
            if (notifyStudentOnSave) {
                await notifyStudentOfFeedback(
                    resultId,
                    testName,
                    teacherName,
                    `feedback-question:${resultId}:${questionId}`,
                );
            }

            // Reload feedback to get updated data
            const updatedFeedback = await getAllQuestionFeedback(resultId);
            setQuestionFeedback(updatedFeedback);

            console.log(`✅ Question feedback saved for ${questionId}`);
        } catch (err) {
            console.error('Error saving question feedback:', err);
            throw err;
        }
    };

    /**
     * Handle saving overall feedback
     */
    const handleSaveOverallFeedback = async (feedback: string) => {
        try {
            await saveOverallFeedback(
                resultId,
                feedback,
                teacherId,
                teacherName
            );

            // Send notification to student
            if (notifyStudentOnSave) {
                await notifyStudentOfFeedback(
                    resultId,
                    testName,
                    teacherName,
                    `feedback-overall:${resultId}`,
                );
            }

            // Reload feedback to get updated data
            const updatedFeedback = await getOverallFeedback(resultId);
            setOverallFeedback(updatedFeedback);

            console.log('✅ Overall feedback saved');
        } catch (err) {
            console.error('Error saving overall feedback:', err);
            throw err;
        }
    };

    /**
     * Render loading state
     */
    if (loading) {
        return (
            <div
                role="status"
                aria-label="Loading feedback"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                }}
            >
                <style>{'@keyframes teacher-feedback-spin { to { transform: rotate(360deg); } }'}</style>
                <span
                    aria-hidden="true"
                    style={{
                        width: '1.5rem',
                        height: '1.5rem',
                        border: '0.2rem solid #dbeafe',
                        borderTopColor: '#228be6',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'teacher-feedback-spin 0.8s linear infinite',
                    }}
                />
            </div>
        );
    }

    /**
     * Render error state
     */
    if (error || !canEdit) {
        return (
            <div
                role="alert"
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    backgroundColor: '#fef2f2',
                    color: '#991b1b',
                }}
            >
                <IconAlertCircle size={16} aria-hidden="true" />
                <span style={{ fontSize: '0.875rem' }}>
                    {error || 'You cannot add feedback to this result.'}
                </span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <section
                style={{
                    padding: '1rem',
                    border: '1px solid #dee2e6',
                    borderRadius: '0.5rem',
                    backgroundColor: 'rgba(34, 139, 230, 0.05)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <IconMessageCircle size={20} color="#228be6" aria-hidden="true" />
                    <strong style={{ fontSize: '1rem', color: '#1864ab' }}>
                        Provide Feedback for {studentName}
                    </strong>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6c757d' }}>
                    Add personalized feedback to help the student improve. Students will be notified when you save feedback.
                </p>
            </section>

            {/* Per-Question Feedback */}
            {questions.length > 0 && (
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#6c757d', textTransform: 'uppercase' }}>
                        Question Feedback
                    </h3>

                    {questions.map((question) => (
                        <div
                            key={question.id}
                            style={{
                                padding: '1rem',
                                border: '1px solid #dee2e6',
                                borderRadius: '0.5rem',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <strong style={{ fontSize: '0.875rem' }}>
                                    Question {question.number}
                                </strong>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6c757d', fontStyle: 'italic' }}>
                                    {question.text}
                                </p>
                                <hr style={{ width: '100%', border: 0, borderTop: '1px solid #dee2e6', margin: 0 }} />
                                <FeedbackEditor
                                    questionId={question.id}
                                    questionText={question.text}
                                    initialFeedback={questionFeedback[question.id]?.feedback || ''}
                                    onSave={(feedback) => handleSaveQuestionFeedback(question.id, feedback)}
                                    placeholder={`Provide feedback for question ${question.number}...`}
                                    minRows={2}
                                    maxRows={6}
                                />
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {/* Overall Feedback */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span aria-hidden="true" style={{ flex: 1, borderTop: '1px solid #dee2e6' }} />
                    <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#6c757d', textTransform: 'uppercase' }}>
                        Overall Feedback
                    </h3>
                    <span aria-hidden="true" style={{ flex: 1, borderTop: '1px solid #dee2e6' }} />
                </div>

                <div
                    style={{
                        padding: '1rem',
                        border: '1px solid #dee2e6',
                        borderRadius: '0.5rem',
                        backgroundColor: 'rgba(34, 139, 230, 0.03)',
                    }}
                >
                    <FeedbackEditor
                        initialFeedback={overallFeedback?.feedback || ''}
                        onSave={handleSaveOverallFeedback}
                        isOverall={true}
                        placeholder={`Provide overall feedback on ${studentName}'s performance...`}
                        minRows={4}
                        maxRows={12}
                    />
                </div>
            </section>
        </div>
    );
};

export default TeacherFeedbackManager;
