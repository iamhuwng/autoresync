/**
 * CommentCard — Individual comment card for the sidebar
 *
 * Two states:
 * - Collapsed: category dot + label, truncated text, timestamp, ✕ on hover
 * - Focused: full text, ⋮ menu, ✓ Resolve, category dropdown
 *
 * @see specs/grading-editor-redesign FR-41 through FR-59
 * @module components/writing-grading/CommentCard
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GradingComment, CommentCategoryId } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';

export interface CommentCardProps {
    comment: GradingComment;
    isFocused: boolean;
    isHovered: boolean;
    taskNumber: 1 | 2;
    onFocus: (commentId: string) => void;
    onHover: (commentId: string | null) => void;
    onEdit: (commentId: string, newText: string) => void;
    onResolve: (commentId: string) => void;
    onReopen: (commentId: string) => void;
    onDelete: (commentId: string) => void;
    onRecover: (commentId: string) => void;
    onCategoryChange: (commentId: string, categoryId: CommentCategoryId) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
    comment,
    isFocused,
    isHovered,
    taskNumber,
    onFocus,
    onHover,
    onEdit,
    onResolve,
    onReopen,
    onDelete,
    onRecover,
    onCategoryChange,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(comment.text);
    const [isResolving, setIsResolving] = useState(false);
    const editInputRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Focus edit input when editing starts
    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.selectionStart = editInputRef.current.value.length;
        }
    }, [isEditing]);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    // Handlers
    const handleClick = useCallback(() => {
        if (comment.status !== 'deleted') {
            onFocus(comment.id);
        }
    }, [comment.id, comment.status, onFocus]);

    const handleEditSave = useCallback(() => {
        if (editText.trim() && editText.trim() !== comment.text) {
            onEdit(comment.id, editText.trim());
        }
        setIsEditing(false);
        setShowMenu(false);
    }, [editText, comment.id, comment.text, onEdit]);

    const handleEditCancel = useCallback(() => {
        setEditText(comment.text);
        setIsEditing(false);
    }, [comment.text]);

    const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleEditSave();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            handleEditCancel();
        }
    }, [handleEditSave, handleEditCancel]);

    const handleResolve = useCallback(() => {
        setIsResolving(true);
        setTimeout(() => {
            onResolve(comment.id);
            setIsResolving(false);
        }, 300);
    }, [comment.id, onResolve]);

    const handleDelete = useCallback(() => {
        onDelete(comment.id);
        setShowMenu(false);
    }, [comment.id, onDelete]);

    const handleRecover = useCallback(() => {
        onRecover(comment.id);
        setShowMenu(false);
    }, [comment.id, onRecover]);

    const handleReopen = useCallback(() => {
        onReopen(comment.id);
        setShowMenu(false);
    }, [comment.id, onReopen]);

    // Relative time
    const relativeTime = getRelativeTime(comment.createdAt);

    // Get available categories for dropdown
    const availableCategories = getAvailableCategories(taskNumber);

    // Card classes
    const cardClasses = [
        'comment-card',
        isFocused ? 'comment-card-focused' : 'comment-card-collapsed',
        isHovered ? 'comment-card-hovered' : '',
        isResolving ? 'comment-card-resolving' : '',
        comment.status === 'resolved' ? 'comment-card-resolved' : '',
        comment.status === 'deleted' ? 'comment-card-deleted' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            ref={cardRef}
            className={cardClasses}
            onClick={handleClick}
            onMouseEnter={() => onHover(comment.id)}
            onMouseLeave={() => onHover(null)}
            data-comment-id={comment.id}
            id={`comment-card-${comment.id}`}
        >
            {/* ── Header: Category dot + label + timestamp + actions ── */}
            <div className="comment-card-header">
                <div className="comment-card-category">
                    <span
                        className="category-dot-inline"
                        style={{ backgroundColor: comment.color }}
                    />
                    <span className="category-label">{comment.categoryLabel}</span>
                </div>
                <div className="comment-card-header-right">
                    <span className="comment-card-time">{relativeTime}</span>
                    {/* ✕ close on hover (collapsed) / ⋮ menu (focused) */}
                    {isFocused ? (
                        <div className="comment-card-menu-wrapper" ref={menuRef}>
                            <button
                                className="comment-card-menu-btn"
                                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                                title="More actions"
                                id={`comment-menu-btn-${comment.id}`}
                            >
                                ⋮
                            </button>
                            {showMenu && (
                                <div className="comment-card-menu" id={`comment-menu-${comment.id}`}>
                                    {comment.status === 'active' && (
                                        <>
                                            <button
                                                className="menu-item"
                                                onClick={(e) => { e.stopPropagation(); setIsEditing(true); setShowMenu(false); }}
                                            >
                                                ✏️ Edit
                                            </button>
                                            <button
                                                className="menu-item menu-item-danger"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                            >
                                                🗑️ Delete
                                            </button>
                                        </>
                                    )}
                                    {comment.status === 'resolved' && (
                                        <button
                                            className="menu-item"
                                            onClick={(e) => { e.stopPropagation(); handleReopen(); }}
                                        >
                                            🔄 Re-open
                                        </button>
                                    )}
                                    {comment.status === 'deleted' && (
                                        <button
                                            className="menu-item"
                                            onClick={(e) => { e.stopPropagation(); handleRecover(); }}
                                        >
                                            ♻️ Recover
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            className="comment-card-close-btn"
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                            title="Delete comment"
                            id={`comment-close-btn-${comment.id}`}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* ── Anchor text preview ── */}
            <div className="comment-card-anchor">
                "{comment.anchorText}"
            </div>

            {/* ── Comment text ── */}
            {isEditing ? (
                <div className="comment-card-edit" onClick={(e) => e.stopPropagation()}>
                    <textarea
                        ref={editInputRef}
                        className="comment-card-edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={handleEditSave}
                        rows={2}
                        id={`comment-edit-input-${comment.id}`}
                    />
                </div>
            ) : (
                <div className={`comment-card-text ${!isFocused ? 'text-truncated' : ''}`}>
                    {comment.text}
                </div>
            )}

            {/* ── Focused: Resolve + Category ── */}
            {isFocused && comment.status === 'active' && !isEditing && (
                <div className="comment-card-actions">
                    <button
                        className="comment-resolve-btn"
                        onClick={(e) => { e.stopPropagation(); handleResolve(); }}
                        title="Resolve comment"
                        id={`comment-resolve-${comment.id}`}
                    >
                        ✓ Resolve
                    </button>
                    <select
                        className="comment-category-select"
                        value={comment.categoryId}
                        onChange={(e) => {
                            e.stopPropagation();
                            onCategoryChange(comment.id, e.target.value as CommentCategoryId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        id={`comment-category-select-${comment.id}`}
                    >
                        {availableCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* ── Resolved badge ── */}
            {comment.status === 'resolved' && (
                <div className="comment-card-resolved-badge">
                    ✓ Resolved
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

function getAvailableCategories(taskNumber: 1 | 2) {
    const cats = [];
    // TA or TR based on task number
    if (taskNumber === 1) {
        cats.push(COMMENT_CATEGORIES.ta);
    } else {
        cats.push(COMMENT_CATEGORIES.tr);
    }
    cats.push(COMMENT_CATEGORIES.cc);
    cats.push(COMMENT_CATEGORIES.lr);
    cats.push(COMMENT_CATEGORIES.gra);
    cats.push(COMMENT_CATEGORIES.uncategorized);
    return cats;
}

export default CommentCard;
