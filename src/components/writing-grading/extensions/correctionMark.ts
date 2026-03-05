/**
 * correctionMark — Custom TipTap Mark Extension
 *
 * Renders a correction indicator: the original text gets a line-through (strikethrough),
 * and the correction text is appended inline via CSS ::after pseudo-element:
 *   ~~original~~ → correction
 *
 * The correction text is stored in a `data-correction` attribute and rendered
 * via `content: " → " attr(data-correction)` in CSS (see essayEditorStyles.css).
 *
 * @see specs/grading-editor-redesign FR-9, FR-10
 * @module extensions/correctionMark
 */

import { Mark, mergeAttributes } from '@tiptap/core';

export interface CorrectionMarkOptions {
    /**
     * HTML attributes to add to the rendered `<span>`.
     * @default {}
     */
    HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        correctionMark: {
            /**
             * Set a correction mark on the current selection.
             */
            setCorrectionMark: (attributes: { correctionText: string }) => ReturnType;
            /**
             * Remove a correction mark from the current selection.
             */
            unsetCorrectionMark: () => ReturnType;
        };
    }
}

export const CorrectionMark = Mark.create<CorrectionMarkOptions>({
    name: 'correctionMark',

    // Standard priority — no overlap concerns with highlight
    priority: 1000,

    // Don't extend mark when typing at the boundary
    inclusive: false,

    // Correction excludes other corrections on same text (can't double-correct)
    excludes: 'correctionMark',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            correctionText: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-correction'),
                renderHTML: (attributes: Record<string, string>) => {
                    if (!attributes.correctionText) return {};
                    return { 'data-correction': attributes.correctionText };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-correction]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                class: 'correction-mark',
                // Inline style for strikethrough + grayed text
                // The ::after pseudo-element (in CSS) renders " → correctionText" in green
                style: 'text-decoration: line-through; color: #94a3b8;',
            }),
            0, // 0 = render child content (the original text, now struck through)
        ];
    },

    addCommands() {
        return {
            setCorrectionMark:
                (attributes) =>
                    ({ commands }) => {
                        return commands.setMark(this.name, attributes);
                    },
            unsetCorrectionMark:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
        };
    },
});

export default CorrectionMark;
