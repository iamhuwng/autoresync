import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import type { CommentCategoryId } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './CommentComposer.css';

interface CommentComposerProps {
    value: string;
    anchorText: string;
    taskNumber: 1 | 2;
    categoryId: CommentCategoryId;
    mode?: 'new' | 'edit';
    saveLabel?: string;
    showCancel?: boolean;
    autoFocus?: boolean;
    onChange?: (html: string) => void;
    onCategoryChange?: (categoryId: CommentCategoryId) => void;
    onCancel?: () => void;
    onSave: (html: string) => void;
}

export function isCommentHtmlMeaningful(html: string) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim().length > 0;
}

function getAvailableCategories(taskNumber: 1 | 2) {
    return [
        taskNumber === 1 ? COMMENT_CATEGORIES.ta : COMMENT_CATEGORIES.tr,
        COMMENT_CATEGORIES.cc,
        COMMENT_CATEGORIES.lr,
        COMMENT_CATEGORIES.gra,
        COMMENT_CATEGORIES.uncategorized,
    ];
}

function escapeHtml(text: string) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeToHtml(content: string) {
    if (!content.trim()) {
        return '';
    }

    if (content.includes('<')) {
        return content;
    }

    return `<p>${escapeHtml(content)}</p>`;
}

export default function CommentComposer({
    value,
    anchorText,
    taskNumber,
    categoryId,
    mode = 'new',
    saveLabel = 'Save Comment',
    showCancel = true,
    autoFocus = false,
    onChange,
    onCategoryChange,
    onCancel,
    onSave,
}: CommentComposerProps) {
    const categories = useMemo(() => getAvailableCategories(taskNumber), [taskNumber]);
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
                placeholder: 'Write the comment that should appear in the essay tooltip and comments panel...',
            }),
        ],
        content: normalizeToHtml(value),
        onUpdate: ({ editor: currentEditor }) => {
            onChange?.(currentEditor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const nextContent = normalizeToHtml(value);
        const currentContent = editor.getHTML();
        if (nextContent === currentContent || (!nextContent && !isCommentHtmlMeaningful(currentContent))) {
            return;
        }

        editor.commands.setContent(nextContent || '<p></p>', { emitUpdate: false });
    }, [editor, value]);

    useEffect(() => {
        if (!editor || !autoFocus) {
            return;
        }

        editor.commands.focus('end', { scrollIntoView: false });
    }, [autoFocus, editor]);

    const handleSave = () => {
        if (!editor) {
            return;
        }

        const html = editor.getHTML();
        if (!isCommentHtmlMeaningful(html)) {
            return;
        }

        onSave(html);
    };

    if (!editor) {
        return null;
    }

    return (
        <div className={`comment-composer comment-composer-${mode}`} id="comment-composer">
            <div className={`comment-composer-header ${mode === 'edit' ? 'comment-composer-header-edit' : ''}`}>
                <div className="comment-composer-context">
                    <div className="comment-composer-label">{mode === 'edit' ? 'Source Context' : 'Selected Text'}</div>
                    <div className={`comment-composer-anchor-wrap ${mode === 'edit' ? 'comment-composer-anchor-wrap-edit' : ''}`}>
                        <div className="comment-composer-anchor">"{anchorText}"</div>
                    </div>
                </div>
                <label className="comment-composer-category">
                    <span>{mode === 'edit' ? 'Type' : 'Category'}</span>
                    <select
                        value={categoryId}
                        onChange={(event) => onCategoryChange?.(event.target.value as CommentCategoryId)}
                    >
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="comment-composer-toolbar">
                <button
                    className={`comment-composer-tool ${editor.isActive('bold') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    type="button"
                    title="Bold"
                >
                    <strong>B</strong>
                </button>
                <button
                    className={`comment-composer-tool ${editor.isActive('italic') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    type="button"
                    title="Italic"
                >
                    <em>I</em>
                </button>
                <button
                    className={`comment-composer-tool ${editor.isActive('underline') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    type="button"
                    title="Underline"
                >
                    <u>U</u>
                </button>
                <span className="comment-composer-separator" />
                <button
                    className={`comment-composer-tool ${editor.isActive('bulletList') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    type="button"
                    title="Bullet list"
                >
                    •
                </button>
                <button
                    className={`comment-composer-tool ${editor.isActive('orderedList') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    type="button"
                    title="Numbered list"
                >
                    1.
                </button>
            </div>

            <div className="comment-composer-editor">
                <EditorContent editor={editor} />
            </div>

            <div className="comment-composer-actions">
                {showCancel && (
                    <button
                        className="comment-composer-cancel"
                        onClick={onCancel}
                        type="button"
                    >
                        Cancel
                    </button>
                )}
                <button
                    className="comment-composer-save"
                    onClick={handleSave}
                    disabled={!isCommentHtmlMeaningful(editor.getHTML())}
                    type="button"
                >
                    {saveLabel}
                </button>
            </div>
        </div>
    );
}
