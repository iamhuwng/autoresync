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
  readingV2PassageJsonToText,
  readingV2PassageTextToHtml,
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

  it('hydrates markdown-compatible passage text into TipTap HTML', () => {
    expect(readingV2PassageTextToHtml('## Passage title\n\nA **bold** _italic_ __underlined__ line.')).toBe(
      '<h2>Passage title</h2><p>A <strong>bold</strong> <em>italic</em> <u>underlined</u> line.</p>',
    );
    expect(readingV2PassageTextToHtml('- first\n- second')).toBe('<ul><li><p>first</p></li><li><p>second</p></li></ul>');
  });

  it('serializes TipTap JSON back to canonical passage text markers', () => {
    expect(readingV2PassageJsonToText({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A heading' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'underlined', marks: [{ type: 'underline' }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step one' }] }] },
          ],
        },
      ],
    })).toBe('## A heading\n\n**Bold** and __underlined__\n\n1. Step one');
  });

  it('runs TipTap toolbar commands without dropping focus', () => {
    const onAction = vi.fn();
    render(
      <ReadingV2PassageEditor
        onAction={onAction}
        onChange={() => {}}
        passageNumber={1}
        value="Passage body"
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
        value="Passage body"
      />,
    );

    tiptapMock.lastConfig?.onUpdate?.({ editor: tiptapMock.editor });
    expect(onChange).toHaveBeenCalledWith('Edited passage');

    rerender(
      <ReadingV2PassageEditor
        focusRequestKey={1}
        onChange={onChange}
        passageNumber={2}
        value="External passage"
      />,
    );

    expect(tiptapMock.editor.commands.setContent).toHaveBeenCalledWith('<p>External passage</p>', { emitUpdate: false });
    expect(tiptapMock.editor.commands.focus).toHaveBeenCalledWith('end', { scrollIntoView: false });
  });
});
