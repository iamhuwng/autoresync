import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface PendingCommentPreviewRange {
    commentId: string;
    from: number;
    to: number;
}

type PendingCommentPreviewMeta =
    | ({
        action: 'set';
    } & PendingCommentPreviewRange)
    | { action: 'clear' };

const PENDING_COMMENT_PREVIEW_KEY = new PluginKey<DecorationSet>('pendingCommentPreview');

function buildDecorationSet(
    doc: ProseMirrorNode,
    range: PendingCommentPreviewRange | null,
) {
    if (!range || range.from >= range.to) {
        return DecorationSet.empty;
    }

    return DecorationSet.create(doc, [
        Decoration.inline(range.from, range.to, {
            class: 'pending-comment-preview',
            'data-pending-comment-id': range.commentId,
        }),
    ]);
}

export const PendingCommentPreview = Extension.create({
    name: 'pendingCommentPreview',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: PENDING_COMMENT_PREVIEW_KEY,
                state: {
                    init: (_, state) => buildDecorationSet(state.doc, null),
                    apply(tr, decorationSet) {
                        const meta = tr.getMeta(PENDING_COMMENT_PREVIEW_KEY) as PendingCommentPreviewMeta | undefined;

                        if (meta?.action === 'clear') {
                            return DecorationSet.empty;
                        }

                        if (meta?.action === 'set') {
                            return buildDecorationSet(tr.doc, meta);
                        }

                        if (tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return decorationSet;
                    },
                },
                props: {
                    decorations(state) {
                        return PENDING_COMMENT_PREVIEW_KEY.getState(state) || DecorationSet.empty;
                    },
                },
            }),
        ];
    },
});

export function setPendingCommentPreview(editor: Editor, range: PendingCommentPreviewRange | null) {
    const nextMeta: PendingCommentPreviewMeta = range
        ? { action: 'set', ...range }
        : { action: 'clear' };

    editor.view.dispatch(editor.state.tr.setMeta(PENDING_COMMENT_PREVIEW_KEY, nextMeta));
}
