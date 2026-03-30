import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { RichContent } from '../../core/components/RichContent';
import type { PublishedCommentData } from './writingResultSurface';
import { CommentMark, CorrectionMark, MarksOnlyMode } from '../writing-grading/extensions';
import '../writing-grading/extensions/essayEditorStyles.css';
import '../writing-grading/EssayEditor.css';

type MarkupViewMode = 'marked' | 'original';

interface WritingPublishedMarkupViewerProps {
    originalEssayText: string;
    markedContent: Record<string, any> | null;
    comments: PublishedCommentData[];
    onViewModeChange?: (mode: MarkupViewMode) => void;
    onCommentSelect?: (commentId: string, anchorViewportTop: number | null) => void;
    compact?: boolean;
}

interface TooltipState {
    commentId: string;
    top: number;
    left: number;
}

function convertTextToTipTapJson(text: string): object {
    if (!text || !text.trim()) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph' }],
        };
    }

    const paragraphs = text.split(/\n\n|\n/).filter((paragraph) => paragraph.trim());

    return {
        type: 'doc',
        content: paragraphs.map((paragraph) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: paragraph.trim() }],
        })),
    };
}

export default function WritingPublishedMarkupViewer({
    originalEssayText,
    markedContent,
    comments,
    onViewModeChange,
    onCommentSelect,
    compact = false,
}: WritingPublishedMarkupViewerProps) {
    const [viewMode, setViewMode] = useState<MarkupViewMode>('marked');
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const commentsById = useMemo(
        () => new Map(comments.map((comment) => [comment.id, comment])),
        [comments],
    );

    useEffect(() => {
        onViewModeChange?.(viewMode);
    }, [onViewModeChange, viewMode]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                code: false,
                blockquote: false,
                horizontalRule: false,
                link: false,
            }),
            Highlight.configure({ multicolor: true }),
            TextStyle,
            Color,
            Placeholder.configure({
                placeholder: 'No essay submitted',
            }),
            CommentMark,
            CorrectionMark,
            MarksOnlyMode.configure({ enabled: true }),
        ],
        content: markedContent || convertTextToTipTapJson(originalEssayText),
        editable: false,
        editorProps: {
            attributes: {
                class: 'essay-editor-content marks-only-mode',
            },
            handleDOMEvents: {
                mouseover: (_view, event) => {
                    const target = event.target as HTMLElement;
                    const commentElement = target.closest('[data-comment-id]') as HTMLElement | null;
                    const commentId = commentElement?.getAttribute('data-comment-id');

                    if (!commentId || !commentsById.has(commentId) || !commentElement) {
                        setTooltip(null);
                        return false;
                    }

                    const rect = commentElement.getBoundingClientRect();
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const tooltipWidth = 320;
                    const relativeLeft = containerRect
                        ? rect.left - containerRect.left + (rect.width / 2)
                        : rect.left + (rect.width / 2);
                    const boundedLeft = containerRect
                        ? Math.min(
                            Math.max(relativeLeft, (tooltipWidth / 2) + 16),
                            Math.max((tooltipWidth / 2) + 16, containerRect.width - (tooltipWidth / 2) - 16),
                        )
                        : relativeLeft;
                    const relativeTop = containerRect
                        ? Math.max(rect.top - containerRect.top - 12, 16)
                        : rect.top - 12;
                    setTooltip({
                        commentId,
                        top: relativeTop,
                        left: boundedLeft,
                    });
                    return false;
                },
                mouseout: () => {
                    setTooltip(null);
                    return false;
                },
                click: (_view, event) => {
                    const target = event.target as HTMLElement;
                    const commentElement = target.closest('[data-comment-id]') as HTMLElement | null;
                    const commentId = commentElement?.getAttribute('data-comment-id');
                    const rect = commentElement?.getBoundingClientRect();

                    if (!commentId || !commentsById.has(commentId)) {
                        return false;
                    }

                    const anchorViewportTop = rect
                        ? rect.top
                        : null;

                    onCommentSelect?.(commentId, anchorViewportTop);
                    return false;
                },
            },
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const nextContent = markedContent || convertTextToTipTapJson(originalEssayText);
        editor.commands.setContent(nextContent, false);
    }, [editor, markedContent, originalEssayText]);

    if (viewMode === 'original') {
        return (
            <div style={{ border: '1px solid #dbe4ee', borderRadius: '18px', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: compact ? '0.9rem 1rem 0.75rem' : '1rem 1.25rem 0.85rem', borderBottom: '1px solid #eef2f7' }}>
                    <strong style={{ fontSize: '0.94rem', color: '#111827' }}>Original Response</strong>
                    <MarkupToggle value={viewMode} onChange={setViewMode} />
                </div>
                <div style={{ padding: compact ? '1rem' : '1.25rem', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#1f2937', fontSize: '0.95rem' }}>
                    {originalEssayText || 'No essay submitted'}
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{ position: 'relative', border: '1px solid #dbe4ee', borderRadius: '18px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: compact ? '0.9rem 1rem 0.75rem' : '1rem 1.25rem 0.85rem', borderBottom: '1px solid #eef2f7' }}>
                <div>
                    <strong style={{ display: 'block', fontSize: '0.94rem', color: '#111827' }}>Marked Response</strong>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        {comments.length > 0 ? `${comments.length} published comment${comments.length === 1 ? '' : 's'}` : 'No published comments'}
                    </span>
                </div>
                <MarkupToggle value={viewMode} onChange={setViewMode} />
            </div>

            <div style={{ padding: compact ? '0.8rem 0.9rem 1rem' : '1rem 1.15rem 1.15rem' }}>
                {editor ? (
                    <EditorContent editor={editor} className="essay-editor-editable" />
                ) : (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#1f2937', fontSize: '0.95rem' }}>
                        {originalEssayText || 'No essay submitted'}
                    </div>
                )}
            </div>

            {tooltip && commentsById.get(tooltip.commentId) && (
                <div
                    style={{
                        position: 'absolute',
                        top: tooltip.top,
                        left: tooltip.left,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                        maxWidth: 320,
                        background: '#111827',
                        color: '#f9fafb',
                        borderRadius: 12,
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.28)',
                        padding: '0.8rem 0.9rem',
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                        {commentsById.get(tooltip.commentId)?.categoryLabel || 'Comment'}
                    </div>
                    <RichContent
                        content={commentsById.get(tooltip.commentId)?.text || ''}
                        className="essay-comment-tooltip-body"
                    />
                </div>
            )}
        </div>
    );
}

function MarkupToggle({
    value,
    onChange,
}: {
    value: MarkupViewMode;
    onChange: (value: MarkupViewMode) => void;
}) {
    return (
        <div style={{ display: 'inline-flex', padding: 4, borderRadius: 999, background: '#f3f4f6', gap: 4 }}>
            {(['marked', 'original'] as MarkupViewMode[]).map((option) => {
                const active = value === option;
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        style={{
                            border: 'none',
                            borderRadius: 999,
                            padding: '0.38rem 0.8rem',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: active ? '#ffffff' : 'transparent',
                            color: active ? '#111827' : '#6b7280',
                            boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                        }}
                    >
                        {option === 'marked' ? 'Marked' : 'Original'}
                    </button>
                );
            })}
        </div>
    );
}
