import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentCategoryId, GradingComment } from '../../types/ielts-writing.types';
import CommentCard from './CommentCard';
import CommentComposer from './CommentComposer';
import './CommentSidebar.css';

type FilterMode = 'all' | 'open' | 'resolved' | 'deleted';

interface CommentAnchorPosition {
    commentId: string;
    anchorTop: number;
    anchorRight: number;
    anchorCenterY: number;
}

export interface PendingCommentDraft {
    commentId: string;
    taskNumber: 1 | 2;
    anchorText: string;
    from: number;
    to: number;
    categoryId: CommentCategoryId;
    html: string;
}

export interface CommentSidebarProps {
    comments: GradingComment[];
    taskNumber: 1 | 2;
    focusedCommentId: string | null;
    hoveredCommentId: string | null;
    anchorPositions: CommentAnchorPosition[];
    editorScrollTop: number;
    pendingCommentDraft?: PendingCommentDraft | null;
    onFocusComment: (commentId: string | null) => void;
    onHoverComment: (commentId: string | null) => void;
    onEditComment: (commentId: string, newText: string) => void;
    onResolveComment: (commentId: string) => void;
    onReopenComment: (commentId: string) => void;
    onDeleteComment: (commentId: string) => void;
    onRecoverComment: (commentId: string) => void;
    onCategoryChange: (commentId: string, categoryId: CommentCategoryId) => void;
    onSavePendingComment?: (html: string, categoryId: CommentCategoryId) => void;
    onPendingCommentChange?: (html: string) => void;
    onPendingCommentCategoryChange?: (categoryId: CommentCategoryId) => void;
    onCancelPendingComment?: () => void;
    readOnly?: boolean;
}

