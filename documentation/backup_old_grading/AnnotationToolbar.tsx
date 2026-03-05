/**
 * AnnotationToolbar — PRD-0030 Task 5.3
 * Toolbar for adding annotations to student essay text.
 * Shows buttons for highlight, comment, strikethrough, correction, text color.
 * Category chips for IELTS defaults + custom categories.
 * 
 * Fixes:
 * - Comment/Correction: captures selectedText on button click (before browser clears
 *   the selection via selectionchange), so the popup can display properly.
 * - Text Color: opens a color picker palette so teachers can choose a color.
 * 
 * NO MANTINE.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { WritingAnnotation, AnnotationCategory } from '../../types/ielts-writing.types';

interface SelectedText {
    text: string;
    startOffset: number;
    endOffset: number;
}

interface AnnotationToolbarProps {
    selectedText: SelectedText | null;
    annotations: WritingAnnotation[];
    onAddAnnotation: (annotation: WritingAnnotation) => void;
    categories: AnnotationCategory[];
    onAddCategory?: (category: AnnotationCategory) => void;
}

const ANNOTATION_BUTTONS = [
    { type: 'highlight' as const, label: '🖍️', title: 'Highlight' },
    { type: 'comment' as const, label: '💬', title: 'Comment' },
    { type: 'strikethrough' as const, label: '〰️', title: 'Strikethrough' },
    { type: 'correction' as const, label: '✏️', title: 'Correction' },
    { type: 'textColor' as const, label: '🎨', title: 'Text Color' },
];

const TEXT_COLOR_PALETTE = [
    { color: '#dc2626', label: 'Red' },
    { color: '#ea580c', label: 'Orange' },
    { color: '#d97706', label: 'Amber' },
    { color: '#16a34a', label: 'Green' },
    { color: '#0891b2', label: 'Cyan' },
    { color: '#2563eb', label: 'Blue' },
    { color: '#7c3aed', label: 'Purple' },
    { color: '#c026d3', label: 'Fuchsia' },
    { color: '#e11d48', label: 'Rose' },
    { color: '#64748b', label: 'Slate' },
    { color: '#1e293b', label: 'Dark' },
    { color: '#0f766e', label: 'Teal' },
];

export default function AnnotationToolbar({
    selectedText,
    annotations: _annotations,
    onAddAnnotation,
    categories,
    onAddCategory,
}: AnnotationToolbarProps) {
    const [activeCategory, setActiveCategory] = useState<string>(
        categories[0]?.id || ''
    );

    // Snapshot of selectedText captured on button click (before browser clears it)
    const capturedSelection = useRef<SelectedText | null>(null);

    const [commentPopup, setCommentPopup] = useState<{ type: 'comment' | 'correction'; visible: boolean }>({
        type: 'comment',
        visible: false,
    });
    const [popupText, setPopupText] = useState('');

    // Text color picker
    const [showColorPicker, setShowColorPicker] = useState(false);

    // Category management
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showAddCategory, setShowAddCategory] = useState(false);

    // Suppress _annotations not used warning
    void _annotations;

    // Sync category selection when categories change (first load)
    useEffect(() => {
        if (!activeCategory && categories.length > 0 && categories[0]) {
            setActiveCategory(categories[0].id);
        }
    }, [categories, activeCategory]);

    const activeCategoryObj = categories.find(c => c.id === activeCategory);
    const activeColor = activeCategoryObj?.color || '#3b82f6';

    const createAnnotation = useCallback((
        type: WritingAnnotation['type'],
        sel: SelectedText,
        extras?: { commentText?: string; correctionText?: string; color?: string }
    ) => {
        const annotation: WritingAnnotation = {
            id: crypto.randomUUID(),
            taskNumber: 1,  // Will be overridden by parent
            type,
            startOffset: sel.startOffset,
            endOffset: sel.endOffset,
            color: extras?.color || activeColor,
            categoryId: activeCategory || '',
            categoryLabel: activeCategoryObj?.label || '',
            createdAt: Date.now(),
            ...(extras?.commentText ? { commentText: extras.commentText } : {}),
            ...(extras?.correctionText ? { correctionText: extras.correctionText } : {}),
        };
        onAddAnnotation(annotation);
    }, [activeColor, activeCategory, activeCategoryObj, onAddAnnotation]);

    const handleAnnotation = useCallback((type: WritingAnnotation['type']) => {
        if (!selectedText) return;

        // Capture the selection right now (before the click clears it)
        capturedSelection.current = { ...selectedText };

        if (type === 'comment' || type === 'correction') {
            setCommentPopup({ type, visible: true });
            setPopupText('');
            return;
        }

        if (type === 'textColor') {
            setShowColorPicker(true);
            return;
        }

        // Instant annotation types: highlight, strikethrough
        createAnnotation(type, selectedText);
    }, [selectedText, createAnnotation]);

    const handlePopupSubmit = () => {
        const sel = capturedSelection.current;
        if (!sel || !popupText.trim()) return;

        createAnnotation(
            commentPopup.type,
            sel,
            commentPopup.type === 'comment'
                ? { commentText: popupText.trim() }
                : { correctionText: popupText.trim() }
        );

        setCommentPopup({ type: 'comment', visible: false });
        setPopupText('');
        capturedSelection.current = null;
    };

    const handleColorSelect = (color: string) => {
        const sel = capturedSelection.current;
        if (!sel) return;

        createAnnotation('textColor', sel, { color });
        setShowColorPicker(false);
        capturedSelection.current = null;
    };

    const handleCreateCategory = () => {
        if (!newCategoryName.trim() || !onAddCategory) return;
        const newCat: AnnotationCategory = {
            id: crypto.randomUUID(),
            label: newCategoryName.trim(),
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
            isDefault: false,
        };
        onAddCategory(newCat);
        setActiveCategory(newCat.id);
        setNewCategoryName('');
        setShowAddCategory(false);
    };

    // Determine the "effective" selection — either live or captured
    const effectiveSelection = selectedText || capturedSelection.current;
    const hasSelection = !!selectedText;

    return (
        <div style={{
            padding: '12px 16px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
        }}>
            {/* Annotation type buttons */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {ANNOTATION_BUTTONS.map(btn => (
                    <button
                        key={btn.type}
                        onMouseDown={(e) => {
                            // Prevent the click from clearing the selection
                            e.preventDefault();
                            handleAnnotation(btn.type);
                        }}
                        disabled={!hasSelection}
                        title={`${btn.title}${!hasSelection ? ' (select text first)' : ''}`}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            cursor: hasSelection ? 'pointer' : 'not-allowed',
                            opacity: hasSelection ? 1 : 0.4,
                            fontSize: '0.85rem',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                    >
                        {btn.label}
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{btn.title}</span>
                    </button>
                ))}
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        style={{
                            padding: '3px 10px',
                            borderRadius: '999px',
                            border: activeCategory === cat.id ? `2px solid ${cat.color}` : '1px solid #e2e8f0',
                            background: activeCategory === cat.id ? `${cat.color}15` : '#fff',
                            color: activeCategory === cat.id ? cat.color : '#64748b',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {cat.isDefault && '🔒 '}{cat.label}
                    </button>
                ))}
                {onAddCategory && (
                    <>
                        {showAddCategory ? (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <input
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                                    placeholder="Category name"
                                    style={{
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.7rem',
                                        width: '120px',
                                    }}
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreateCategory}
                                    style={{
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#10b981',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                    }}
                                >✓</button>
                                <button
                                    onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                                    style={{
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#ef4444',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                    }}
                                >✕</button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAddCategory(true)}
                                style={{
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    border: '1px dashed #cbd5e1',
                                    background: 'transparent',
                                    color: '#94a3b8',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                }}
                            >
                                + Add
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* ─── Comment / Correction popup ──────────────────────── */}
            {commentPopup.visible && effectiveSelection && (
                <div style={{
                    marginTop: '12px',
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}>
                    <div style={{
                        fontSize: '0.8rem',
                        color: '#475569',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        <span style={{ fontSize: '1.1rem' }}>
                            {commentPopup.type === 'comment' ? '💬' : '✏️'}
                        </span>
                        <strong>{commentPopup.type === 'comment' ? 'Add comment' : 'Suggest correction'}</strong>
                    </div>
                    <div style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        marginBottom: '8px',
                        padding: '6px 10px',
                        background: '#f1f5f9',
                        borderRadius: '6px',
                        borderLeft: `3px solid ${activeColor}`,
                    }}>
                        Selected: <em>"{effectiveSelection.text.slice(0, 80)}{effectiveSelection.text.length > 80 ? '…' : ''}"</em>
                    </div>
                    <textarea
                        value={popupText}
                        onChange={e => setPopupText(e.target.value)}
                        placeholder={commentPopup.type === 'comment'
                            ? 'Type your comment here… (e.g., "This argument lacks supporting evidence")'
                            : 'Type the corrected text here…'}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.85rem',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            lineHeight: 1.5,
                            outline: 'none',
                            transition: 'border-color 0.15s',
                        }}
                        onFocus={e => { e.target.style.borderColor = activeColor; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button
                            onClick={() => {
                                setCommentPopup({ ...commentPopup, visible: false });
                                capturedSelection.current = null;
                            }}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                color: '#64748b',
                            }}
                        >Cancel</button>
                        <button
                            onClick={handlePopupSubmit}
                            disabled={!popupText.trim()}
                            style={{
                                padding: '6px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: popupText.trim()
                                    ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                                    : '#e2e8f0',
                                color: popupText.trim() ? '#fff' : '#94a3b8',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: popupText.trim() ? 'pointer' : 'not-allowed',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {commentPopup.type === 'comment' ? '💬 Add Comment' : '✏️ Apply Correction'}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Text Color Picker ────────────────────────────── */}
            {showColorPicker && effectiveSelection && (
                <div style={{
                    marginTop: '12px',
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}>
                    <div style={{
                        fontSize: '0.8rem',
                        color: '#475569',
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        <span style={{ fontSize: '1.1rem' }}>🎨</span>
                        <strong>Choose text color</strong>
                    </div>
                    <div style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        marginBottom: '10px',
                        padding: '6px 10px',
                        background: '#f1f5f9',
                        borderRadius: '6px',
                        borderLeft: '3px solid #7c3aed',
                    }}>
                        Selected: <em>"{effectiveSelection.text.slice(0, 80)}{effectiveSelection.text.length > 80 ? '…' : ''}"</em>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, 1fr)',
                        gap: '6px',
                        marginBottom: '10px',
                    }}>
                        {TEXT_COLOR_PALETTE.map(c => (
                            <button
                                key={c.color}
                                onClick={() => handleColorSelect(c.color)}
                                title={c.label}
                                style={{
                                    width: '100%',
                                    aspectRatio: '1',
                                    borderRadius: '8px',
                                    border: '2px solid transparent',
                                    background: c.color,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                    minHeight: '32px',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.boxShadow = `0 2px 8px ${c.color}80`; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                        ))}
                    </div>
                    {/* Text preview */}
                    <div style={{
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        textAlign: 'center',
                        marginBottom: '8px',
                    }}>
                        Click a color to apply
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => {
                                setShowColorPicker(false);
                                capturedSelection.current = null;
                            }}
                            style={{
                                padding: '5px 14px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                color: '#64748b',
                            }}
                        >Cancel</button>
                    </div>
                </div>
            )}

            {/* Selection hint */}
            {!selectedText && !commentPopup.visible && !showColorPicker && (
                <div style={{
                    marginTop: '8px',
                    fontSize: '0.72rem',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                }}>
                    <span style={{ fontSize: '0.9rem' }}>☝️</span>
                    Select text in the essay above to annotate
                </div>
            )}
        </div>
    );
}
