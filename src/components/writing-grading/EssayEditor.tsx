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
import { TextSelection } from '@tiptap/pm/state';
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
    onCommentMarkClick: (commentId: string, anchorViewportTop: number | null) => void;
    /** Callback when a highlighted comment mark is hovered in the essay */
    onCommentMarkHover?: (commentId: string | null) => void;
    /** Callback when Original/Marked view changes — parent disables Comments tab */
    onViewModeChange: (mode: 'marked' | 'original') => void;
    /** Callback when editor content changes (for auto-save / task switching) */
    onContentChange?: (json: object) => void;
    /** Callback when correction popup should open — passes selection range */
    onCorrectionRequest?: (from: number, to: number, selectedText: string) => void;
    onCorrectionMarkClick?: (selection: CorrectionMarkSelection) => void;
    /** External quick-comment command from the page */
    pendingQuickComment?: { taskNumber: 1 | 2; preset: QuickCommentPreset; nonce: number } | null;
    /** External correction command from the page */
    pendingCorrection?: {
        taskNumber: 1 | 2;
        action: 'apply' | 'remove';
        from: number;
        to: number;
        correctionText?: string;
        nonce: number;
    } | null;
    /** External comment-mark mutation from the page */
    pendingCommentMutation?: {
        taskNumber: 1 | 2;
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

interface CorrectionSelectionRange {
    from: number;
    to: number;
}

export interface CorrectionMarkSelection {
    from: number;
    to: number;
    selectedText: string;
    correctionText: string;
    anchorViewportTop: number | null;
    anchorViewportLeft: number | null;
}

interface HighlightSelectionState {
    isFullyHighlighted: boolean;
    containsHighlight: boolean;
}

interface OverlayPosition {
    top: number;
    left: number;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const EssayEditor: React.FC<EssayEditorProps> = ({
    originalEssayText,
    initialContent,
    wordCount: _wordCount,
    activeTimeSeconds: _activeTimeSeconds,
    taskNumber,
    onAddComment,
    onGutterDotClick,
    onCommentMarkClick,
    onCommentMarkHover,
    onViewModeChange,
    onContentChange,
    onCorrectionRequest,
    onCorrectionMarkClick,
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
    const [lastHighlightColor, setLastHighlightColor] = useState<string | null>(null);
    const [showHighlightDropdown, setShowHighlightDropdown] = useState(false);
    const [showColorDropdown, setShowColorDropdown] = useState(false);
    const [bubbleMenuPos, setBubbleMenuPos] = useState<OverlayPosition | null>(null);
    const [hoverTooltip, setHoverTooltip] = useState<{ commentId: string; top: number; left: number } | null>(null);
    const highlightDropdownRef = useRef<HTMLDivElement>(null);
    const colorDropdownRef = useRef<HTMLDivElement>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const editorEditableRef = useRef<HTMLDivElement>(null);
    const bubbleMenuRef = useRef<HTMLDivElement>(null);
    const isMouseSelectingRef = useRef(false);
    const bubbleMenuFrameRef = useRef<number | null>(null);
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
            handleClick: (view, _pos, event) => {
                const target = event.target as HTMLElement;
                const commentEl = target.closest('[data-comment-id]');
                if (commentEl) {
                    const commentId = commentEl.getAttribute('data-comment-id');
                    if (commentId) {
                        const rect = (commentEl as HTMLElement).getBoundingClientRect();
                        onCommentMarkClick(commentId, rect.top);
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
    }, [taskNumber, originalEssayText]);

    useEffect(() => {
        editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const nextContent = initialContent || convertTextToTipTapJson(originalEssayText);
        editor.commands.clearContent(false);
        editor.commands.setContent(nextContent, false);
    }, [editor, initialContent, originalEssayText]);

    useEffect(() => {
        setViewMode('marked');
        onViewModeChange('marked');
        setLastHighlightColor(null);
        setShowHighlightDropdown(false);
        setShowColorDropdown(false);
        setBubbleMenuPos(null);
        setHoverTooltip(null);
        lastQuickCommentNonceRef.current = null;
        lastCorrectionNonceRef.current = null;
        lastCommentMutationNonceRef.current = null;
    }, [onViewModeChange, taskNumber]);

    // ─── Keyboard Shortcuts ──────────────────────────────────
    useEffect(() => {
        if (!editor) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Shift+H — Highlight with the last explicitly chosen color
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                if (!editor.state.selection.empty) {
                    handleHighlight();
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
    const clearScheduledBubbleMenu = useCallback(() => {
        if (bubbleMenuFrameRef.current !== null) {
            cancelAnimationFrame(bubbleMenuFrameRef.current);
            bubbleMenuFrameRef.current = null;
        }
    }, []);

    const updateBubbleMenu = useCallback(() => {
        if (!editor) {
            return;
        }

        const { from, to, empty } = editor.state.selection;
        if (empty || viewMode !== 'marked' || isMouseSelectingRef.current) {
            setBubbleMenuPos(null);
            return;
        }

        let startCoords;
        let endCoords;

        try {
            const view = editor.view;
            startCoords = view.coordsAtPos(from);
            endCoords = view.coordsAtPos(to);
        } catch {
            setBubbleMenuPos(null);
            return;
        }

        if (!startCoords || !endCoords) {
            setBubbleMenuPos(null);
            return;
        }

        setBubbleMenuPos(getBubbleMenuOverlayPosition(startCoords, endCoords));
    }, [editor, viewMode]);

    const scheduleBubbleMenuUpdate = useCallback(() => {
        clearScheduledBubbleMenu();
        bubbleMenuFrameRef.current = window.requestAnimationFrame(() => {
            bubbleMenuFrameRef.current = null;
            updateBubbleMenu();
        });
    }, [clearScheduledBubbleMenu, updateBubbleMenu]);

    useEffect(() => {
        if (!editor) return;

        const handleSelectionUpdate = () => {
            if (isMouseSelectingRef.current) {
                setBubbleMenuPos(null);
                return;
            }

            updateBubbleMenu();
        };

        const handleEditorMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) {
                return;
            }

            const target = event.target as Node | null;
            const editorEditable = editorEditableRef.current;

            if (!target || !editorEditable || bubbleMenuRef.current?.contains(target) || !editorEditable.contains(target)) {
                return;
            }

            isMouseSelectingRef.current = true;
            clearScheduledBubbleMenu();
            setBubbleMenuPos(null);
        };

        const handleDocumentMouseUp = () => {
            if (!isMouseSelectingRef.current) {
                return;
            }

            isMouseSelectingRef.current = false;
            scheduleBubbleMenuUpdate();
        };

        const handleBlur = () => {
            isMouseSelectingRef.current = false;
            clearScheduledBubbleMenu();
            setBubbleMenuPos(null);
        };

        const handleContainerScroll = () => {
            setHoverTooltip(null);
            if (editor.state.selection.empty) {
                setBubbleMenuPos(null);
                return;
            }

            scheduleBubbleMenuUpdate();
        };

        const handleWindowResize = () => {
            setHoverTooltip(null);
            scheduleBubbleMenuUpdate();
        };

        editor.on('selectionUpdate', handleSelectionUpdate);
        editor.on('blur', handleBlur);
        document.addEventListener('mousedown', handleEditorMouseDown);
        document.addEventListener('mouseup', handleDocumentMouseUp);
        editorContainerRef.current?.addEventListener('scroll', handleContainerScroll, { passive: true });
        window.addEventListener('resize', handleWindowResize);

        return () => {
            clearScheduledBubbleMenu();
            editor.off('selectionUpdate', handleSelectionUpdate);
            editor.off('blur', handleBlur);
            document.removeEventListener('mousedown', handleEditorMouseDown);
            document.removeEventListener('mouseup', handleDocumentMouseUp);
            editorContainerRef.current?.removeEventListener('scroll', handleContainerScroll);
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [clearScheduledBubbleMenu, editor, scheduleBubbleMenuUpdate, updateBubbleMenu]);

    useEffect(() => {
        if (!editor || readOnly || !onCorrectionMarkClick) {
            return;
        }

        const editorEditable = editorEditableRef.current;
        if (!editorEditable) {
            return;
        }

        const handleCorrectionClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const correctionEl = target?.closest('.correction-mark') as HTMLElement | null;

            if (!correctionEl || !editorEditable.contains(correctionEl)) {
                return;
            }

            const correctionSelection = getCorrectionMarkSelection(editor.view, correctionEl);
            if (!correctionSelection) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            onCorrectionMarkClick(correctionSelection);
        };

        editorEditable.addEventListener('click', handleCorrectionClick);
        return () => {
            editorEditable.removeEventListener('click', handleCorrectionClick);
        };
    }, [editor, onCorrectionMarkClick, readOnly]);

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

            const markRect = commentElement.getBoundingClientRect();
            const nextTooltipPosition = getCommentTooltipOverlayPosition(markRect);

            setHoverTooltip((current) => {
                const nextTooltip = {
                    commentId,
                    top: nextTooltipPosition.top,
                    left: nextTooltipPosition.left,
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
        if (!editor || !pendingQuickComment || pendingQuickComment.taskNumber !== taskNumber) return;
        if (lastQuickCommentNonceRef.current === pendingQuickComment.nonce) return;

        lastQuickCommentNonceRef.current = pendingQuickComment.nonce;
        const { from, to } = editor.state.selection;
        if (from === to) return;

        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        onAddComment(selectedText, from, to, commentId, pendingQuickComment.preset);
    }, [editor, onAddComment, pendingQuickComment, taskNumber]);

    useEffect(() => {
        if (!editor || !pendingCorrection || pendingCorrection.taskNumber !== taskNumber) return;
        if (lastCorrectionNonceRef.current === pendingCorrection.nonce) return;

        lastCorrectionNonceRef.current = pendingCorrection.nonce;
        const normalizedRange = normalizeCorrectionSelectionRange(
            editor.state.doc,
            pendingCorrection.from,
            pendingCorrection.to,
        );

        if (pendingCorrection.action === 'remove') {
            removeCorrectionMark(editor, normalizedRange.from, normalizedRange.to);
            return;
        }

        editor.chain()
            .setTextSelection(normalizedRange)
            .setCorrectionMark({
                correctionText: normalizeCorrectionTextForBoundary(
                    editor.state.doc,
                    normalizedRange.to,
                    pendingCorrection.correctionText || '',
                ),
            })
            .run();
    }, [editor, pendingCorrection, taskNumber]);

    useEffect(() => {
        if (!editor || !pendingCommentMutation || pendingCommentMutation.taskNumber !== taskNumber) return;
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
    }, [editor, pendingCommentMutation, taskNumber]);

    // ─── Handlers ────────────────────────────────────────────

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        setViewMode(mode);
        onViewModeChange(mode);
    }, [onViewModeChange]);

    const preventToolbarBlur = useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
    }, []);

    const applyHighlightToSelection = useCallback((color: string) => {
        if (!editor) return false;

        const { from, to, empty } = editor.state.selection;
        if (empty) return false;

        const highlightType = editor.schema.marks.highlight;
        if (!highlightType) return false;

        const transaction = editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, from, to))
            .removeMark(from, to, highlightType)
            .addMark(from, to, highlightType.create({ color }))
            .scrollIntoView();

        editor.view.dispatch(transaction);
        return true;
    }, [editor]);

    const clearHighlightFromSelection = useCallback(() => {
        if (!editor) return false;

        const { from, to, empty } = editor.state.selection;
        if (empty) return false;

        const highlightType = editor.schema.marks.highlight;
        if (!highlightType) return false;

        const transaction = editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, from, to))
            .removeMark(from, to, highlightType)
            .scrollIntoView();

        editor.view.dispatch(transaction);
        return true;
    }, [editor]);

    const getHighlightSelectionState = useCallback((): HighlightSelectionState => {
        if (!editor) {
            return { isFullyHighlighted: false, containsHighlight: false };
        }

        const { from, to, empty } = editor.state.selection;
        if (empty) {
            return { isFullyHighlighted: false, containsHighlight: false };
        }

        let containsHighlight = false;
        let fullyHighlighted = true;

        editor.state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isText) {
                return;
            }

            const nodeFrom = Math.max(pos, from);
            const nodeTo = Math.min(pos + node.nodeSize, to);
            if (nodeFrom >= nodeTo) {
                return;
            }

            const hasHighlight = node.marks.some((mark) => mark.type.name === 'highlight');
            containsHighlight = containsHighlight || hasHighlight;
            fullyHighlighted = fullyHighlighted && hasHighlight;
        });

        return {
            isFullyHighlighted: containsHighlight && fullyHighlighted,
            containsHighlight,
        };
    }, [editor]);

    const handleHighlight = useCallback((color?: string) => {
        const selectionState = getHighlightSelectionState();

        if (selectionState.isFullyHighlighted) {
            clearHighlightFromSelection();
            setShowHighlightDropdown(false);
            return;
        }

        const chosenColor = color || lastHighlightColor;
        if (!chosenColor) {
            setShowHighlightDropdown(true);
            return;
        }

        const didApply = applyHighlightToSelection(chosenColor);
        if (!didApply) {
            return;
        }

        if (color) {
            setLastHighlightColor(color);
        }

        setShowHighlightDropdown(false);
    }, [applyHighlightToSelection, clearHighlightFromSelection, getHighlightSelectionState, lastHighlightColor]);

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
                                onMouseDown={(event) => {
                                    preventToolbarBlur(event);
                                    handleHighlight();
                                }}
                                title={lastHighlightColor ? 'Highlight (Ctrl+Shift+H)' : 'Choose highlight color'}
                                id="toolbar-highlight"
                            >
                                <span className="toolbar-icon" style={{ borderBottom: `3px solid ${lastHighlightColor || 'transparent'}` }}>
                                    ✏️
                                </span>
                            </button>
                            <button
                                className="toolbar-btn toolbar-dropdown-arrow"
                                onMouseDown={(event) => {
                                    preventToolbarBlur(event);
                                    setShowHighlightDropdown(!showHighlightDropdown);
                                }}
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
                                            onMouseDown={(event) => {
                                                preventToolbarBlur(event);
                                                handleHighlight(c.color);
                                            }}
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
                            onMouseDown={(event) => {
                                preventToolbarBlur(event);
                                handleAddComment();
                            }}
                            disabled={editor.state.selection.empty}
                            title="Add Comment (Ctrl+Shift+M)"
                            id="toolbar-comment"
                        >
                            💬
                        </button>

                        {/* Strikethrough */}
                        <button
                            className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
                            onMouseDown={(event) => {
                                preventToolbarBlur(event);
                                handleStrikethrough();
                            }}
                            disabled={editor.state.selection.empty}
                            title="Strikethrough"
                            id="toolbar-strikethrough"
                        >
                            <span style={{ textDecoration: 'line-through' }}>S</span>
                        </button>

                        {/* Correction */}
                        <button
                            className="toolbar-btn"
                            onMouseDown={(event) => {
                                preventToolbarBlur(event);
                                handleCorrection();
                            }}
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
                                onMouseDown={(event) => {
                                    preventToolbarBlur(event);
                                    setShowColorDropdown(!showColorDropdown);
                                }}
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
                                            onMouseDown={(event) => {
                                                preventToolbarBlur(event);
                                                handleTextColor(c.color);
                                            }}
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
                            onMouseDown={(event) => {
                                preventToolbarBlur(event);
                                handleUndo();
                            }}
                            disabled={!editor.can().undo()}
                            title="Undo (Ctrl+Z)"
                            id="toolbar-undo"
                        >
                            ↩
                        </button>
                        <button
                            className="toolbar-btn"
                            onMouseDown={(event) => {
                                preventToolbarBlur(event);
                                handleRedo();
                            }}
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
                        <div className="essay-editor-editable" ref={editorEditableRef}>
                            <EditorContent editor={editor} />
                        </div>

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
                                    top: bubbleMenuPos.top,
                                    left: bubbleMenuPos.left,
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
                                    onMouseDown={(e) => { e.preventDefault(); }}
                                    title="Use the toolbar for text color"
                                    disabled
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

