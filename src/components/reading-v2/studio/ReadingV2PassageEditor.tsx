import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconUnderline,
} from '@tabler/icons-react';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

type PassageEditorAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'undo'
  | 'redo';

interface TipTapJsonMark {
  readonly type?: string;
}

interface TipTapJsonNode {
  readonly type?: string;
  readonly text?: string;
  readonly marks?: readonly TipTapJsonMark[];
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly TipTapJsonNode[];
}

export interface ReadingV2PassageEditorProps {
  readonly value: string;
  readonly passageNumber: number;
  readonly ariaLabel?: string;
  readonly focusRequestKey?: number;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
  readonly onAction?: (action: PassageEditorAction) => void;
}

const MARKDOWN_TOKEN_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|_[^_\n]+_)/g;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const markdownInlineToHtml = (text: string): string => {
  const nodes: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[0];
    if (match.index > cursor) {
      nodes.push(escapeHtml(text.slice(cursor, match.index)));
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      nodes.push(`<u>${escapeHtml(token.slice(2, -2))}</u>`);
    } else {
      nodes.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(escapeHtml(text.slice(cursor)));
  }

  return nodes.join('').replace(/\n/g, '<br>');
};

const listItemsForBlock = (block: string, marker: RegExp): readonly string[] | null => {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || !lines.every((line) => marker.test(line))) {
    return null;
  }

  return lines.map((line) => line.replace(marker, '').trim());
};

export const readingV2PassageTextToHtml = (value: string): string => {
  const blocks = value.trim().length > 0
    ? value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    : [''];

  return blocks.map((block) => {
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(block);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      return `<h${level}>${markdownInlineToHtml(headingMatch[2]!)}</h${level}>`;
    }

    const bulletItems = listItemsForBlock(block, /^[-*]\s+/);
    if (bulletItems) {
      return `<ul>${bulletItems.map((item) => `<li><p>${markdownInlineToHtml(item)}</p></li>`).join('')}</ul>`;
    }

    const orderedItems = listItemsForBlock(block, /^\d+[.)]\s+/);
    if (orderedItems) {
      return `<ol>${orderedItems.map((item) => `<li><p>${markdownInlineToHtml(item)}</p></li>`).join('')}</ol>`;
    }

    return `<p>${markdownInlineToHtml(block)}</p>`;
  }).join('');
};

const serializeInlineNodes = (nodes: readonly TipTapJsonNode[] | undefined): string =>
  (nodes ?? []).map((node) => {
    if (node.type === 'hardBreak') {
      return '\n';
    }

    if (node.type !== 'text') {
      return serializeInlineNodes(node.content);
    }

    let text = node.text ?? '';
    const marks = node.marks?.map((mark) => mark.type).filter(Boolean) ?? [];

    if (marks.includes('bold')) {
      text = `**${text}**`;
    }

    if (marks.includes('italic')) {
      text = `_${text}_`;
    }

    if (marks.includes('underline')) {
      text = `__${text}__`;
    }

    return text;
  }).join('');

const serializeBlockNode = (node: TipTapJsonNode, index: number): string => {
  if (node.type === 'heading') {
    const level = typeof node.attrs?.level === 'number' ? Math.min(Math.max(node.attrs.level, 1), 3) : 2;
    return `${'#'.repeat(level)} ${serializeInlineNodes(node.content)}`.trimEnd();
  }

  if (node.type === 'bulletList') {
    return (node.content ?? [])
      .map((item) => `- ${serializeInlineNodes(item.content)}`.trimEnd())
      .join('\n');
  }

  if (node.type === 'orderedList') {
    return (node.content ?? [])
      .map((item, itemIndex) => `${itemIndex + 1}. ${serializeInlineNodes(item.content)}`.trimEnd())
      .join('\n');
  }

  if (node.type === 'paragraph') {
    return serializeInlineNodes(node.content);
  }

  return serializeInlineNodes(node.content) || (index === 0 ? '' : '');
};

