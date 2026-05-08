import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { RichContent } from '../../core/components/RichContent';
import type { PublishedCommentData, PublishedCorrectionData, PublishedFeedbackItem } from './writingResultSurface';
import { CommentMark, CorrectionMark, MarksOnlyMode } from '../writing-grading/extensions';
import {
    getCommentTooltipOverlayPosition,
    type CommentTooltipPlacement,
    type OverlayPosition,
} from '../writing-grading/annotationOverlayPosition';
import '../writing-grading/extensions/essayEditorStyles.css';
import '../writing-grading/EssayEditor.css';

type MarkupViewMode = 'marked' | 'original';

interface WritingPublishedMarkupViewerProps {
    originalEssayText: string;
    markedContent: Record<string, any> | null;
    comments: PublishedCommentData[];
    corrections?: PublishedCorrectionData[];
    onViewModeChange?: (mode: MarkupViewMode) => void;
    onFeedbackSelect?: (feedbackId: string, anchorViewportTop: number | null) => void;
    compact?: boolean;
}

interface TooltipState extends OverlayPosition {
    feedbackId: string;
    placement: CommentTooltipPlacement;
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
    corrections = [],
    onViewModeChange,
    onFeedbackSelect,
    compact = false,
}: WritingPublishedMarkupViewerProps) {
    const [viewMode, setViewMode] = useState<MarkupViewMode>('marked');
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const feedbackItemsById = useMemo(
        () => new Map<string, PublishedFeedbackItem>([...comments, ...corrections].map((item) => [item.id, item])),
        [comments, corrections],
    );
    const totalFeedbackCount = comments.length + corrections.length;
    const overlayPortalRoot = typeof document !== 'undefined' ? document.body : null;

    useEffect(() => {
        onViewModeChange?.(viewMode);
    }, [onViewModeChange, viewMode]);

    useEffect(() => {
        if (!tooltip || typeof window === 'undefined') {
            return undefined;
        }

        const dismissTooltip = () => {
            setTooltip(null);
        };

        window.addEventListener('resize', dismissTooltip);
        window.addEventListener('scroll', dismissTooltip, true);

        return () => {
            window.removeEventListener('resize', dismissTooltip);
            window.removeEventListener('scroll', dismissTooltip, true);
        };
    }, [tooltip]);

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
                    const { element, feedbackId } = getFeedbackTarget(event.target);

                    if (!feedbackId || !feedbackItemsById.has(feedbackId) || !element) {
                        setTooltip(null);
                        return false;
                    }

                    const rect = element.getBoundingClientRect();
                    const position = getCommentTooltipOverlayPosition(rect);
                    setTooltip({
                        feedbackId,
                        top: position.top,
                        left: position.left,
                        placement: position.placement,
                    });
                    return false;
                },
                mouseout: () => {
                    setTooltip(null);
                    return false;
                },
                click: (_view, event) => {
                    const { element, feedbackId } = getFeedbackTarget(event.target);
                    const rect = element?.getBoundingClientRect();

                    if (!feedbackId || !feedbackItemsById.has(feedbackId)) {
                        return false;
                    }

                    const anchorViewportTop = rect
                        ? rect.top
                        : null;

                    onFeedbackSelect?.(feedbackId, anchorViewportTop);
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

    useEffect(() => {
        if (viewMode === 'original') {
            setTooltip(null);
        }
    }, [viewMode]);

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
        <div style={{ border: '1px solid #dbe4ee', borderRadius: '18px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: compact ? '0.9rem 1rem 0.75rem' : '1rem 1.25rem 0.85rem', borderBottom: '1px solid #eef2f7' }}>
                <div>
                    <strong style={{ display: 'block', fontSize: '0.94rem', color: '#111827' }}>Marked Response</strong>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        {totalFeedbackCount > 0
                            ? `${totalFeedbackCount} published item${totalFeedbackCount === 1 ? '' : 's'}`
                            : 'No published comments or corrections'}
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

            {tooltip && feedbackItemsById.get(tooltip.feedbackId) && (overlayPortalRoot
                ? createPortal(
                    <PublishedFeedbackTooltip
                        tooltip={tooltip}
                        item={feedbackItemsById.get(tooltip.feedbackId) || null}
                    />,
                    overlayPortalRoot,
                )
                : (
                    <PublishedFeedbackTooltip
                        tooltip={tooltip}
                        item={feedbackItemsById.get(tooltip.feedbackId) || null}
                    />
                ))}
        </div>
    );
}

function PublishedFeedbackTooltip({
    tooltip,
    item,
}: {
    tooltip: TooltipState;
    item: PublishedFeedbackItem | null;
}) {
    return (
        <div
            className="essay-comment-tooltip"
            data-comment-tooltip="true"
            data-placement={tooltip.placement}
            style={{
                position: 'fixed',
                top: tooltip.top,
                left: tooltip.left,
                zIndex: 9999,
                maxWidth: 320,
            }}
        >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                {renderTooltipLabel(item)}
            </div>
            {renderTooltipBody(item)}
        </div>
    );
}

function getFeedbackTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
        return { element: null, feedbackId: null };
    }

    const commentElement = target.closest('[data-comment-id]') as HTMLElement | null;
    if (commentElement) {
        return {
            element: commentElement,
            feedbackId: commentElement.getAttribute('data-comment-id'),
        };
    }

    const correctionElement = target.closest('[data-correction-id]') as HTMLElement | null;
    if (correctionElement) {
        return {
            element: correctionElement,
            feedbackId: correctionElement.getAttribute('data-correction-id'),
        };
    }

    return { element: null, feedbackId: null };
}

function renderTooltipLabel(item: PublishedFeedbackItem | null) {
    if (!item) {
        return 'Feedback';
    }

    return item.kind === 'comment' ? item.categoryLabel || 'Comment' : item.label;
}

function renderTooltipBody(item: PublishedFeedbackItem | null) {
    if (!item) {
        return null;
    }

    if (item.kind === 'comment') {
        return (
            <RichContent
                content={item.text}
                className="essay-comment-tooltip-body"
            />
        );
    }

    return (
        <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.84rem', lineHeight: 1.5 }}>
            <div style={{ color: '#cbd5e1' }}>Original</div>
            <div>{item.anchorText || 'Selection unavailable'}</div>
            <div style={{ color: '#cbd5e1', marginTop: '0.25rem' }}>Replace with</div>
            <div>{item.correctionText || 'No replacement text'}</div>
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