function normalizeCorrectionSelectionRange(
    doc: { textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string },
    from: number,
    to: number,
): CorrectionSelectionRange {
    const selectedText = doc.textBetween(from, to);

    if (!selectedText) {
        return { from, to };
    }

    const leadingWhitespaceLength = selectedText.match(/^\s+/)?.[0].length ?? 0;
    const trailingWhitespaceLength = selectedText.match(/\s+$/)?.[0].length ?? 0;
    const normalizedFrom = from + leadingWhitespaceLength;
    const normalizedTo = to - trailingWhitespaceLength;

    if (normalizedFrom >= normalizedTo) {
        return { from, to };
    }

    return {
        from: normalizedFrom,
        to: normalizedTo,
    };
}

function normalizeCorrectionTextForBoundary(
    doc: { textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string },
    to: number,
    correctionText: string,
) {
    const normalizedCorrectionText = correctionText.trim();
    if (!normalizedCorrectionText) {
        return '';
    }

    const nextCharacter = doc.textBetween(to, to + 1);
    if (!nextCharacter || /^\s/.test(nextCharacter)) {
        return normalizedCorrectionText;
    }

    return shouldAppendCorrectionSeparator(nextCharacter)
        ? `${normalizedCorrectionText} `
        : normalizedCorrectionText;
}