export const readingV2PassageJsonToText = (json: TipTapJsonNode): string =>
  (json.content ?? [])
    .map(serializeBlockNode)
    .join('\n\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

export function ReadingV2PassageEditor({
  value,
  passageNumber,
  ariaLabel = 'Passage editor',
  focusRequestKey = 0,
  placeholder = 'Start typing the passage...',
  onChange,
  onAction,
}: ReadingV2PassageEditorProps) {
  const currentValueRef = useRef(value);
  const [selectionStatus, setSelectionStatus] = useState(`Passage ${passageNumber} editor ready.`);
  const preventToolbarBlur = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: readingV2PassageTextToHtml(value),
    editorProps: {
      attributes: {
        class: 'reading-v2-build__passage-rich-editor',
        role: 'textbox',
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        'data-placeholder': placeholder,
        'data-passage-number': String(passageNumber),
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextValue = readingV2PassageJsonToText(updatedEditor.getJSON() as TipTapJsonNode);
      currentValueRef.current = nextValue;
      onChange(nextValue);
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      const activeFormats = [
        updatedEditor.isActive('bold') ? 'bold' : '',
        updatedEditor.isActive('italic') ? 'italic' : '',
        updatedEditor.isActive('underline') ? 'underline' : '',
        updatedEditor.isActive('heading', { level: 2 }) ? 'heading' : '',
        updatedEditor.isActive('bulletList') ? 'bullet list' : '',
        updatedEditor.isActive('orderedList') ? 'numbered list' : '',
      ].filter(Boolean);

      setSelectionStatus(
        activeFormats.length > 0
          ? `Passage ${passageNumber} selection uses ${activeFormats.join(', ')}.`
          : `Passage ${passageNumber} selection ready.`,
      );
    },
  });

  useEffect(() => {
    if (!editor || value === currentValueRef.current) {
      return;
    }

    currentValueRef.current = value;
    editor.commands.setContent(readingV2PassageTextToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor || focusRequestKey <= 0) {
      return;
    }

    editor.commands.focus('end', { scrollIntoView: false });
  }, [editor, focusRequestKey]);

  const runCommand = (action: PassageEditorAction) => {
    if (!editor) {
      return;
    }

    switch (action) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'heading':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'undo':
        editor.chain().focus().undo().run();
        break;
      case 'redo':
        editor.chain().focus().redo().run();
        break;
      default:
        return;
    }

    onAction?.(action);
  };

  const canUndo = editor?.can().undo() ?? false;
  const canRedo = editor?.can().redo() ?? false;

  return (
    <section className="reading-v2-passage-editor" aria-label={`Passage ${passageNumber} rich text editor`}>
      <p className="reading-v2-studio__sr-only" role="status" aria-live="polite">
        {selectionStatus}
      </p>
      <div className="reading-v2-build__editor-tools" aria-label="Passage editing tools">
        <button
          aria-label="Bold"
          aria-pressed={editor?.isActive('bold') ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('bold')}
          onMouseDown={preventToolbarBlur}
          title="Bold"
          type="button"
        >
          <IconBold aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <button
          aria-label="Italic"
          aria-pressed={editor?.isActive('italic') ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('italic')}
          onMouseDown={preventToolbarBlur}
          title="Italic"
          type="button"
        >
          <IconItalic aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <button
          aria-label="Underline"
          aria-pressed={editor?.isActive('underline') ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('underline')}
          onMouseDown={preventToolbarBlur}
          title="Underline"
          type="button"
        >
          <IconUnderline aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <button
          aria-label="Heading"
          aria-pressed={editor?.isActive('heading', { level: 2 }) ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('heading')}
          onMouseDown={preventToolbarBlur}
          title="Heading"
          type="button"
        >
          <span aria-hidden="true">H2</span>
        </button>
        <span aria-hidden="true" className="reading-v2-build__tool-divider" />
        <button
          aria-label="Bullet list"
          aria-pressed={editor?.isActive('bulletList') ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('bulletList')}
          onMouseDown={preventToolbarBlur}
          title="Bullet list"
          type="button"
        >
          <IconList aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <button
          aria-label="Numbered list"
          aria-pressed={editor?.isActive('orderedList') ?? false}
          className="reading-v2-build__tool-button"
          disabled={!editor}
          onClick={() => runCommand('orderedList')}
          onMouseDown={preventToolbarBlur}
          title="Numbered list"
          type="button"
        >
          <IconListNumbers aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <span aria-hidden="true" className="reading-v2-build__tool-divider" />
        <button
          aria-label="Undo"
          className="reading-v2-build__tool-button"
          disabled={!editor || !canUndo}
          onClick={() => runCommand('undo')}
          onMouseDown={preventToolbarBlur}
          title="Undo"
          type="button"
        >
          <IconArrowBackUp aria-hidden="true" size={18} stroke={1.9} />
        </button>
        <button
          aria-label="Redo"
          className="reading-v2-build__tool-button"
          disabled={!editor || !canRedo}
          onClick={() => runCommand('redo')}
          onMouseDown={preventToolbarBlur}
          title="Redo"
          type="button"
        >
          <IconArrowForwardUp aria-hidden="true" size={18} stroke={1.9} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
