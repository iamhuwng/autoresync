/**
 * TabbedFeedbackEditor — Single TipTap editor with tabbed criterion feedback
 *
 * Replaces the old FeedbackPanel which had 5 separate TipTap editors.
 * Now uses a single editor instance with tab pills to switch between
 * criterion-specific feedback content. Content is preserved on tab switch
 * via an internal state object.
 *
 * @see specs/grading-editor-redesign FR-60 through FR-65
 * @module components/writing-grading/TabbedFeedbackEditor
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import './TabbedFeedbackEditor.css';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type FeedbackTab = 'taskSummary' | 'ta' | 'cc' | 'lr' | 'gra';

export interface FeedbackContent {
    taskSummary: string;
    ta: string;
    cc: string;
    lr: string;
    gra: string;
}

export interface TabbedFeedbackEditorProps {
    taskNumber: 1 | 2;
    /** Initial feedback content (HTML per tab) */
    feedback: FeedbackContent;
    /** Called on every content change with updated feedback */
    onChange: (feedback: FeedbackContent) => void;
    onTabChange?: (tab: FeedbackTab) => void;
}

// ═══════════════════════════════════════════════════════════════
// TAB CONFIG
// ═══════════════════════════════════════════════════════════════

interface TabConfig {
    id: FeedbackTab;
    label: string;
    criterionName: string;
}

function normalizeFeedbackHtml(content: string) {
    return content || '<p></p>';
}

function getTabs(taskNumber: 1 | 2): TabConfig[] {
    return [
        { id: 'taskSummary', label: 'Task Summary', criterionName: 'task summary' },
        { id: 'ta', label: taskNumber === 1 ? 'TA' : 'TR', criterionName: taskNumber === 1 ? 'Task Achievement' : 'Task Response' },
        { id: 'cc', label: 'CC', criterionName: 'Coherence & Cohesion' },
        { id: 'lr', label: 'LR', criterionName: 'Lexical Resource' },
        { id: 'gra', label: 'GRA', criterionName: 'Grammatical Range & Accuracy' },
    ];
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const TabbedFeedbackEditor: React.FC<TabbedFeedbackEditorProps> = ({
    taskNumber,
    feedback,
    onChange,
    onTabChange,
}) => {
    const [activeTab, setActiveTab] = useState<FeedbackTab>('taskSummary');
    const contentRef = useRef<FeedbackContent>({ ...feedback });
    const previousTaskNumberRef = useRef(taskNumber);
    const tabs = getTabs(taskNumber);
    const activeConfig = tabs.find(t => t.id === activeTab)!;
    const preventToolbarBlur = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    }, []);

    // TipTap Editor
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                code: false,
                blockquote: false,
                horizontalRule: false,
            }),
            Underline,
            Placeholder.configure({
                placeholder: `Write your ${activeConfig.criterionName} feedback for Task ${taskNumber}...`,
            }),
        ],
        content: normalizeFeedbackHtml(feedback[activeTab]),
        onUpdate: ({ editor: ed }) => {
            const html = ed.getHTML();
            contentRef.current = { ...contentRef.current, [activeTab]: html };
            onChange(contentRef.current);
        },
    });

    useEffect(() => {
        const taskChanged = previousTaskNumberRef.current !== taskNumber;
        previousTaskNumberRef.current = taskNumber;
        contentRef.current = { ...feedback };

        if (taskChanged) {
            setActiveTab('taskSummary');
            onTabChange?.('taskSummary');
        }

        if (!editor) {
            return;
        }

        const nextTab = taskChanged ? 'taskSummary' : activeTab;
        const nextContent = normalizeFeedbackHtml(feedback[nextTab]);
        const currentContent = editor.getHTML();
        if (currentContent === nextContent) {
            return;
        }

        editor.commands.setContent(nextContent, { emitUpdate: false });
    }, [activeTab, editor, feedback, onTabChange, taskNumber]);

    // Switch tab: save current → load new
    const handleTabSwitch = useCallback((tabId: FeedbackTab) => {
        if (!editor || tabId === activeTab) return;

        // Save current tab content
        contentRef.current = { ...contentRef.current, [activeTab]: editor.getHTML() };

        // Switch tab
        setActiveTab(tabId);
        onTabChange?.(tabId);

        // Load new tab content
        const newContent = normalizeFeedbackHtml(contentRef.current[tabId]);
        editor.commands.setContent(newContent, { emitUpdate: false });
    }, [editor, activeTab, onTabChange]);

    // Update placeholder when tab changes
    useEffect(() => {
        if (!editor) return;
        // Force placeholder update by destroying and re-adding the Placeholder extension
        // This is a TipTap limitation — placeholder text is set at configure time
        // Workaround: use a data attribute on the editor element
        const editorEl = editor.view.dom as HTMLElement;
        editorEl.setAttribute('data-placeholder-text', `Write your ${activeConfig.criterionName} feedback for Task ${taskNumber}...`);
    }, [editor, activeTab, activeConfig, taskNumber]);

    if (!editor) return null;

    return (
        <div className="tabbed-feedback-editor" id="tabbed-feedback-editor">
            {/* ── Tab Pills ── */}
            <div className="feedback-tabs" id="feedback-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`feedback-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => handleTabSwitch(tab.id)}
                        id={`feedback-tab-${tab.id}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Toolbar ── */}
            <div className="feedback-toolbar" id="feedback-toolbar">
                <button
                    className={`feedback-toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    type="button"
                    title="Bold (Ctrl+B)"
                >
                    <strong>B</strong>
                </button>
                <button
                    className={`feedback-toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    type="button"
                    title="Italic (Ctrl+I)"
                >
                    <em>I</em>
                </button>
                <button
                    className={`feedback-toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    type="button"
                    title="Underline (Ctrl+U)"
                >
                    <u>U</u>
                </button>

                <span className="feedback-toolbar-sep" />

                <button
                    className={`feedback-toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    type="button"
                    title="Bullet List"
                >
                    •
                </button>
                <button
                    className={`feedback-toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    type="button"
                    title="Numbered List"
                >
                    1.
                </button>

                <span className="feedback-toolbar-sep" />

                <button
                    className="feedback-toolbar-btn"
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    type="button"
                    title="Undo (Ctrl+Z)"
                >
                    ↩
                </button>
                <button
                    className="feedback-toolbar-btn"
                    onMouseDown={preventToolbarBlur}
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    type="button"
                    title="Redo (Ctrl+Y)"
                >
                    ↪
                </button>
            </div>

            {/* ── Editor ── */}
            <div className="feedback-editor-content">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default TabbedFeedbackEditor;
