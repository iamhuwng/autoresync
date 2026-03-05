/**
 * CommentSidebar — Google Docs-style comment panel
 *
 * Vertically positions comment cards aligned to their anchor text in the essay.
 * Uses a push-down stacking algorithm that degrades gracefully at 20+ comments.
 * Filter pills (All/Open/Resolved), connection lines, bidirectional interactions.
 *
 * @see specs/grading-editor-redesign FR-41 through FR-59
 * @module components/writing-grading/CommentSidebar
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import CommentCard from './CommentCard';
import type { GradingComment, CommentCategoryId } from '../../types/ielts-writing.types';
import './CommentSidebar.css';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type FilterMode = 'all' | 'open' | 'resolved';

interface CommentAnchorPosition {
    commentId: string;
    anchorTop: number;      // Y-offset of the anchor text relative to editor container
    anchorRight: number;    // Right edge X of anchor text (for connection line)
    anchorCenterY: number;  // Vertical center of anchor text
}

export interface CommentSidebarProps {
    comments: GradingComment[];
    taskNumber: 1 | 2;
    focusedCommentId: string | null;
    hoveredCommentId: string | null;
    /** Anchor positions calculated by parent from TipTap DOM */
    anchorPositions: CommentAnchorPosition[];
    /** Sidebar scroll container ref (for connection line SVG) */
    editorScrollTop: number;
    onFocusComment: (commentId: string | null) => void;
    onHoverComment: (commentId: string | null) => void;
    onEditComment: (commentId: string, newText: string) => void;
    onResolveComment: (commentId: string) => void;
    onReopenComment: (commentId: string) => void;
    onDeleteComment: (commentId: string) => void;
    onRecoverComment: (commentId: string) => void;
    onCategoryChange: (commentId: string, categoryId: CommentCategoryId) => void;
}

