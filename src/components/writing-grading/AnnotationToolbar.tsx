/**
 * AnnotationToolbar — PRD-0030 Task 5.3
 * Toolbar for adding annotations to student essay text.
 * Shows buttons for highlight, comment, strikethrough, correction, text color.
 * Category chips for IELTS defaults + custom categories.
 * NO MANTINE.
 */

import { useState } from 'react';
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
    const [commentPopup, setCommentPopup] = useState<{ type: 'comment' | 'correction'; visible: boolean }>({
        type: 'comment',
        visible: false,
    });
    const [popupText, setPopupText] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showAddCategory, setShowAddCategory] = useState(false);
    // Suppress _annotations not used warning
    void _annotations;

    const activeCategoryObj = categories.find(c => c.id === activeCategory);
    const activeColor = activeCategoryObj?.color || '#3b82f6';

    const handleAnnotation = (type: WritingAnnotation['type']) => {
        if (!selectedText) return;

        if (type === 'comment' || type === 'correction') {
            setCommentPopup({ type, visible: true });
            setPopupText('');
            return;
        }

        const annotation: WritingAnnotation = {
            id: crypto.randomUUID(),
            taskNumber: 1,  // Will be overridden by parent
            type,
            startOffset: selectedText.startOffset,
            endOffset: selectedText.endOffset,
            color: activeColor,
            categoryId: activeCategory || '',
            categoryLabel: activeCategoryObj?.label || '',
            createdAt: Date.now(),
        };

        onAddAnnotation(annotation);
    };

    const handlePopupSubmit = () => {
        if (!selectedText || !popupText.trim()) return;

        const annotation: WritingAnnotation = {
            id: crypto.randomUUID(),
            taskNumber: 1,  // Will be overridden by parent
            type: commentPopup.type,
            startOffset: selectedText.startOffset,
            endOffset: selectedText.endOffset,
            color: activeColor,
            categoryId: activeCategory || '',
            categoryLabel: activeCategoryObj?.label || '',
            createdAt: Date.now(),
            ...(commentPopup.type === 'comment' ? { commentText: popupText.trim() } : { correctionText: popupText.trim() }),
        };

        onAddAnnotation(annotation);
        setCommentPopup({ type: 'comment', visible: false });
        setPopupText('');
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

    return (
        <div style={{
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
        }}>
            {/* Annotation type buttons */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {ANNOTATION_BUTTONS.map(btn => (
                    <button
                        key={btn.type}
                        onClick={() => handleAnnotation(btn.type)}
                        disabled={!selectedText}
                        title={btn.title}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            cursor: selectedText ? 'pointer' : 'not-allowed',
                            opacity: selectedText ? 1 : 0.4,
                            fontSize: '0.85rem',
                            transition: 'all 0.15s',
                        }}
                    >
                        {btn.label} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{btn.title}</span>
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

            {/* Comment/Correction popup */}
            {commentPopup.visible && selectedText && (
                <div style={{
                    marginTop: '10px',
                    padding: '10px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>
                        {commentPopup.type === 'comment' ? '💬 Add comment for:' : '✏️ Correction for:'}{' '}
                        <em>"{selectedText.text.slice(0, 50)}{selectedText.text.length > 50 ? '…' : ''}"</em>
                    </div>
                    <textarea
                        value={popupText}
                        onChange={e => setPopupText(e.target.value)}
                        placeholder={commentPopup.type === 'comment' ? 'Your comment...' : 'Corrected text...'}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.8rem',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                        }}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                            onClick={() => setCommentPopup({ ...commentPopup, visible: false })}
                            style={{
                                padding: '4px 12px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                            }}
                        >Cancel</button>
                        <button
                            onClick={handlePopupSubmit}
                            disabled={!popupText.trim()}
                            style={{
                                padding: '4px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#3b82f6',
                                color: '#fff',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: popupText.trim() ? 'pointer' : 'not-allowed',
                                opacity: popupText.trim() ? 1 : 0.5,
                            }}
                        >Add</button>
                    </div>
                </div>
            )}

            {/* Selection hint */}
            {!selectedText && (
                <div style={{
                    marginTop: '8px',
                    fontSize: '0.7rem',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                }}>
                    Select text in the essay to annotate
                </div>
            )}
        </div>
    );
}
