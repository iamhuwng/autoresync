/**
 * EssayEditor — TipTap-based Essay Editor for Grading
 *
 * Left column of the grading editor. Teacher can apply marks (highlight,
 * comment, correction, strikethrough, text color) but CANNOT modify the
 * student's essay text (marks-only mode).
 *
 * Features:
 * - Fixed toolbar with annotation buttons
 * - TipTap BubbleMenu near text selection
 * - Left gutter with colored comment dots
 * - Original / Marked toggle
 * - Keyboard shortcuts (Ctrl+Shift+H, Ctrl+Shift+M, etc.)
 *
 * @see specs/grading-editor-redesign FR-GROUP-1
 * @module components/writing-grading/EssayEditor
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { CommentMark, CorrectionMark, MarksOnlyMode } from './extensions';
import { RichContent } from '../../core/components/RichContent';
import type { GradingComment, QuickCommentPreset } from '../../types/ielts-writing.types';
import './extensions/essayEditorStyles.css';
import './EssayEditor.css';

// ═══════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Preset highlight colors */
const HIGHLIGHT_COLORS = [
    { name: 'Yellow', color: '#fef08a', hex: '#eab308' },
    { name: 'Green', color: '#bbf7d0', hex: '#22c55e' },
    { name: 'Blue', color: '#bfdbfe', hex: '#3b82f6' },
    { name: 'Purple', color: '#e9d5ff', hex: '#a855f7' },
    { name: 'Orange', color: '#fed7aa', hex: '#f97316' },
    { name: 'Red', color: '#fecaca', hex: '#ef4444' },
] as const;

export interface EssayEditorProps {
    /** The student's original essay text (never mutated) */
    originalEssayText: string;
    /** TipTap JSON content to initialize with (null = load from originalEssayText) */
    initialContent: object | null;
    /** Word count from the submission */
    wordCount: number;
    /** Active writing time in seconds */
    activeTimeSeconds: number;
    /** Current task number (1 or 2) for dynamic labels */
    taskNumber: 1 | 2;
    /** Callback when a comment mark is added — passes the selected text and generated commentId */
    onAddComment: (
        selectedText: string,
        from: number,
        to: number,
        commentId: string,
        preset?: QuickCommentPreset
    ) => void;
    /** Callback when a comment gutter dot is clicked */
    onGutterDotClick: (commentId: string) => void;
    /** Callback when a highlighted comment mark is clicked in the essay */
    onCommentMarkClick: (commentId: string) => void;
    /** Callback when a highlighted comment mark is hovered in the essay */
    onCommentMarkHover?: (commentId: string | null) => void;
    /** Callback when Original/Marked view changes — parent disables Comments tab */
    onViewModeChange: (mode: 'marked' | 'original') => void;
    /** Callback when editor content changes (for auto-save / task switching) */
    onContentChange?: (json: object) => void;
    /** Callback when correction popup should open — passes selection range */
    onCorrectionRequest?: (from: number, to: number, selectedText: string) => void;
    /** External quick-comment command from the page */
    pendingQuickComment?: { preset: QuickCommentPreset; nonce: number } | null;
    /** External correction command from the page */
    pendingCorrection?: { from: number; to: number; correctionText: string; nonce: number } | null;
    /** External comment-mark mutation from the page */
    pendingCommentMutation?: {
        action: 'remove' | 'apply';
        commentId: string;
        color: string;
        from: number;
        to: number;
        nonce: number;
    } | null;
    /** Comment mark positions for gutter dots: [{commentId, color, top}] */
    commentPositions?: Array<{ commentId: string; color: string; top: number }>;
    /** Saved comments for tooltip content */
    comments?: GradingComment[];
    /** ID of the currently focused comment (for highlighting) */
    focusedCommentId?: string | null;
    /** ID of the currently hovered comment (for subtle highlighting) */
    hoveredCommentId?: string | null;
    /** Read-only review mode */
    readOnly?: boolean;
}

