/**
 * StudentDetailedMarkup — Grading Editor Redesign (Phase 2)
 * Read-only marked essay with comment sidebar (desktop) or inline accordion (mobile).
 * Renders corrections as strikethrough → green text.
 * Shows comment highlights with category colors.
 * Bidirectional click: highlight ↔ comment card focus.
 * NO MANTINE. NO TipTap dependency (renders from comment data + plain text).
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { WritingSubmission, GradingComment } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './StudentDetailedMarkup.css';

interface StudentDetailedMarkupProps {
    submission: WritingSubmission;
    onBack?: () => void;
}

export default function StudentDetailedMarkup({ submission, onBack }: StudentDetailedMarkupProps) {
    const { tasks, comments: allComments } = submission;
    const [activeTask, setActiveTask] = useState<1 | 2>(1);
    const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [expandedMobileComment, setExpandedMobileComment] = useState<string | null>(null);
    const essayRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Check if mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const taskComments = useMemo(() => {
        if (!allComments || !Array.isArray(allComments)) return [];
        return allComments
            .filter((c: GradingComment) => c.taskNumber === activeTask && c.status === 'active')
            .sort((a: GradingComment, b: GradingComment) => a.createdAt - b.createdAt);
    }, [allComments, activeTask]);

    const activeTaskData = useMemo(() => {
        return tasks.find(t => t.taskNumber === activeTask);
    }, [tasks, activeTask]);

    const handleMarkClick = useCallback((commentId: string) => {
        if (isMobile) {
            setExpandedMobileComment(prev => prev === commentId ? null : commentId);
        } else {
            setFocusedCommentId(commentId);
            // Scroll sidebar to focused card
            const card = document.getElementById(`sdm-card-${commentId}`);
            card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isMobile]);

    const handleCardClick = useCallback((commentId: string) => {
        setFocusedCommentId(commentId);
        // Scroll essay to highlighted text
        const mark = document.getElementById(`sdm-mark-${commentId}`);
        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    // ─── Render essay with comment marks ──────────────────────
    const renderedEssay = useMemo(() => {
        if (!activeTaskData) return null;
        const essayText = activeTaskData.essayText;

        if (taskComments.length === 0) {
            return <div className="sdm-essay-text">{essayText}</div>;
        }

        // For simplicity without TipTap, render essay as plain text
        // with comment anchor texts highlighted.
        // Build segments: find all comment anchor positions in the text.
        const segments: Array<{ start: number; end: number; comment: GradingComment }> = [];
        for (const comment of taskComments) {
            if (!comment.anchorText) continue;
            const idx = essayText.indexOf(comment.anchorText);
            if (idx !== -1) {
                segments.push({ start: idx, end: idx + comment.anchorText.length, comment });
            }
        }

        // Sort by start position (non-overlapping for simplicity)
        segments.sort((a, b) => a.start - b.start);

        // Build JSX elements
        const elements: React.ReactNode[] = [];
        let cursor = 0;

        for (const seg of segments) {
            // Don't process overlapping segments
            if (seg.start < cursor) continue;

            // Text before this segment
            if (seg.start > cursor) {
                elements.push(
                    <span key={`text-${cursor}`}>{essayText.slice(cursor, seg.start)}</span>
                );
            }

            const cat = COMMENT_CATEGORIES[seg.comment.categoryId as keyof typeof COMMENT_CATEGORIES];
            const color = cat?.color || seg.comment.color || '#94a3b8';
            const isFocused = focusedCommentId === seg.comment.id || expandedMobileComment === seg.comment.id;

            elements.push(
                <span
                    key={`mark-${seg.comment.id}`}
                    id={`sdm-mark-${seg.comment.id}`}
                    className={`sdm-mark ${isFocused ? 'focused' : ''}`}
                    style={{ backgroundColor: `${color}30`, color }}
                    onClick={() => handleMarkClick(seg.comment.id)}
                    role="button"
                    tabIndex={0}
                >
                    {essayText.slice(seg.start, seg.end)}
                </span>
            );

            // Mobile inline comment (expanded accordion)
            if (isMobile && expandedMobileComment === seg.comment.id) {
                elements.push(
                    <div
                        key={`inline-${seg.comment.id}`}
                        className="sdm-inline-comment"
                        style={{ borderColor: color }}
                    >
                        <div className="sdm-inline-comment-header">
                            <span className="sdm-comment-dot" style={{ backgroundColor: color }} />
                            <span className="sdm-comment-category">{seg.comment.categoryLabel}</span>
                        </div>
                        <div className="sdm-inline-comment-text">{seg.comment.text}</div>
                    </div>
                );
            }

            cursor = seg.end;
        }

        // Remaining text
        if (cursor < essayText.length) {
            elements.push(
                <span key={`text-end`}>{essayText.slice(cursor)}</span>
            );
        }

        return <div className="sdm-essay-text">{elements}</div>;
    }, [activeTaskData, taskComments, focusedCommentId, expandedMobileComment, handleMarkClick, isMobile]);

    const showMultipleTasks = tasks.length > 1;

    return (
        <div className="sdm-container">
            {/* Back Header */}
            <div className="sdm-back-header">
                {onBack && (
                    <button className="sdm-back-btn" onClick={onBack} id="sdm-back-btn">
                        ← Back to Overview
                    </button>
                )}
                <span className="sdm-back-title">Detailed Markup</span>
            </div>

            {/* Task Tabs (if multi-task) */}
            {showMultipleTasks && (
                <div className="sdm-task-tabs">
                    {([1, 2] as const).map(tn => (
                        <button
                            key={tn}
                            className={`sdm-task-tab ${activeTask === tn ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTask(tn);
                                setFocusedCommentId(null);
                                setExpandedMobileComment(null);
                            }}
                        >
                            Task {tn}
                        </button>
                    ))}
                </div>
            )}

            {/* Content: Essay + Sidebar */}
            <div className="sdm-content">
                {/* Essay Panel */}
                <div className="sdm-essay-panel" ref={essayRef}>
                    {renderedEssay || (
                        <div className="sdm-empty-state">No essay text available.</div>
                    )}
                </div>

                {/* Comment Sidebar (desktop only) */}
                {!isMobile && (
                    <div className="sdm-sidebar" ref={sidebarRef}>
                        <div className="sdm-sidebar-title">
                            Comments ({taskComments.length})
                        </div>
                        {taskComments.length === 0 ? (
                            <div className="sdm-empty-state">No comments on this task.</div>
                        ) : (
                            taskComments.map(comment => {
                                const cat = COMMENT_CATEGORIES[comment.categoryId as keyof typeof COMMENT_CATEGORIES];
                                const color = cat?.color || comment.color || '#94a3b8';

                                return (
                                    <div
                                        key={comment.id}
                                        id={`sdm-card-${comment.id}`}
                                        className={`sdm-comment-card ${focusedCommentId === comment.id ? 'focused' : ''}`}
                                        onClick={() => handleCardClick(comment.id)}
                                    >
                                        <div className="sdm-comment-header">
                                            <span className="sdm-comment-dot" style={{ backgroundColor: color }} />
                                            <span className="sdm-comment-category">{comment.categoryLabel}</span>
                                        </div>
                                        <div className="sdm-comment-anchor">"{comment.anchorText}"</div>
                                        <div className="sdm-comment-text">{comment.text}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