function shouldAppendCorrectionSeparator(nextCharacter: string) {
    return /[A-Za-z0-9]/.test(nextCharacter);
}

function getBubbleMenuOverlayPosition(
    startCoords: { top: number; bottom: number; left: number; right: number },
    endCoords: { top: number; bottom: number; left: number; right: number },
): OverlayPosition {
    const menuWidth = 182;
    const menuHeight = 42;
    const margin = 8;
    const selectionCenter = (startCoords.left + endCoords.right) / 2;
    const preferredTop = Math.min(startCoords.top, endCoords.top) - menuHeight - 10;
    const fallbackTop = Math.max(startCoords.bottom, endCoords.bottom) + 10;

    return clampOverlayToViewport(
        {
            top: preferredTop >= margin ? preferredTop : fallbackTop,
            left: selectionCenter - menuWidth / 2,
        },
        { width: menuWidth, height: menuHeight },
        margin,
    );
}

function getCommentTooltipOverlayPosition(
    markRect: { top: number; bottom: number; left: number; right: number },
): OverlayPosition {
    const tooltipWidth = 280;
    const tooltipHeight = 180;
    const margin = 16;
    const preferredTop = markRect.bottom + 12;
    const fallbackTop = markRect.top - tooltipHeight - 12;

    return clampOverlayToViewport(
        {
            top: preferredTop + tooltipHeight <= window.innerHeight - margin ? preferredTop : fallbackTop,
            left: markRect.left,
        },
        { width: tooltipWidth, height: tooltipHeight },
        margin,
    );
}