const CARD_MIN_HEIGHT = 72;   // Minimum card height in pixels
const CARD_GAP = 8;           // Minimum gap between cards
const DEGRADATION_THRESHOLD = 20; // Fallback to list mode

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const CommentSidebar: React.FC<CommentSidebarProps> = ({
    comments,
    taskNumber,
    focusedCommentId,
    hoveredCommentId,
    anchorPositions,
    editorScrollTop,
    onFocusComment,
    onHoverComment,
    onEditComment,
    onResolveComment,
    onReopenComment,
    onDeleteComment,
    onRecoverComment,
    onCategoryChange,
}) => {
    const [filter, setFilter] = useState<FilterMode>('open');
    const sidebarRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // ─── Filter comments ─────────────────────────────────────
    const filteredComments = useMemo(() => {
        let filtered: GradingComment[];
        switch (filter) {
            case 'open':
                filtered = comments.filter(c => c.status === 'active');
                break;
            case 'resolved':
                filtered = comments.filter(c => c.status === 'resolved');
                break;
            case 'all':
            default:
                filtered = comments.filter(c => c.status !== 'deleted');
                break;
        }

        // Sort by essay position (matching anchor positions order)
        filtered.sort((a, b) => {
            const posA = anchorPositions.find(p => p.commentId === a.id);
            const posB = anchorPositions.find(p => p.commentId === b.id);
            return (posA?.anchorTop ?? 0) - (posB?.anchorTop ?? 0);
        });

        return filtered;
    }, [comments, filter, anchorPositions]);

    // ─── Compute card positions (push-down stacking) ─────────
    const cardPositions = useMemo(() => {
        const isDegraded = filteredComments.length >= DEGRADATION_THRESHOLD;

        if (isDegraded) {
            // Graceful degradation: evenly spaced list
            return filteredComments.map((comment, index) => ({
                commentId: comment.id,
                top: index * (CARD_MIN_HEIGHT + CARD_GAP),
            }));
        }

        // Google Docs-style: align to anchor, push down if overlap
        const positions: Array<{ commentId: string; top: number }> = [];
        let lastBottom = 0;

        for (const comment of filteredComments) {
            const anchor = anchorPositions.find(p => p.commentId === comment.id);
            const idealTop = anchor ? anchor.anchorTop - editorScrollTop : lastBottom;
            const top = Math.max(idealTop, lastBottom);

            positions.push({ commentId: comment.id, top });
            lastBottom = top + CARD_MIN_HEIGHT + CARD_GAP;
        }

        return positions;
    }, [filteredComments, anchorPositions, editorScrollTop]);

    // ─── Click outside to unfocus ────────────────────────────
    const handleSidebarClick = useCallback((e: React.MouseEvent) => {
        // Only unfocus if clicking on the sidebar background, not a card
        if ((e.target as HTMLElement).classList.contains('comment-sidebar-cards') ||
            (e.target as HTMLElement).classList.contains('comment-sidebar')) {
            onFocusComment(null);
        }
    }, [onFocusComment]);

    // ─── Auto-scroll to focused card ─────────────────────────
    useEffect(() => {
        if (!focusedCommentId || !sidebarRef.current) return;
        const cardEl = sidebarRef.current.querySelector(`[data-comment-id="${focusedCommentId}"]`);
        if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [focusedCommentId]);

    // ─── Connection line for focused comment ─────────────────
    const connectionLine = useMemo(() => {
        if (!focusedCommentId) return null;

        const anchor = anchorPositions.find(p => p.commentId === focusedCommentId);
        const cardPos = cardPositions.find(p => p.commentId === focusedCommentId);
        if (!anchor || !cardPos) return null;

        // SVG line from anchor right edge to card left edge
        const x1 = 0; // Left edge of sidebar (anchor right is at the gap)
        const y1 = anchor.anchorCenterY - editorScrollTop;
        const x2 = 0; // Left edge of card
        const y2 = cardPos.top + CARD_MIN_HEIGHT / 2;

        return { x1, y1, x2, y2 };
    }, [focusedCommentId, anchorPositions, cardPositions, editorScrollTop]);

    // ─── Counts for filter pills ─────────────────────────────
    const counts = useMemo(() => ({
        all: comments.filter(c => c.status !== 'deleted').length,
        open: comments.filter(c => c.status === 'active').length,
        resolved: comments.filter(c => c.status === 'resolved').length,
    }), [comments]);

    // ─── RENDER ──────────────────────────────────────────────

    const isDegraded = filteredComments.length >= DEGRADATION_THRESHOLD;

    return (
        <div
            ref={sidebarRef}
            className="comment-sidebar"
            onClick={handleSidebarClick}
            id="comment-sidebar"
        >
            {/* ── Filter Pills ── */}
            <div className="comment-sidebar-filters" id="comment-sidebar-filters">
                <button
                    className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                    id="filter-all"
                >
                    All ({counts.all})
                </button>
                <button
                    className={`filter-pill ${filter === 'open' ? 'active' : ''}`}
                    onClick={() => setFilter('open')}
                    id="filter-open"
                >
                    Open ({counts.open})
                </button>
                <button
                    className={`filter-pill ${filter === 'resolved' ? 'active' : ''}`}
                    onClick={() => setFilter('resolved')}
                    id="filter-resolved"
                >
                    Resolved ({counts.resolved})
                </button>
            </div>

            {/* ── Degradation notice ── */}
            {isDegraded && (
                <div className="comment-sidebar-degraded-notice">
                    📋 Comments are listed in essay order
                </div>
            )}

            {/* ── SVG Connection Line ── */}
            {connectionLine && (
                <svg
                    ref={svgRef}
                    className="comment-connection-svg"
                    id="comment-connection-svg"
                >
                    <line
                        x1={connectionLine.x1}
                        y1={connectionLine.y1}
                        x2={connectionLine.x2}
                        y2={connectionLine.y2}
                        stroke="#94a3b8"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                    />
                </svg>
            )}

            {/* ── Comment Cards ── */}
            <div className="comment-sidebar-cards">
                {filteredComments.length === 0 ? (
                    <div className="comment-sidebar-empty">
                        {filter === 'open' && 'No open comments'}
                        {filter === 'resolved' && 'No resolved comments'}
                        {filter === 'all' && 'No comments yet'}
                    </div>
                ) : (
                    filteredComments.map((comment) => {
                        const pos = cardPositions.find(p => p.commentId === comment.id);
                        const style: React.CSSProperties = isDegraded
                            ? {}
                            : { position: 'absolute', top: pos?.top ?? 0, left: 0, right: 0 };

                        return (
                            <div key={comment.id} style={style}>
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
                                />
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default CommentSidebar;
