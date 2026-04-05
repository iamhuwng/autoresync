import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const focusMock = vi.fn();
const setContentMock = vi.fn();
const isActiveMock = vi.fn(() => false);
const getHTMLMock = vi.fn(() => '<p>Draft</p>');

const chainApi = {
    focus: vi.fn(() => chainApi),
    toggleBold: vi.fn(() => chainApi),
    toggleItalic: vi.fn(() => chainApi),
    toggleUnderline: vi.fn(() => chainApi),
    toggleBulletList: vi.fn(() => chainApi),
    toggleOrderedList: vi.fn(() => chainApi),
    run: vi.fn(() => true),
};

const editorMock = {
    commands: {
        focus: focusMock,
        setContent: setContentMock,
    },
    isActive: isActiveMock,
    getHTML: getHTMLMock,
    chain: vi.fn(() => chainApi),
};

vi.mock('@tiptap/react', () => ({
    useEditor: () => editorMock,
    EditorContent: () => <div data-testid="comment-composer-editor" />,
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

import CommentComposer from './CommentComposer';

describe('CommentComposer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isActiveMock.mockReturnValue(false);
        getHTMLMock.mockReturnValue('<p>Draft</p>');
    });

    it('focuses the editor without scrolling the page when autoFocus is enabled', async () => {
        render(
            <CommentComposer
                value="<p>Draft</p>"
                anchorText="Hello"
                taskNumber={1}
                categoryId="uncategorized"
                autoFocus
                onSave={() => {}}
            />,
        );

        await waitFor(() => {
            expect(focusMock).toHaveBeenCalledWith('end', { scrollIntoView: false });
        });
    });
});
