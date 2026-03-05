/**
 * commentMark — Custom TipTap Mark Extension
 *
 * Renders a comment indicator on essay text: semi-transparent category-colored
 * background + 2px dotted bottom border. Links to a GradingComment via commentId.
 *
 * Priority 1001 (above Highlight's 1000) so comment style visually overrides
 * highlight when both marks overlap on the same text range.
 *
 * @see specs/grading-editor-redesign FR-5, FR-8, FR-11
 * @module extensions/commentMark
 */

import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentMarkOptions {
    /**
     * HTML attributes to add to the rendered `<span>`.
     * @default {}
     */
    HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        commentMark: {
            /**
             * Set a comment mark on the current selection.
             */
            setCommentMark: (attributes: { commentId: string; color?: string }) => ReturnType;
            /**
             * Remove a comment mark from the current selection.
             */
            unsetCommentMark: () => ReturnType;
        };
    }
}

export const CommentMark = Mark.create<CommentMarkOptions>({
    name: 'commentMark',

    // Higher priority than Highlight (1000) so comment style overrides
    // highlight on overlapping characters
    priority: 1001,

    // Don't extend mark when typing at the boundary
    inclusive: false,

    // Allow multiple non-overlapping comment marks in the same document
    // but each text range can only have ONE comment mark
    excludes: '',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            commentId: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-id'),
                renderHTML: (attributes: Record<string, string>) => {
                    if (!attributes.commentId) return {};
                    return { 'data-comment-id': attributes.commentId };
                },
            },
            color: {
                default: '#6b7280',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-color') || '#6b7280',
                renderHTML: (attributes: Record<string, string>) => {
                    return { 'data-comment-color': attributes.color };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-comment-id]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const color = HTMLAttributes['data-comment-color'] || '#6b7280';

        // Convert hex to rgba for semi-transparent background (12% opacity)
        const bgColor = hexToRgba(color, 0.15);

        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                class: 'comment-mark',
                style: `background-color: ${bgColor}; border-bottom: 2px dotted ${color}; padding-bottom: 1px;`,
            }),
            0, // 0 = render child content (the marked text)
        ];
    },

    addCommands() {
        return {
            setCommentMark:
                (attributes) =>
                    ({ commands }) => {
                        return commands.setMark(this.name, attributes);
                    },
            unsetCommentMark:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
        };
    },
});

/**
 * Convert a hex color to rgba string.
 * @param hex - Hex color like '#ef4444'
 * @param alpha - Opacity 0-1
 */
function hexToRgba(hex: string, alpha: number): string {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default CommentMark;
