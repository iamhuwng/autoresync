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
}

export default function WritingEditor({
    value,
    onChange,
    disabled,
    attachToTextarea,
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

    return (
        <div className="wtp-editor-wrapper">
            <textarea
                ref={textareaRef}
                className="wtp-editor-textarea"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                spellCheck={false}
                placeholder="Start writing your essay here..."
            />
            <div className="wtp-word-counter">
                <span className={`wtp-word-count ${wordCount < 150 ? 'wtp-word-count--low' : ''}`}>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </span>
            </div>
        </div>
    );
}
