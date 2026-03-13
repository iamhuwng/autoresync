/**
 * StudentNoteEditor — Inline note editor for per-student notes.
 * PRD-0034 Task 11.4
 *
 * If no note: shows a small "📝" icon button.
 * On click: expands to textarea + Save/Cancel buttons.
 * Saved notes show as "📝" icon with CSS tooltip on hover.
 */

import { useCallback, useState } from 'react';
import { Button } from '../modern';

interface StudentNoteEditorProps {
    currentNote: string;
    onSave: (note: string) => void;
}

export default function StudentNoteEditor({
    currentNote,
    onSave,
}: StudentNoteEditorProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(currentNote);
    const [saving, setSaving] = useState(false);

    const hasNote = currentNote.length > 0;

    const handleOpen = useCallback(() => {
        setDraft(currentNote);
        setEditing(true);
    }, [currentNote]);

    const handleCancel = useCallback(() => {
        setEditing(false);
        setDraft(currentNote);
    }, [currentNote]);

    const handleSave = useCallback(async () => {
        setSaving(true);

        try {
            await Promise.resolve(onSave(draft.trim()));
            setEditing(false);
        } finally {
            setSaving(false);
        }
    }, [draft, onSave]);

    if (editing) {
        return (
            <div
                style={{
                    display: 'grid',
                    gap: '0.5rem',
                    minWidth: '220px',
                    animation: 'scaleIn 0.15s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a note about this student…"
                    rows={3}
                    autoFocus
                    style={{
                        width: '100%',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '0.5rem',
                        border: '1.5px solid rgba(139,92,246,0.4)',
                        fontSize: '0.85rem',
                        color: '#0f172a',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#8b5cf6';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)';
                    }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <Button
                        variant="outline"
                        disabled={saving}
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        loading={saving}
                        onClick={handleSave}
                    >
                        Save
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                handleOpen();
            }}
            data-note={hasNote ? currentNote : undefined}
            title={hasNote ? currentNote : 'Add note'}
            aria-label={hasNote ? `Note: ${currentNote}` : 'Add note'}
            style={{
                width: '1.7rem',
                height: '1.7rem',
                borderRadius: '50%',
                border: 'none',
                background: hasNote ? 'rgba(59,130,246,0.1)' : 'transparent',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.85rem',
                opacity: hasNote ? 1 : 0.5,
                transition: 'opacity 0.12s, background 0.12s',
                position: 'relative',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'rgba(59,130,246,0.12)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.opacity = hasNote ? '1' : '0.5';
                e.currentTarget.style.background = hasNote ? 'rgba(59,130,246,0.1)' : 'transparent';
            }}
        >
            📝
        </button>
    );
}
