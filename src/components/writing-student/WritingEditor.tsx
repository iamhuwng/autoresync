/**
 * WritingEditor
 * Plain textarea for student essay input.
 * NO MANTINE.
 */

import { useEffect, useRef } from 'react';
import './WritingTestPage.css';

interface WritingEditorProps {
    value: string;
    onChange: (text: string) => void;
    disabled: boolean;
    attachToTextarea?: (textarea: HTMLTextAreaElement) => (() => void) | void;
    wordMinimum?: number;
    taskNumber?: number;
}

export default function WritingEditor({
    value,
    onChange,
    disabled,
    attachToTextarea,
    wordMinimum,
    taskNumber,
}: WritingEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current && attachToTextarea) {
            return attachToTextarea(textareaRef.current);
        }

        return undefined;
    }, [attachToTextarea]);

    const wordCount = value.trim()
        ? value.trim().split(/\s+/).filter((word: string) => word.length > 0).length
        : 0;

    const hasMinimum = typeof wordMinimum === 'number' && Number.isFinite(wordMinimum) && wordMinimum > 0;
    const wordCountStateClass = !hasMinimum
        ? ''
        : wordCount >= wordMinimum
            ? 'wtp-word-count--met'
            : wordCount > 0
                ? 'wtp-word-count--low'
                : '';

    return (
        <div className="wtp-editor-wrapper">
            <textarea
                ref={textareaRef}
                className="wtp-editor-textarea"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                aria-label={taskNumber ? `Task ${taskNumber} essay editor` : 'Essay editor'}
                placeholder="Start writing your essay here..."
            />
            <div className="wtp-word-counter">
                <span className={`wtp-word-count ${wordCountStateClass}`.trim()}>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                    {hasMinimum && (
                        <span className="wtp-word-count-target">
                            {' '}/ {wordMinimum} min
                        </span>
                    )}
                </span>
            </div>
        </div>
    );
}
