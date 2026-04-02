import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RichContent } from '../../core/components/RichContent';
import type { CommentCategoryId, GradingComment } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import CommentComposer, { isCommentHtmlMeaningful } from './CommentComposer';

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
    onHeaderRefChange?: (node: HTMLDivElement | null) => void;
    readOnly?: boolean;
}

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

function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
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
    onHeaderRefChange,
    readOnly = false,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftHtml, setDraftHtml] = useState(comment.text);
    const [draftCategoryId, setDraftCategoryId] = useState<CommentCategoryId>(comment.categoryId);
    const [isResolving, setIsResolving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setDraftHtml(comment.text);
        setDraftCategoryId(comment.categoryId);
    }, [comment.categoryId, comment.text]);

    useEffect(() => {
        if (!showMenu) {
            return;
        }

        const handleClick = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    useEffect(() => {
        if (readOnly) {
            setIsEditing(false);
            setShowMenu(false);
        }
    }, [readOnly]);

    const handleClick = useCallback(() => {
        if (comment.status !== 'deleted') {
            onFocus(comment.id);
        }
    }, [comment.id, comment.status, onFocus]);

    const handleResolve = useCallback(() => {
        setIsResolving(true);
        setTimeout(() => {
            onResolve(comment.id);
            setIsResolving(false);
        }, 300);
    }, [comment.id, onResolve]);

    const categoryDefinition = COMMENT_CATEGORIES[comment.categoryId] || COMMENT_CATEGORIES.uncategorized;
    const previewText = useMemo(() => stripHtml(comment.text), [comment.text]);
    const relativeTime = getRelativeTime(comment.createdAt);

    const cardClasses = [
        'comment-card',
        isFocused ? 'comment-card-focused' : 'comment-card-collapsed',
        isEditing ? 'comment-card-editing' : '',
        isHovered ? 'comment-card-hovered' : '',
        isResolving ? 'comment-card-resolving' : '',
        comment.status === 'resolved' ? 'comment-card-resolved' : '',
        comment.status === 'deleted' ? 'comment-card-deleted' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cardClasses}
            onClick={handleClick}
            onMouseEnter={() => onHover(comment.id)}
            onMouseLeave={() => onHover(null)}
            data-comment-id={comment.id}
            id={`comment-card-${comment.id}`}
        >
            <div
                className="comment-card-header"
                data-comment-header-id={comment.id}
                ref={onHeaderRefChange}
            >
                <div className="comment-card-category">
                    <span
                        className="category-dot-inline"
                        style={{ backgroundColor: categoryDefinition.color }}
                    />
                    <span className="category-label">{isEditing ? 'Editing' : comment.categoryLabel}</span>
                </div>
                <div className="comment-card-header-right">
                    <span className="comment-card-time">{relativeTime}</span>
                    {isFocused && !readOnly && !isEditing ? (
                        <div className="comment-card-menu-wrapper" ref={menuRef}>
                            <button
                                className="comment-card-menu-btn"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setShowMenu((current) => !current);
                                }}
                                title="More actions"
                                id={`comment-menu-btn-${comment.id}`}
                                type="button"
                            >
                                ⋮
                            </button>
                            {showMenu && (
                                <div className="comment-card-menu" id={`comment-menu-${comment.id}`}>
                                    {comment.status === 'active' && (
                                        <>
                                            <button
                                                className="menu-item"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setIsEditing(true);
                                                    setShowMenu(false);
                                                }}
                                                type="button"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="menu-item menu-item-danger"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onDelete(comment.id);
                                                    setShowMenu(false);
                                                }}
                                                type="button"
                                            >
                                                Delete
                                            </button>
                                        </>
                                    )}
                                    {comment.status === 'resolved' && (
                                        <button
                                            className="menu-item"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onReopen(comment.id);
                                                setShowMenu(false);
                                            }}
                                            type="button"
                                        >
                                            Re-open
                                        </button>
                                    )}
                                    {comment.status === 'deleted' && (
                                        <button
                                            className="menu-item"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onRecover(comment.id);
                                                setShowMenu(false);
                                            }}
                                            type="button"
                                        >
                                            Recover
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : !readOnly && comment.status === 'active' ? (
                        <button
                            className="comment-card-close-btn"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDelete(comment.id);
                            }}
                            title="Delete comment"
                            id={`comment-close-btn-${comment.id}`}
                            type="button"
                        >
                            ×
                        </button>
                    ) : null}
                </div>
            </div>

            {!isEditing && (
                <div className="comment-card-anchor">
                    "{comment.anchorText}"
                </div>
            )}

            {isEditing ? (
                <div className="comment-card-edit-shell" onClick={(event) => event.stopPropagation()}>
                    <CommentComposer
                        value={draftHtml}
                        anchorText={comment.anchorText}
                        taskNumber={taskNumber}
                        categoryId={draftCategoryId}
                        mode="edit"
                        saveLabel="Update Comment"
                        autoFocus
                        onChange={setDraftHtml}
                        onCategoryChange={setDraftCategoryId}
                        onCancel={() => {
                            setDraftHtml(comment.text);
                            setDraftCategoryId(comment.categoryId);
                            setIsEditing(false);
                        }}
                        onSave={(html) => {
                            if (!isCommentHtmlMeaningful(html)) {
                                return;
                            }

                            if (draftCategoryId !== comment.categoryId) {
                                onCategoryChange(comment.id, draftCategoryId);
                            }
                            onEdit(comment.id, html);
                            setIsEditing(false);
                        }}
                    />
                </div>
            ) : (
                <>
                    <div className={`comment-card-text ${!isFocused ? 'text-truncated' : ''}`}>
                        {isFocused ? (
                            <RichContent content={comment.text} className="comment-card-rich-text" />
                        ) : (
                            previewText
                        )}
                    </div>

                    {isFocused && comment.status === 'active' && !readOnly && (
                        <div className="comment-card-actions">
                            <button
                                className="comment-resolve-btn"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleResolve();
                                }}
                                title="Resolve comment"
                                id={`comment-resolve-${comment.id}`}
                                type="button"
                            >
                                Resolve
                            </button>
                            <select
                                className="comment-category-select"
                                value={comment.categoryId}
                                onChange={(event) => {
                                    event.stopPropagation();
                                    onCategoryChange(comment.id, event.target.value as CommentCategoryId);
                                }}
                                onClick={(event) => event.stopPropagation()}
                                id={`comment-category-select-${comment.id}`}
                            >
                                {(taskNumber === 1
                                    ? [COMMENT_CATEGORIES.ta]
                                    : [COMMENT_CATEGORIES.tr]
                                ).concat([
                                    COMMENT_CATEGORIES.cc,
                                    COMMENT_CATEGORIES.lr,
                                    COMMENT_CATEGORIES.gra,
                                    COMMENT_CATEGORIES.uncategorized,
                                ]).map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {category.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </>
            )}

            {comment.status === 'resolved' && (
                <div className="comment-card-resolved-badge">
                    Resolved
                </div>
            )}
        </div>
    );
};

export default CommentCard;