function clampOverlayToViewport(
    position: OverlayPosition,
    size: { width: number; height: number },
    margin: number,
): OverlayPosition {
    if (typeof window === 'undefined') {
        return position;
    }

    return {
        top: Math.min(Math.max(position.top, margin), Math.max(margin, window.innerHeight - size.height - margin)),
        left: Math.min(Math.max(position.left, margin), Math.max(margin, window.innerWidth - size.width - margin)),
    };
}

function removeCorrectionMark(
    editor: {
        state: {
            schema: { marks: Record<string, unknown> };
            tr: { removeMark: (from: number, to: number, markType?: unknown) => { steps: unknown[] } };
        };
        view: { dispatch: (transaction: { steps: unknown[] }) => void };
    },
    from: number,
    to: number,
) {
    const correctionMarkType = editor.state.schema.marks.correctionMark;
    if (!correctionMarkType) {
        return;
    }

    const transaction = editor.state.tr.removeMark(from, to, correctionMarkType);
    if (transaction.steps.length > 0) {
        editor.view.dispatch(transaction);
    }
}

function getCorrectionMarkSelection(
    editorView: { posAtDOM: (node: Node, offset: number) => number },
    correctionElement: HTMLElement,
): CorrectionMarkSelection | null {
    const originalTextNode = findTextNode(correctionElement.querySelector('.correction-mark-original'));
    const selectedText = originalTextNode?.textContent || '';
    if (!originalTextNode || !selectedText) {
        return null;
    }

    const from = editorView.posAtDOM(originalTextNode, 0);
    const to = editorView.posAtDOM(originalTextNode, selectedText.length);
    const rect = correctionElement.getBoundingClientRect();

    return {
        from,
        to,
        selectedText,
        correctionText: correctionElement.getAttribute('data-correction') || '',
        anchorViewportTop: Number.isFinite(rect.top) ? rect.top : null,
        anchorViewportLeft: Number.isFinite(rect.left) ? rect.left : null,
    };
}

function findTextNode(node: Node | null): Text | null {
    if (!node) {
        return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        return node as Text;
    }

    for (const childNode of Array.from(node.childNodes)) {
        const textNode = findTextNode(childNode);
        if (textNode) {
            return textNode;
        }
    }

    return null;
}

export default EssayEditor;
