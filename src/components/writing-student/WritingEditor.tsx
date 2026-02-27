/**
 * WritingEditor — PRD-0030 Task 3.2
 * Plain textarea for student essay input.
 * [GAP-09] Paste prevention via useEffect with attachToTextarea.
 * NO MANTINE.
 */

import { useRef, useEffect } from 'react';
import { useExternalPastePrevention } from '../../hooks/useExternalPastePrevention';
import './WritingTestPage.css';

interface WritingEditorProps {
    value: string;
    onChange: (text: string) => void;
    disabled: boolean;
}

export default function WritingEditor({ value, onChange, disabled }: WritingEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { attachToTextarea } = useExternalPastePrevention();

    // [GAP-09] Attach paste prevention inside useEffect
    useEffect(() => {
        if (textareaRef.current) {
            return attachToTextarea(textareaRef.current);
        }
        return undefined;
    }, [attachToTextarea]);

    // Word count
    const wordCount = value.trim()
        ? value.trim().split(/\s+/).filter((w: string) => w.length > 0).length
        : 0;

    return (
        <div className="wtp-editor-wrapper">
            <textarea
                ref={textareaRef}
                className="wtp-editor-textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
