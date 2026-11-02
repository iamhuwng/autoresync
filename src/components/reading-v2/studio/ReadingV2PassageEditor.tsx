import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconUnderline,
} from '@tabler/icons-react';
import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { parseReadingV2InlineMarkdown } from '../shared/ReadingV2FormattedText';
import { readingV2Ids, type ReadingV2PassageParagraph } from '../../../types/readingV2.types';
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

type TipTapJsonNode = JSONContent;

export interface ReadingV2PassageEditorProps {
  readonly value: readonly ReadingV2PassageParagraph[];
  readonly passageNumber: number;
  readonly ariaLabel?: string;
  readonly focusRequestKey?: number;
  readonly reservedAnchorIds?: readonly string[];
  readonly placeholder?: string;
  readonly onChange: (value: readonly ReadingV2PassageParagraph[]) => boolean | void;
  readonly onAction?: (action: PassageEditorAction) => void;
}

export const passageAttributes = Extension.create({
  name: 'passageAttributes',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: Object.fromEntries(['anchorId', 'label', 'itemId'].map((name) => [name, {
        default: null,
        keepOnSplit: false,
      }])),
    }];
  },
});

const inlineToJson = (text: string, marks: JSONContent['marks'] = []): TipTapJsonNode[] =>
  parseReadingV2InlineMarkdown(text).flatMap((token) => {
    const mark = { text: undefined, strong: 'bold', em: 'italic', underline: 'underline', code: 'code' }[token.kind];
    const nextMarks = mark ? [...marks, { type: mark }] : marks;
    if (token.kind !== 'text' && token.kind !== 'code') return inlineToJson(token.text, nextMarks);
    return token.text.split('\n').flatMap((part, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(part ? [{ type: 'text', text: part, ...(nextMarks.length ? { marks: nextMarks } : {}) }] : []),
    ]);
  });

export const readingV2PassageToJson = (paragraphs: readonly ReadingV2PassageParagraph[]): TipTapJsonNode => {
  const content: TipTapJsonNode[] = [];
  for (const paragraph of paragraphs) {
    const attrs = { anchorId: paragraph.anchorId ?? null, label: paragraph.label ?? null, itemId: paragraph.itemId ?? null };
    const node: TipTapJsonNode = {
      type: paragraph.blockKind === 'heading' ? 'heading' : 'paragraph',
      attrs: paragraph.blockKind === 'heading' ? { ...attrs, level: paragraph.headingLevel ?? 2 } : attrs,
      content: inlineToJson(paragraph.text),
    };
    if (paragraph.blockKind === 'list-item') {
      const type = paragraph.listKind === 'ordered' ? 'orderedList' : 'bulletList';
      const item = { type: 'listItem', content: [node] };
      const last = content[content.length - 1];
      if (last?.type === type) {
        content[content.length - 1] = { ...last, content: [...(last.content ?? []), item] };
      } else content.push({ type, content: [item] });
    } else content.push(node);
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
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

    if (marks.includes('code')) {
      text = `\`${text}\``;
    }

    if (marks.includes('bold')) {
      text = `**${text}**`;
    }

    if (marks.includes('italic')) {
      text = `_${text}_`;
    }

    if (marks.includes('underline')) {
      text = `<u>${text}</u>`;
    }

    return text;
  }).join('');

export const readingV2PassageFromJson = (json: TipTapJsonNode): ReadingV2PassageParagraph[] => {
  const result: ReadingV2PassageParagraph[] = [];
  const visit = (node: TipTapJsonNode, listKind?: 'bullet' | 'ordered') => {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      node.content?.forEach((child) => visit(child, node.type === 'bulletList' ? 'bullet' : 'ordered'));
    } else if (node.type === 'listItem') {
      node.content?.forEach((child) => visit(child, listKind));
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      result.push({
        ...(node.attrs?.anchorId ? { anchorId: readingV2Ids.anchorId(String(node.attrs.anchorId)) } : {}),
        ...(node.attrs?.label ? { label: String(node.attrs.label) } : {}),
        ...(node.attrs?.itemId ? { itemId: String(node.attrs.itemId) } : {}),
        text: serializeInlineNodes(node.content),
        ...(listKind ? { blockKind: 'list-item' as const, listKind } : node.type === 'heading'
          ? { blockKind: 'heading' as const, headingLevel: (node.attrs?.level ?? 2) as 1 | 2 | 3 }
          : { blockKind: 'paragraph' as const }),
      });
    }
  };
  json.content?.forEach((node) => visit(node));
  return result;
};

export const ensurePassageBlockIds = (editor: Editor, reservedAnchorIds: readonly string[] = []): void => {
  const seenAnchors = new Set<string>(reservedAnchorIds);
  const seenItems = new Set<string>();
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
    const existingAnchor = node.attrs.anchorId as string | null;
    const duplicateAnchor = !existingAnchor || seenAnchors.has(existingAnchor);
    const anchorId = duplicateAnchor ? `passage-${crypto.randomUUID()}` : existingAnchor;
    seenAnchors.add(anchorId);
    const inList = editor.state.doc.resolve(position).parent.type.name === 'listItem';
    const existingItem = node.attrs.itemId as string | null;
    const itemId = inList && (!existingItem || seenItems.has(existingItem))
      ? `item-${crypto.randomUUID()}` : existingItem;
    if (itemId) seenItems.add(itemId);
    if (duplicateAnchor || itemId !== existingItem) {
      transaction.setNodeMarkup(position, undefined, {
        ...node.attrs, anchorId, itemId, ...(duplicateAnchor ? { label: null } : {}),
      });
    }
  });
  if (transaction.docChanged) editor.view.dispatch(transaction.setMeta('preventUpdate', true).setMeta('addToHistory', false));
};

export function ReadingV2PassageEditor({
  value,
  passageNumber,
  ariaLabel = 'Passage editor',
  focusRequestKey = 0,
  reservedAnchorIds = [],
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
        codeBlock: false,
        horizontalRule: false,
        underline: false,
      }),
      Underline,
      passageAttributes,
      Placeholder.configure({ placeholder }),
    ],
    content: readingV2PassageToJson(value),
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
      ensurePassageBlockIds(updatedEditor, reservedAnchorIds);
      const nextValue = readingV2PassageFromJson(updatedEditor.getJSON() as TipTapJsonNode);
      if (onChange(nextValue) === false) {
        updatedEditor.commands.setContent(readingV2PassageToJson(currentValueRef.current), { emitUpdate: false });
        return;
      }
      currentValueRef.current = nextValue;
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
    if (!editor || JSON.stringify(value) === JSON.stringify(currentValueRef.current)) {
      return;
    }

    currentValueRef.current = value;
    editor.commands.setContent(readingV2PassageToJson(value), { emitUpdate: false });
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
