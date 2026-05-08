import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CommentCategoryId, GradingComment } from '../../types/ielts-writing.types';
import CommentCard from './CommentCard';
import CommentComposer from './CommentComposer';
import { getAlignedRailTranslateY, getVisibleRailLaneBounds, revealRailItemInViewport } from './annotationRailPosition';
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
    anchorViewportTop?: number | null;
    categoryId: CommentCategoryId;
    html: string;
}

type CommentRailItem =
    | {
        kind: 'comment';
        key: string;
        sortPosition: number;
        comment: GradingComment;
    }
    | {
        kind: 'pending';
        key: string;
        sortPosition: number;
        draft: PendingCommentDraft;
    };

export interface CommentSidebarProps {
    comments: GradingComment[];
    taskNumber: 1 | 2;
    focusedCommentId: string | null;
    focusedCommentAnchorViewportTop?: number | null;
    focusedCommentRequestKey?: number;
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
    focusedCommentRequestKey = 0,
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
    const pendingComposerContainerRef = useRef<HTMLDivElement>(null);
    const pendingComposerHeaderRef = useRef<HTMLDivElement>(null);
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
            if (left.from !== right.from) {
                return left.from - right.from;
            }

            return left.to - right.to;
        });
    }, [comments, filter]);

    const railItems = useMemo<CommentRailItem[]>(() => {
        const nextItems: CommentRailItem[] = filteredComments.map((comment) => ({
            kind: 'comment',
            key: comment.id,
            sortPosition: comment.from,
            comment,
        }));

        if (pendingCommentDraft && !readOnly) {
            nextItems.push({
                kind: 'pending',
                key: `pending-${pendingCommentDraft.commentId}`,
                sortPosition: pendingCommentDraft.from,
                draft: pendingCommentDraft,
            });
        }

        return nextItems.sort((left, right) => {
            if (left.sortPosition !== right.sortPosition) {
                return left.sortPosition - right.sortPosition;
            }

            if (left.kind === right.kind) {
                return 0;
            }

            return left.kind === 'comment' ? -1 : 1;
        });
    }, [filteredComments, pendingCommentDraft, readOnly]);

    const counts = useMemo(() => ({
        all: comments.filter((comment) => comment.status !== 'deleted').length,
        open: comments.filter((comment) => comment.status === 'active').length,
        resolved: comments.filter((comment) => comment.status === 'resolved').length,
        deleted: comments.filter((comment) => comment.status === 'deleted').length,
    }), [comments]);

    const activeRailTarget = useMemo(() => {
        if (focusedCommentId) {
            return {
                kind: 'comment' as const,
                id: focusedCommentId,
                anchorViewportTop: focusedCommentAnchorViewportTop
                    ?? positionLookup.get(focusedCommentId)?.anchorViewportTop
                    ?? null,
                requestKey: focusedCommentRequestKey,
            };
        }

        if (pendingCommentDraft && !readOnly) {
            return {
                kind: 'pending' as const,
                id: pendingCommentDraft.commentId,
                anchorViewportTop: positionLookup.get(pendingCommentDraft.commentId)?.anchorViewportTop
                    ?? pendingCommentDraft.anchorViewportTop
                    ?? null,
                requestKey: 0,
            };
        }

        return null;
    }, [
        focusedCommentAnchorViewportTop,
        focusedCommentId,
        focusedCommentRequestKey,
        pendingCommentDraft,
        positionLookup,
        readOnly,
    ]);

    useLayoutEffect(() => {
        if (!activeRailTarget) {
            setCommentsStackTranslateY(0);
            return;
        }

        const viewportElement = commentsViewportRef.current;
        const railElement = commentsRailRef.current;
        const selectedRailHeaderElement = activeRailTarget.kind === 'pending'
            ? pendingComposerHeaderRef.current
            : commentHeaderRefs.current[activeRailTarget.id] ?? null;
        const selectedRailElement = activeRailTarget.kind === 'pending'
            ? pendingComposerContainerRef.current
            : sidebarRef.current?.querySelector(`[data-comment-id="${activeRailTarget.id}"]`) as HTMLElement | null;

        if (!selectedRailElement) {
            setCommentsStackTranslateY(0);
            return;
        }

        if (activeRailTarget.kind === 'pending' && viewportElement) {
            const viewportStyles = window.getComputedStyle(viewportElement);
            const viewportPaddingTop = Number.parseFloat(viewportStyles.paddingTop || '0') || 0;
            const viewportPaddingBottom = Number.parseFloat(viewportStyles.paddingBottom || '0') || 0;
            const { height } = getVisibleRailLaneBounds({
                viewportElement,
                paddingTop: viewportPaddingTop,
                paddingBottom: viewportPaddingBottom,
            });
            if (height > 0) {
                selectedRailElement.style.maxHeight = `${Math.round(height)}px`;
            } else {
                selectedRailElement.style.removeProperty('max-height');
            }
        } else if (pendingComposerContainerRef.current) {
            pendingComposerContainerRef.current.style.removeProperty('max-height');
        }

        if (viewportElement && railElement && selectedRailHeaderElement && activeRailTarget.anchorViewportTop !== null) {
            const viewportStyles = window.getComputedStyle(viewportElement);
            const viewportPaddingTop = Number.parseFloat(viewportStyles.paddingTop || '0') || 0;
            const viewportPaddingBottom = Number.parseFloat(viewportStyles.paddingBottom || '0') || 0;
            setCommentsStackTranslateY(getAlignedRailTranslateY({
                viewportElement,
                stackElement: railElement,
                headerElement: selectedRailHeaderElement,
                fitElement: selectedRailElement,
                anchorViewportTop: activeRailTarget.anchorViewportTop,
                paddingTop: viewportPaddingTop,
                paddingBottom: viewportPaddingBottom,
            }));
            return;
        }

        setCommentsStackTranslateY(0);
        if (viewportElement) {
            const viewportStyles = window.getComputedStyle(viewportElement);
            const viewportPaddingTop = Number.parseFloat(viewportStyles.paddingTop || '0') || 0;
            const viewportPaddingBottom = Number.parseFloat(viewportStyles.paddingBottom || '0') || 0;
            revealRailItemInViewport({
                viewportElement,
                itemElement: selectedRailElement,
                paddingTop: viewportPaddingTop,
                paddingBottom: viewportPaddingBottom,
            });
        }
    }, [activeRailTarget, railItems]);

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
                            {railItems.length === 0 ? (
                                <div className="comment-sidebar-empty">
                                    {filter === 'open' && 'No open comments'}
                                    {filter === 'resolved' && 'No resolved comments'}
                                    {filter === 'deleted' && 'No deleted comments'}
                                    {filter === 'all' && 'No comments yet'}
                                </div>
                            ) : (
                                railItems.map((item) => {
                                    if (item.kind === 'pending') {
                                        return (
                                            <div
                                                key={item.key}
                                                ref={pendingComposerContainerRef}
                                                className="comment-sidebar-card-row comment-sidebar-card-row-pending"
                                                data-rail-item-id={item.draft.commentId}
                                                data-rail-item-kind="pending"
                                                data-pending-comment-id={item.draft.commentId}
                                            >
                                                <div className="comment-sidebar-pending">
                                                    <div
                                                        ref={pendingComposerHeaderRef}
                                                        className="comment-sidebar-pending-label"
                                                        data-pending-comment-header-id={item.draft.commentId}
                                                    >
                                                        New comment
                                                    </div>
                                                    <CommentComposer
                                                        value={item.draft.html}
                                                        anchorText={item.draft.anchorText}
                                                        taskNumber={taskNumber}
                                                        categoryId={item.draft.categoryId}
                                                        autoFocus
                                                        onChange={onPendingCommentChange}
                                                        onCategoryChange={onPendingCommentCategoryChange}
                                                        onCancel={onCancelPendingComment}
                                                        onSave={(html) => onSavePendingComment?.(html, item.draft.categoryId)}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={item.key}
                                            className="comment-sidebar-card-row"
                                            data-rail-item-id={item.comment.id}
                                            data-rail-item-kind="comment"
                                        >
                                            <CommentCard
                                                comment={item.comment}
                                                isFocused={focusedCommentId === item.comment.id}
                                                isHovered={hoveredCommentId === item.comment.id}
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
                                                    commentHeaderRefs.current[item.comment.id] = node;
                                                }}
                                                readOnly={readOnly}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
