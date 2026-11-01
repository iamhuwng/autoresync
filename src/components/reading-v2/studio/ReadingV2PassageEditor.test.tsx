import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tiptapMock = vi.hoisted(() => {
  const chainApi = {
    focus: vi.fn(() => chainApi),
    toggleBold: vi.fn(() => chainApi),
    toggleItalic: vi.fn(() => chainApi),
    toggleUnderline: vi.fn(() => chainApi),
    toggleHeading: vi.fn(() => chainApi),
    toggleBulletList: vi.fn(() => chainApi),
    toggleOrderedList: vi.fn(() => chainApi),
    undo: vi.fn(() => chainApi),
    redo: vi.fn(() => chainApi),
    run: vi.fn(() => true),
  };

  const editor = {
    can: vi.fn(() => ({
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
    })),
    chain: vi.fn(() => chainApi),
    commands: {
      focus: vi.fn(),
      setContent: vi.fn(),
    },
    getJSON: vi.fn(),
    isActive: vi.fn(() => false),
    view: {
      dom: {
        setAttribute: vi.fn(),
      },
    },
  };

  return {
    chainApi,
    editor,
    lastConfig: undefined as undefined | {
      readonly content?: string;
      readonly onUpdate?: (payload: { readonly editor: typeof editor }) => void;
    },
  };
});

vi.mock('@tiptap/react', () => ({
  useEditor: (config: typeof tiptapMock.lastConfig) => {
    tiptapMock.lastConfig = config;
    return tiptapMock.editor;
  },
  EditorContent: () => <div data-testid="reading-v2-passage-editor-content" />,
}));

vi.mock('@tiptap/starter-kit', () => ({
  __esModule: true,
  default: {
    configure: () => ({}),
  },
}));

vi.mock('@tiptap/extension-underline', () => ({
  __esModule: true,
  default: {},
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  __esModule: true,
  default: {
    configure: () => ({}),
  },
}));

import {
  ReadingV2PassageEditor,
  ensurePassageBlockIds,
  passageAttributes,
  readingV2PassageFromJson,
  readingV2PassageToJson,
} from './ReadingV2PassageEditor';

describe('ReadingV2PassageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tiptapMock.lastConfig = undefined;
    tiptapMock.editor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited passage' }] }],
    });
  });

  it('round trips structured blocks and inline marks without losing identity', () => {
    const blocks = [
      { anchorId: 'a' as any, label: 'A', blockKind: 'heading' as const, headingLevel: 2 as const, text: 'A **heading**' },
      { anchorId: 'b' as any, label: 'B', blockKind: 'list-item' as const, listKind: 'bullet' as const, itemId: 'item-b', text: 'Second\n*italic* and `code`' },
    ];
    expect(readingV2PassageFromJson(readingV2PassageToJson(blocks))).toEqual([blocks[0], { ...blocks[1], text: 'Second\n_italic_ and `code`' }]);
  });

  it('round trips combined bold, italic and underline marks', () => {
    const json = { type: 'doc', content: [{ type: 'paragraph', attrs: { anchorId: 'a' }, content: [
      { type: 'text', text: 'x < 3', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }] },
    ] }] };
    const paragraphs = readingV2PassageFromJson(json);
    expect(paragraphs[0]?.text).toBe('<u>_**x < 3**_</u>');
    expect(readingV2PassageToJson(paragraphs).content?.[0]?.content?.[0]?.marks).toEqual([
      { type: 'underline' }, { type: 'italic' }, { type: 'bold' },
    ]);
  });

  it('assigns a fresh identity to a split block', async () => {
    const { Editor } = await vi.importActual<typeof import('@tiptap/core')>('@tiptap/core');
    const { default: StarterKit } = await vi.importActual<typeof import('@tiptap/starter-kit')>('@tiptap/starter-kit');
    const editor = new Editor({
      extensions: [StarterKit, passageAttributes],
      content: readingV2PassageToJson([{ anchorId: 'anchor-a' as any, label: 'A', text: 'First' }]),
    });
    editor.commands.setTextSelection(3);
    editor.commands.splitBlock();
    ensurePassageBlockIds(editor);
    const blocks = readingV2PassageFromJson(editor.getJSON());
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.anchorId).toBe('anchor-a');
    expect(blocks[1]?.anchorId).toBeTruthy();
    expect(blocks[1]?.anchorId).not.toBe(blocks[0]?.anchorId);
    ensurePassageBlockIds(editor, ['anchor-a']);
    expect(readingV2PassageFromJson(editor.getJSON())[0]?.anchorId).not.toBe('anchor-a');
    editor.destroy();
  });

  it('runs TipTap toolbar commands without dropping focus', () => {
    const onAction = vi.fn();
    render(
      <ReadingV2PassageEditor
        onAction={onAction}
        onChange={() => {}}
        passageNumber={1}
        value={[{ text: 'Passage body' }]}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Heading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(tiptapMock.chainApi.focus).toHaveBeenCalled();
    expect(tiptapMock.chainApi.toggleBold).toHaveBeenCalled();
    expect(tiptapMock.chainApi.toggleUnderline).toHaveBeenCalled();
    expect(tiptapMock.chainApi.toggleHeading).toHaveBeenCalledWith({ level: 2 });
    expect(tiptapMock.chainApi.undo).toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith('bold');
    expect(onAction).toHaveBeenCalledWith('underline');
    expect(onAction).toHaveBeenCalledWith('heading');
  });

  it('syncs editor updates and controlled value changes without emitting loops', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReadingV2PassageEditor
        onChange={onChange}
        passageNumber={1}
        value={[{ text: 'Passage body' }]}
      />,
    );


    rerender(
      <ReadingV2PassageEditor
        focusRequestKey={1}
        onChange={onChange}
        passageNumber={2}
        value={[{ text: 'External passage' }]}
      />,
    );

    expect(tiptapMock.editor.commands.setContent).toHaveBeenCalledWith(readingV2PassageToJson([{ text: 'External passage' }]), { emitUpdate: false });
    expect(tiptapMock.editor.commands.focus).toHaveBeenCalledWith('end', { scrollIntoView: false });
  });
});
