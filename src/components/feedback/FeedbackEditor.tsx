import React, { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from '../modern';
import { toast } from '../modern/ToastNotification';

export interface FeedbackEditorProps {
    initialFeedback?: string;
    questionId?: string;
    questionText?: string;
    onSave: (feedback: string) => Promise<void>;
    onClear?: () => void;
    isOverall?: boolean;
    placeholder?: string;
    autosave?: boolean;
    autosaveDelay?: number;
    minRows?: number;
    maxRows?: number;
    disabled?: boolean;
}

export const FeedbackEditor: React.FC<FeedbackEditorProps> = ({
    initialFeedback = '', questionId, questionText, onSave, onClear,
    isOverall = false, placeholder = 'Enter your feedback here...',
    autosave = false, autosaveDelay = 2000, minRows = 3, maxRows = 10, disabled = false,
}) => {
    const [feedback, setFeedback] = useState(initialFeedback);
    const [savedFeedback, setSavedFeedback] = useState(initialFeedback);
    const [isSaving, setIsSaving] = useState(false);
    const autosaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirty = feedback !== savedFeedback;

    useEffect(() => {
        setFeedback(initialFeedback);
        setSavedFeedback(initialFeedback);
    }, [initialFeedback]);

    useEffect(() => () => {
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    }, []);

    const handleSave = async (text: string) => {
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        if (!text.trim()) {
            toast.error('Feedback cannot be empty.');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(text.trim());
            setSavedFeedback(text);
            toast.success(isOverall ? 'Overall feedback saved.' : `Question ${questionId || ''} feedback saved.`);
        } catch (error) {
            console.error('Error saving feedback:', error);
            toast.error(error instanceof Error ? `Could not save feedback: ${error.message}` : 'Could not save feedback. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value;
        setFeedback(value);
        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
        if (autosave && value.trim()) {
            autosaveTimeout.current = setTimeout(() => void handleSave(value), autosaveDelay);
        }
    };

    return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
            {!isOverall && questionText && <p style={{ color: '#64748b', fontStyle: 'italic' }}>Question: {questionText}</p>}
            <Textarea
                aria-label={isOverall ? 'Overall feedback' : `Question ${questionId || ''} feedback`}
                value={feedback} onChange={handleChange} placeholder={placeholder}
                rows={minRows} disabled={disabled || isSaving} fullWidth
                style={{ fontFamily: 'inherit', fontSize: '0.875rem', maxHeight: `${maxRows * 1.5 + 2}rem`, overflowY: 'auto' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button onClick={() => void handleSave(feedback)} loading={isSaving} disabled={disabled || !isDirty || !feedback.trim()} size="sm">
                        {isSaving ? 'Saving...' : 'Save Feedback'}
                    </Button>
                    {onClear && feedback && <Button variant="secondary" disabled={disabled || isSaving} size="sm" onClick={() => {
                        if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                        setFeedback('');
                        onClear();
                    }}>Clear</Button>}
                </div>
                {autosave && isDirty && !isSaving && <small>Autosave enabled</small>}
            </div>
            {feedback && <small style={{ color: '#64748b', textAlign: 'right' }}>{feedback.length} characters</small>}
        </div>
    );
};

export default FeedbackEditor;