type ViewMode = 'marked' | 'original';

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const EssayEditor: React.FC<EssayEditorProps> = ({
    originalEssayText,
    initialContent,
    wordCount: _wordCount,
    activeTimeSeconds: _activeTimeSeconds,
    taskNumber: _taskNumber,
    onAddComment,
    onGutterDotClick,
    onCommentMarkClick,
    onCommentMarkHover,
    onViewModeChange,
    onContentChange,
    onCorrectionRequest,
    pendingQuickComment = null,
    pendingCorrection = null,
    pendingCommentMutation = null,
    commentPositions = [],
    comments = [],
    focusedCommentId = null,
    hoveredCommentId = null,
    readOnly = false,
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('marked');
    const [lastHighlightColor, setLastHighlightColor] = useState<string>(HIGHLIGHT_COLORS[0].color);
    const [showHighlightDropdown, setShowHighlightDropdown] = useState(false);
    const [showColorDropdown, setShowColorDropdown] = useState(false);
    const [bubbleMenuPos, setBubbleMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [hoverTooltip, setHoverTooltip] = useState<{ commentId: string; top: number; left: number } | null>(null);
    const highlightDropdownRef = useRef<HTMLDivElement>(null);
    const colorDropdownRef = useRef<HTMLDivElement>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const bubbleMenuRef = useRef<HTMLDivElement>(null);
    const lastQuickCommentNonceRef = useRef<number | null>(null);
    const lastCorrectionNonceRef = useRef<number | null>(null);
    const lastCommentMutationNonceRef = useRef<number | null>(null);
    const commentsById = useMemo(() => {
        return new Map(comments.map((comment) => [comment.id, comment]));
    }, [comments]);

    // ─── TipTap Editor Setup ─────────────────────────────────
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable features we don't need for essay display
                heading: false,
                codeBlock: false,
                code: false,
                blockquote: false,
                horizontalRule: false,
                link: false,
            }),
            Highlight.configure({
                multicolor: true,
            }),
            TextStyle,
            Color,
            Placeholder.configure({
                placeholder: 'No essay submitted',
            }),
            CommentMark,
            CorrectionMark,
            MarksOnlyMode.configure({ enabled: true }),
        ],
        content: initialContent || convertTextToTipTapJson(originalEssayText),
        editorProps: {
            attributes: {
                class: 'essay-editor-content marks-only-mode',
                id: 'essay-editor-content',
            },
            // Handle clicks on comment marks
            handleClick: (_view, _pos, event) => {
                const target = event.target as HTMLElement;
                const commentEl = target.closest('[data-comment-id]');
                if (commentEl) {
                    const commentId = commentEl.getAttribute('data-comment-id');
                    if (commentId) {
                        onCommentMarkClick(commentId);
                        return true;
                    }
                }
                return false;
            },
        },
        onUpdate: ({ editor: ed }) => {
            onContentChange?.(ed.getJSON());
        },
        editable: !readOnly,
    });

    useEffect(() => {
        editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    // ─── Keyboard Shortcuts ──────────────────────────────────
    useEffect(() => {
        if (!editor) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Shift+H — Highlight with last-used color
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                if (!editor.state.selection.empty) {
                    editor.chain().focus().toggleHighlight({ color: lastHighlightColor }).run();
                }
            }
            // Ctrl+Shift+M — Add comment
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                e.preventDefault();
                handleAddComment();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [editor, lastHighlightColor]);

    // ─── Close dropdowns on outside click ────────────────────
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (highlightDropdownRef.current && !highlightDropdownRef.current.contains(e.target as Node)) {
                setShowHighlightDropdown(false);
            }
            if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node)) {
                setShowColorDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    // ─── Track selection for bubble menu positioning ─────────
    useEffect(() => {
        if (!editor) return;

        const updateBubbleMenu = () => {
            const { from, to, empty } = editor.state.selection;
            if (empty || viewMode !== 'marked') {
                setBubbleMenuPos(null);
                return;
            }

            // Get the DOM rect of the selection
            const view = editor.view;
            const startCoords = view.coordsAtPos(from);
            const endCoords = view.coordsAtPos(to);

            // Position above the selection, centered
            const containerRect = editorContainerRef.current?.getBoundingClientRect();
            if (!containerRect) return;

            const left = (startCoords.left + endCoords.left) / 2 - containerRect.left;
            const top = startCoords.top - containerRect.top - 44; // 44px above

            setBubbleMenuPos({ top: Math.max(0, top), left: Math.max(8, left) });
        };

        editor.on('selectionUpdate', updateBubbleMenu);
        editor.on('blur', () => setBubbleMenuPos(null));

        return () => {
            editor.off('selectionUpdate', updateBubbleMenu);
            editor.off('blur', () => setBubbleMenuPos(null));
        };
    }, [editor, viewMode]);

    // ─── Apply focused/hovered comment mark classes ──────────
    useEffect(() => {
        if (!editorContainerRef.current) return;
        const container = editorContainerRef.current;

        // Clear all focus/hover classes
        container.querySelectorAll('.comment-focused').forEach(el => el.classList.remove('comment-focused'));
        container.querySelectorAll('.comment-hovered').forEach(el => el.classList.remove('comment-hovered'));

        // Apply focused class + scroll into view
        if (focusedCommentId) {
            const marks = container.querySelectorAll(`[data-comment-id="${focusedCommentId}"]`);
            marks.forEach(el => {
                el.classList.add('comment-focused');
            });
            // Scroll the first mark into view (card→essay direction)
            const firstMark = marks[0] as Element | undefined;
            firstMark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Apply hovered class
        if (hoveredCommentId && hoveredCommentId !== focusedCommentId) {
            container.querySelectorAll(`[data-comment-id="${hoveredCommentId}"]`).forEach(el => {
                el.classList.add('comment-hovered');
            });
        }
    }, [focusedCommentId, hoveredCommentId]);

    useEffect(() => {
        const container = editorContainerRef.current;
        if (!container) {
            return;
        }

        const clearTooltip = () => {
            setHoverTooltip(null);
            onCommentMarkHover?.(null);
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (viewMode !== 'marked') {
                clearTooltip();
                return;
            }

            const target = event.target as HTMLElement | null;
            const commentElement = target?.closest('[data-comment-id]') as HTMLElement | null;
            const commentId = commentElement?.getAttribute('data-comment-id');
            if (!commentElement || !commentId || !commentsById.has(commentId)) {
                clearTooltip();
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const markRect = commentElement.getBoundingClientRect();
            const tooltipLeft = Math.max(
                20,
                Math.min(
                    Math.max(20, container.clientWidth - 300),
                    markRect.left - containerRect.left
                )
            );

            setHoverTooltip((current) => {
                const nextTooltip = {
                    commentId,
                    top: markRect.bottom - containerRect.top + container.scrollTop + 12,
                    left: tooltipLeft,
                };

                if (
                    current
                    && current.commentId === nextTooltip.commentId
                    && current.top === nextTooltip.top
                    && current.left === nextTooltip.left
                ) {
                    return current;
                }

                return nextTooltip;
            });
            onCommentMarkHover?.(commentId);
        };

        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', clearTooltip);

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', clearTooltip);
        };
    }, [commentsById, onCommentMarkHover, viewMode]);

    useEffect(() => {
        if (!editor || !pendingQuickComment) return;
        if (lastQuickCommentNonceRef.current === pendingQuickComment.nonce) return;

        lastQuickCommentNonceRef.current = pendingQuickComment.nonce;
        const { from, to } = editor.state.selection;
        if (from === to) return;

        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        onAddComment(selectedText, from, to, commentId, pendingQuickComment.preset);
    }, [editor, onAddComment, pendingQuickComment]);

    useEffect(() => {
        if (!editor || !pendingCorrection) return;
        if (lastCorrectionNonceRef.current === pendingCorrection.nonce) return;

        lastCorrectionNonceRef.current = pendingCorrection.nonce;
        editor.chain()
            .focus()
            .setTextSelection({ from: pendingCorrection.from, to: pendingCorrection.to })
            .setCorrectionMark({ correctionText: pendingCorrection.correctionText })
            .run();
    }, [editor, pendingCorrection]);

    useEffect(() => {
        if (!editor || !pendingCommentMutation) return;
        if (lastCommentMutationNonceRef.current === pendingCommentMutation.nonce) return;

        lastCommentMutationNonceRef.current = pendingCommentMutation.nonce;
        const chain = editor.chain()
            .focus()
            .setTextSelection({ from: pendingCommentMutation.from, to: pendingCommentMutation.to });

        if (pendingCommentMutation.action === 'remove') {
            chain.unsetCommentMark().run();
            return;
        }

        chain
            .setCommentMark({
                commentId: pendingCommentMutation.commentId,
                color: pendingCommentMutation.color,
            })
            .run();
    }, [editor, pendingCommentMutation]);

    // ─── Handlers ────────────────────────────────────────────

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        setViewMode(mode);
        onViewModeChange(mode);
    }, [onViewModeChange]);

    const handleHighlight = useCallback((color?: string) => {
        if (!editor) return;
        const c = color || lastHighlightColor;
        if (color) setLastHighlightColor(color);
        editor.chain().focus().toggleHighlight({ color: c }).run();
        setShowHighlightDropdown(false);
    }, [editor, lastHighlightColor]);

    const handleAddComment = useCallback(() => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return; // No selection
        const selectedText = editor.state.doc.textBetween(from, to, ' ');

        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        onAddComment(selectedText, from, to, commentId);
    }, [editor, onAddComment]);

    const handleStrikethrough = useCallback(() => {
        if (!editor) return;
        editor.chain().focus().toggleStrike().run();
    }, [editor]);

    const handleCorrection = useCallback(() => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        onCorrectionRequest?.(from, to, selectedText);
    }, [editor, onCorrectionRequest]);

    const handleTextColor = useCallback((color: string) => {
        if (!editor) return;
        editor.chain().focus().setColor(color).run();
        setShowColorDropdown(false);
    }, [editor]);

    const handleUndo = useCallback(() => {
        editor?.chain().focus().undo().run();
    }, [editor]);

    const handleRedo = useCallback(() => {
        editor?.chain().focus().redo().run();
    }, [editor]);

    if (!editor) return null;

    // ─── RENDER ──────────────────────────────────────────────

    return (
        <div className="essay-editor-wrapper" id="essay-editor-wrapper">
            {/* ── View Mode Toggle ── */}
            <div className="essay-editor-view-toggle" id="essay-editor-view-toggle">
                <button
                    className={`view-toggle-btn ${viewMode === 'marked' ? 'active' : ''}`}
                    onClick={() => handleViewModeChange('marked')}
                    id="view-toggle-marked"
                    title="View marked essay with annotations"
                >
                    📝 Marked
                </button>
                <button
                    className={`view-toggle-btn ${viewMode === 'original' ? 'active' : ''}`}
                    onClick={() => handleViewModeChange('original')}
                    id="view-toggle-original"
                    title="View original student submission"
                >
                    📄 Original
                </button>
            </div>

            {viewMode === 'marked' ? (
                <>
                    {/* ── Fixed Toolbar ── */}
                    <div className="essay-editor-toolbar" id="essay-editor-toolbar">
                        {/* Highlight with dropdown */}
                        <div className="toolbar-btn-group" ref={highlightDropdownRef}>
                            <button
                                className={`toolbar-btn ${editor.isActive('highlight') ? 'active' : ''}`}
                                onClick={() => handleHighlight()}
                                title="Highlight (Ctrl+Shift+H)"
                                id="toolbar-highlight"
                            >
                                <span className="toolbar-icon" style={{ borderBottom: `3px solid ${lastHighlightColor}` }}>
                                    ✏️
                                </span>
                            </button>
                            <button
                                className="toolbar-btn toolbar-dropdown-arrow"
                                onClick={() => setShowHighlightDropdown(!showHighlightDropdown)}
                                title="Highlight colors"
                                id="toolbar-highlight-dropdown"
                            >
                                ▾
                            </button>
                            {showHighlightDropdown && (
                                <div className="toolbar-dropdown" id="highlight-color-dropdown">
                                    {HIGHLIGHT_COLORS.map((c) => (
                                        <button
                                            key={c.name}
                                            className="color-dot"
                                            style={{ backgroundColor: c.color, border: `2px solid ${c.hex}` }}
                                            onClick={() => handleHighlight(c.color)}
                                            title={c.name}
                                            id={`highlight-color-${c.name.toLowerCase()}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="toolbar-separator" />

                        {/* Comment */}
                        <button
                            className="toolbar-btn"
                            onClick={handleAddComment}
                            disabled={editor.state.selection.empty}
                            title="Add Comment (Ctrl+Shift+M)"
                            id="toolbar-comment"
                        >
                            💬
                        </button>

                        {/* Strikethrough */}
                        <button
                            className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
                            onClick={handleStrikethrough}
                            disabled={editor.state.selection.empty}
                            title="Strikethrough"
                            id="toolbar-strikethrough"
                        >
                            <span style={{ textDecoration: 'line-through' }}>S</span>
                        </button>

                        {/* Correction */}
                        <button
                            className="toolbar-btn"
                            onClick={handleCorrection}
                            disabled={editor.state.selection.empty}
                            title="Correction"
                            id="toolbar-correction"
                        >
                            ✏️
                        </button>

                        {/* Text Color */}
                        <div className="toolbar-btn-group" ref={colorDropdownRef}>
                            <button
                                className="toolbar-btn"
                                onClick={() => setShowColorDropdown(!showColorDropdown)}
                                title="Text Color"
                                id="toolbar-text-color"
                            >
                                🎨
                            </button>
                            {showColorDropdown && (
                                <div className="toolbar-dropdown" id="text-color-dropdown">
                                    {TEXT_COLORS.map((c) => (
                                        <button
                                            key={c.name}
                                            className="color-dot"
                                            style={{ backgroundColor: c.color }}
                                            onClick={() => handleTextColor(c.color)}
                                            title={c.name}
                                            id={`text-color-${c.name.toLowerCase()}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="toolbar-separator" />

                        {/* Undo / Redo */}
                        <button
                            className="toolbar-btn"
                            onClick={handleUndo}
                            disabled={!editor.can().undo()}
                            title="Undo (Ctrl+Z)"
                            id="toolbar-undo"
                        >
                            ↩
                        </button>
                        <button
                            className="toolbar-btn"
                            onClick={handleRedo}
                            disabled={!editor.can().redo()}
                            title="Redo (Ctrl+Y)"
                            id="toolbar-redo"
                        >
                            ↪
                        </button>
                    </div>

                    {/* ── Editor Area with Gutter ── */}
                    <div className="essay-editor-container" ref={editorContainerRef} id="essay-editor-container">
                        {/* Left gutter with comment dots */}
                        <div className="essay-editor-gutter" id="essay-editor-gutter">
                            {commentPositions.map((cp) => (
                                <div
                                    key={cp.commentId}
                                    className="gutter-dot"
                                    style={{ top: cp.top, backgroundColor: cp.color }}
                                    onClick={() => onGutterDotClick(cp.commentId)}
                                    title="Go to comment"
                                    data-comment-id={cp.commentId}
                                    id={`gutter-dot-${cp.commentId}`}
                                />
                            ))}
                        </div>

                        {/* TipTap Editor Content */}
                        <EditorContent editor={editor} className="essay-editor-editable" />

                        {hoverTooltip && commentsById.get(hoverTooltip.commentId) && (
                            <div
                                className="essay-comment-tooltip"
                                style={{
                                    top: hoverTooltip.top,
                                    left: hoverTooltip.left,
                                }}
                            >
                                <RichContent
                                    className="essay-comment-tooltip-body"
                                    content={commentsById.get(hoverTooltip.commentId)?.text || ''}
                                />
                            </div>
                        )}

                        {/* Custom Bubble Menu — positioned near selection */}
                        {bubbleMenuPos && (
                            <div
                                ref={bubbleMenuRef}
                                className="essay-bubble-menu"
                                style={{
                                    position: 'absolute',
                                    top: bubbleMenuPos.top,
                                    left: bubbleMenuPos.left,
                                    transform: 'translateX(-50%)',
                                    zIndex: 50,
                                }}
                            >
                                <button
                                    className="bubble-btn"
                                    onMouseDown={(e) => { e.preventDefault(); handleHighlight(); }}
                                    title="Highlight"
                                >
                                    ✏️
                                </button>
                                <button
                                    className="bubble-btn"
                                    onMouseDown={(e) => { e.preventDefault(); handleAddComment(); }}
                                    title="Comment"
                                >
                                    💬
                                </button>
                                <button
                                    className="bubble-btn"
                                    onMouseDown={(e) => { e.preventDefault(); handleStrikethrough(); }}
                                    title="Strikethrough"
                                >
                                    <span style={{ textDecoration: 'line-through', fontSize: '12px' }}>S</span>
                                </button>
                                <button
                                    className="bubble-btn"
                                    onMouseDown={(e) => { e.preventDefault(); handleCorrection(); }}
                                    title="Correction"
                                >
                                    ✏️
                                </button>
                                <button
                                    className="bubble-btn"
                                    onMouseDown={(e) => { e.preventDefault(); setShowColorDropdown(!showColorDropdown); }}
                                    title="Text Color"
                                >
                                    🎨
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* ── Original View (read-only plain text) ── */
                <div className="essay-original-view" id="essay-original-view">
                    <div className="essay-original-text">
                        {originalEssayText || (
                            <span className="essay-placeholder">No essay submitted</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Text color presets */
const TEXT_COLORS = [
    { name: 'Red', color: '#ef4444' },
    { name: 'Orange', color: '#f97316' },
    { name: 'Green', color: '#22c55e' },
    { name: 'Blue', color: '#3b82f6' },
    { name: 'Purple', color: '#a855f7' },
    { name: 'Gray', color: '#6b7280' },
    { name: 'Default', color: 'inherit' },
];

/**
 * Convert plain essay text to TipTap-compatible JSON document.
 * Splits by double newlines into paragraphs.
 */
function convertTextToTipTapJson(text: string): object {
    if (!text || !text.trim()) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph' }],
        };
    }

    // Split by double newlines or single newlines for paragraphs
    const paragraphs = text.split(/\n\n|\n/).filter(p => p.trim());

    return {
        type: 'doc',
        content: paragraphs.map(p => ({
            type: 'paragraph',
            content: [{ type: 'text', text: p.trim() }],
        })),
    };
}

export default EssayEditor;