export default function CommentSidebar({
    comments,
    taskNumber,
    focusedCommentId,
    hoveredCommentId,
    anchorPositions,
    editorScrollTop: _editorScrollTop,
    pendingCommentDraft = null,
    onFocusComment,
    onHoverComment,
    onEditComment,
    onResolveComment,
    onReopenComment,
    onDeleteComment,
    onRecoverComment,
    onCategoryChange,
    onSavePendingComment,
    onPendingCommentChange,
    onPendingCommentCategoryChange,
    onCancelPendingComment,
    readOnly = false,
}: CommentSidebarProps) {
    const [filter, setFilter] = useState<FilterMode>('open');
    const sidebarRef = useRef<HTMLDivElement>(null);
    const pendingComposerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (pendingCommentDraft && filter !== 'open' && filter !== 'all') {
            setFilter('open');
        }
    }, [filter, pendingCommentDraft]);

    useEffect(() => {
        if (!focusedCommentId) {
            return;
        }

        const focusedComment = comments.find((comment) => comment.id === focusedCommentId);
        if (!focusedComment) {
            return;
        }

        if (focusedComment.status === 'active' && filter !== 'open' && filter !== 'all') {
            setFilter('open');
        }
        if (focusedComment.status === 'resolved' && filter === 'deleted') {
            setFilter('resolved');
        }
        if (focusedComment.status === 'deleted' && filter !== 'deleted') {
            setFilter('deleted');
        }
    }, [comments, filter, focusedCommentId]);

    const positionLookup = useMemo(() => {
        return new Map(anchorPositions.map((position) => [position.commentId, position]));
    }, [anchorPositions]);

    const filteredComments = useMemo(() => {
        let nextComments: GradingComment[];
        switch (filter) {
            case 'resolved':
                nextComments = comments.filter((comment) => comment.status === 'resolved');
                break;
            case 'deleted':
                nextComments = comments.filter((comment) => comment.status === 'deleted');
                break;
            case 'all':
                nextComments = comments.filter((comment) => comment.status !== 'deleted');
                break;
            case 'open':
            default:
                nextComments = comments.filter((comment) => comment.status === 'active');
                break;
        }

        return [...nextComments].sort((left, right) => {
            const leftPosition = positionLookup.get(left.id)?.anchorTop ?? left.from;
            const rightPosition = positionLookup.get(right.id)?.anchorTop ?? right.from;
            return leftPosition - rightPosition;
        });
    }, [comments, filter, positionLookup]);

    const counts = useMemo(() => ({
        all: comments.filter((comment) => comment.status !== 'deleted').length,
        open: comments.filter((comment) => comment.status === 'active').length,
        resolved: comments.filter((comment) => comment.status === 'resolved').length,
        deleted: comments.filter((comment) => comment.status === 'deleted').length,
    }), [comments]);

    useEffect(() => {
        if (!focusedCommentId || !sidebarRef.current) {
            return;
        }

        const cardElement = sidebarRef.current.querySelector(`[data-comment-id="${focusedCommentId}"]`);
        if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [focusedCommentId]);

    useEffect(() => {
        if (!pendingCommentDraft || !pendingComposerRef.current) {
            return;
        }

        pendingComposerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [pendingCommentDraft]);

    const handleSidebarClick = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains('comment-sidebar-cards') || target.classList.contains('comment-sidebar')) {
            onFocusComment(null);
        }
    }, [onFocusComment]);

    return (
        <div
            ref={sidebarRef}
            className="comment-sidebar"
            onClick={handleSidebarClick}
            id="comment-sidebar"
        >
            <div className="comment-sidebar-filters" id="comment-sidebar-filters">
                <button
                    className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                    id="filter-all"
                    type="button"
                >
                    All ({counts.all})
                </button>
                <button
                    className={`filter-pill ${filter === 'open' ? 'active' : ''}`}
                    onClick={() => setFilter('open')}
                    id="filter-open"
                    type="button"
                >
                    Open ({counts.open})
                </button>
                <button
                    className={`filter-pill ${filter === 'resolved' ? 'active' : ''}`}
                    onClick={() => setFilter('resolved')}
                    id="filter-resolved"
                    type="button"
                >
                    Resolved ({counts.resolved})
                </button>
                <button
                    className={`filter-pill ${filter === 'deleted' ? 'active' : ''}`}
                    onClick={() => setFilter('deleted')}
                    id="filter-deleted"
                    type="button"
                >
                    Deleted ({counts.deleted})
                </button>
            </div>

            <div className="comment-sidebar-cards">
                {filteredComments.length === 0 && !pendingCommentDraft ? (
                    <div className="comment-sidebar-empty">
                        {filter === 'open' && 'No open comments'}
                        {filter === 'resolved' && 'No resolved comments'}
                        {filter === 'deleted' && 'No deleted comments'}
                        {filter === 'all' && 'No comments yet'}
                    </div>
                ) : (
                    filteredComments.map((comment) => {
                        return (
                            <div key={comment.id} className="comment-sidebar-card-row">
                                <CommentCard
                                    comment={comment}
                                    isFocused={focusedCommentId === comment.id}
                                    isHovered={hoveredCommentId === comment.id}
                                    taskNumber={taskNumber}
                                    onFocus={onFocusComment}
                                    onHover={onHoverComment}
                                    onEdit={onEditComment}
                                    onResolve={onResolveComment}
                                    onReopen={onReopenComment}
                                    onDelete={onDeleteComment}
                                    onRecover={onRecoverComment}
                                    onCategoryChange={onCategoryChange}
                                    readOnly={readOnly}
                                />
                            </div>
                        );
                    })
                )}

                {pendingCommentDraft && !readOnly && (
                    <div
                        ref={pendingComposerRef}
                        className="comment-sidebar-pending"
                    >
                        <div className="comment-sidebar-pending-label">New comment</div>
                        <CommentComposer
                            value={pendingCommentDraft.html}
                            anchorText={pendingCommentDraft.anchorText}
                            taskNumber={taskNumber}
                            categoryId={pendingCommentDraft.categoryId}
                            autoFocus
                            onChange={onPendingCommentChange}
                            onCategoryChange={onPendingCommentCategoryChange}
                            onCancel={onCancelPendingComment}
                            onSave={(html) => onSavePendingComment?.(html, pendingCommentDraft.categoryId)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
