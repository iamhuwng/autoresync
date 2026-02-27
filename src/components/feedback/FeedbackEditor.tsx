import React, { useState, useCallback, useEffect } from 'react';
import { Textarea, Button, Stack, Text, Group, Alert } from '@mantine/core';
import { IconDeviceFloppy, IconAlertCircle, IconCheck } from '@tabler/icons-react';

/**
 * FeedbackEditor Component
 * 
 * Rich text input for teacher comments on student test results.
 * Supports both per-question and overall feedback modes.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface FeedbackEditorProps {
    /** Initial feedback text */
    initialFeedback?: string;
    /** Question ID for per-question feedback */
    questionId?: string;
    /** Question text to display as context */
    questionText?: string;
    /** Callback when feedback is saved */
    onSave: (feedback: string) => Promise<void>;
    /** Callback when feedback is cleared */
    onClear?: () => void;
    /** Whether this is overall feedback (vs per-question) */
    isOverall?: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Enable autosave */
    autosave?: boolean;
    /** Autosave delay in milliseconds */
    autosaveDelay?: number;
    /** Minimum rows for textarea */
    minRows?: number;
    /** Maximum rows for textarea */
    maxRows?: number;
    /** Whether the editor is disabled */
    disabled?: boolean;
}

export const FeedbackEditor: React.FC<FeedbackEditorProps> = ({
    initialFeedback = '',
    questionId,
    questionText,
    onSave,
    onClear,
    isOverall = false,
    placeholder = 'Enter your feedback here...',
    autosave = false,
    autosaveDelay = 2000,
    minRows = 3,
    maxRows = 10,
    disabled = false
}) => {
    const [feedback, setFeedback] = useState(initialFeedback);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [autosaveTimeout, setAutosaveTimeout] = useState<NodeJS.Timeout | null>(null);

    // Update feedback when initialFeedback changes
    useEffect(() => {
        setFeedback(initialFeedback);
        setIsDirty(false);
    }, [initialFeedback]);

    // Cleanup autosave timeout on unmount
    useEffect(() => {
        return () => {
            if (autosaveTimeout) {
                clearTimeout(autosaveTimeout);
            }
        };
    }, [autosaveTimeout]);

    /**
     * Handle feedback text change
     */
    const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = event.target.value;
        setFeedback(newValue);
        setIsDirty(newValue !== initialFeedback);
        setSaveSuccess(false);
        setSaveError(null);

        // Handle autosave
        if (autosave && newValue.trim()) {
            // Clear existing timeout
            if (autosaveTimeout) {
                clearTimeout(autosaveTimeout);
            }

            // Set new timeout
            const timeout = setTimeout(() => {
                handleSave(newValue);
            }, autosaveDelay);

            setAutosaveTimeout(timeout);
        }
    }, [initialFeedback, autosave, autosaveDelay, autosaveTimeout]);

    /**
     * Handle save button click
     */
    const handleSaveClick = useCallback(async () => {
        await handleSave(feedback);
    }, [feedback]);

    /**
     * Save feedback
     */
    const handleSave = useCallback(async (feedbackText: string) => {
        if (!feedbackText.trim()) {
            setSaveError('Feedback cannot be empty');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        try {
            await onSave(feedbackText.trim());
            setIsDirty(false);
            setSaveSuccess(true);

            // Clear success message after 3 seconds
            setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (error) {
            console.error('Error saving feedback:', error);
            setSaveError(error instanceof Error ? error.message : 'Failed to save feedback');
        } finally {
            setIsSaving(false);
        }
    }, [onSave]);

    /**
     * Handle clear button click
     */
    const handleClear = useCallback(() => {
        setFeedback('');
        setIsDirty(true);
        setSaveSuccess(false);
        setSaveError(null);

        if (onClear) {
            onClear();
        }
    }, [onClear]);

    return (
        <Stack gap="sm">
            {/* Question context (for per-question feedback) */}
            {!isOverall && questionText && (
                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                    Question: {questionText}
                </Text>
            )}

            {/* Overall feedback label */}
            {isOverall && (
                <Text size="sm" fw={600} c="blue">
                    Overall Feedback
                </Text>
            )}

            {/* Feedback textarea */}
            <Textarea
                value={feedback}
                onChange={handleChange}
                placeholder={placeholder}
                minRows={minRows}
                maxRows={maxRows}
                disabled={disabled || isSaving}
                autosize
                styles={{
                    input: {
                        fontFamily: 'inherit',
                        fontSize: '0.875rem'
                    }
                }}
            />

            {/* Action buttons */}
            <Group justify="space-between">
                <Group gap="xs">
                    <Button
                        onClick={handleSaveClick}
                        loading={isSaving}
                        disabled={disabled || !isDirty || !feedback.trim()}
                        leftSection={<IconDeviceFloppy size={16} />}
                        size="sm"
                    >
                        {isSaving ? 'Saving...' : 'Save Feedback'}
                    </Button>

                    {onClear && feedback && (
                        <Button
                            onClick={handleClear}
                            variant="subtle"
                            color="gray"
                            disabled={disabled || isSaving}
                            size="sm"
                        >
                            Clear
                        </Button>
                    )}
                </Group>

                {/* Autosave indicator */}
                {autosave && isDirty && !isSaving && (
                    <Text size="xs" c="dimmed">
                        Autosave enabled
                    </Text>
                )}
            </Group>

            {/* Success message */}
            {saveSuccess && (
                <Alert
                    icon={<IconCheck size={16} />}
                    color="green"
                    variant="light"
                    styles={{ root: { padding: '0.5rem 0.75rem' } }}
                >
                    <Text size="sm">Feedback saved successfully!</Text>
                </Alert>
            )}

            {/* Error message */}
            {saveError && (
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="red"
                    variant="light"
                    styles={{ root: { padding: '0.5rem 0.75rem' } }}
                >
                    <Text size="sm">{saveError}</Text>
                </Alert>
            )}

            {/* Character count (optional) */}
            {feedback && (
                <Text size="xs" c="dimmed" ta="right">
                    {feedback.length} characters
                </Text>
            )}
        </Stack>
    );
};

export default FeedbackEditor;
