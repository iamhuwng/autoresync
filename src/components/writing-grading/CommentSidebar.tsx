import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    anchorViewportTop: number;
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
    focusedCommentAnchorViewportTop?: number | null;
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
    focusedCommentAnchorViewportTop = null,
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
    const commentsViewportRef = useRef<HTMLDivElement>(null);
    const commentsRailRef = useRef<HTMLDivElement>(null);
    const commentHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const pendingComposerRef = useRef<HTMLDivElement>(null);
    const [commentsStackTranslateY, setCommentsStackTranslateY] = useState(0);

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

    useLayoutEffect(() => {
        if (!focusedCommentId) {
            setCommentsStackTranslateY(0);
            return;
        }

        const viewportElement = commentsViewportRef.current;
        const railElement = commentsRailRef.current;
        const selectedCommentHeaderElement = commentHeaderRefs.current[focusedCommentId] ?? null;
        const selectedCommentPosition = positionLookup.get(focusedCommentId);
        const selectedCommentCard = sidebarRef.current?.querySelector(`[data-comment-id="${focusedCommentId}"]`) as HTMLElement | null;
        const anchorViewportTop = focusedCommentAnchorViewportTop ?? selectedCommentPosition?.anchorViewportTop ?? null;

        if (!selectedCommentCard) {
            setCommentsStackTranslateY(0);
            return;
        }

        if (viewportElement && railElement && selectedCommentHeaderElement && anchorViewportTop !== null) {
            const viewportRect = viewportElement.getBoundingClientRect();
            const railRect = railElement.getBoundingClientRect();
            const headerRect = selectedCommentHeaderElement.getBoundingClientRect();
            const headerHeight = headerRect.height || selectedCommentHeaderElement.offsetHeight || 0;
            const viewportStyles = window.getComputedStyle(viewportElement);
            const viewportPaddingTop = Number.parseFloat(viewportStyles.paddingTop || '0') || 0;
            const viewportPaddingBottom = Number.parseFloat(viewportStyles.paddingBottom || '0') || 0;
            const desiredHeaderTop = Math.min(
                Math.max(anchorViewportTop, viewportRect.top + viewportPaddingTop),
                viewportRect.bottom - viewportPaddingBottom - headerHeight,
            );
            const headerOffsetWithinRail = headerRect.top - railRect.top;
            const desiredHeaderTopWithinViewport = desiredHeaderTop - viewportRect.top - viewportPaddingTop;
            setCommentsStackTranslateY(desiredHeaderTopWithinViewport - headerOffsetWithinRail);
            return;
        }

        setCommentsStackTranslateY(0);
        selectedCommentCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [focusedCommentAnchorViewportTop, focusedCommentId, positionLookup]);

    useEffect(() => {
        if (!pendingCommentDraft || !pendingComposerRef.current) {
            return;
        }

        pendingComposerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [pendingCommentDraft]);

    const handleSidebarClick = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement;
        if (
            target.classList.contains('comment-sidebar-cards')
            || target.classList.contains('comment-sidebar')
            || target.classList.contains('comment-sidebar-rail-viewport')
        ) {
            onFocusComment(null);
        }
    }, [onFocusComment]);

    return (
        <div ref={sidebarRef} className="comment-sidebar" onClick={handleSidebarClick} id="comment-sidebar">
            {/* Filter pills — outside the white card */}
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
                <div
                    ref={commentsViewportRef}
                    className="comment-sidebar-rail-viewport"
                    data-comments-viewport="true"
                >
                    <div
                        ref={commentsRailRef}
                        className="comment-sidebar-rail"
                        data-comments-stack="true"
                        style={{
                            transform: `translateY(${commentsStackTranslateY}px)`,
                            transition: 'transform 0.22s ease',
                        }}
                    >

                        <div className="comment-sidebar-card-list">
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
                                                onHeaderRefChange={(node) => {
                                                    commentHeaderRefs.current[comment.id] = node;
                                                }}
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
                </div>
            </div>
        </div>
    );
}
