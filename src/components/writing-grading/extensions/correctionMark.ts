/**
 * correctionMark - Custom TipTap Mark Extension
 *
 * Renders a correction indicator where the original text is struck through
 * and the replacement text is rendered as a separate inline node:
 *   ~~original~~ -> correction
 *
 * The correction text remains stored in `data-correction` for persistence,
 * but the visible replacement is rendered outside the editable content hole so
 * it does not inherit strikethrough from the original text.
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
            setCorrectionMark: (attributes: { correctionId?: string; correctionText: string }) => ReturnType;
            /**
             * Remove a correction mark from the current selection.
             */
            unsetCorrectionMark: () => ReturnType;
        };
    }
}

export const CorrectionMark = Mark.create<CorrectionMarkOptions>({
    name: 'correctionMark',

    // Keep correction as the outer dominant annotation when it overlaps
    // a comment mark so the comment stays anchored to the original text only.
    priority: 1002,
    inclusive: false,
    // Corrections own the text slice visually; overlapping presentation marks are stripped on apply.
    excludes: 'correctionMark highlight strike textStyle',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            correctionId: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-correction-id'),
                renderHTML: (attributes: Record<string, string>) => {
                    if (!attributes.correctionId) {
                        return {};
                    }

                    return { 'data-correction-id': attributes.correctionId };
                },
            },
            correctionText: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('data-correction'),
                renderHTML: (attributes: Record<string, string>) => {
                    if (!attributes.correctionText) {
                        return {};
                    }

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
        const correctionText = HTMLAttributes['data-correction'] || '';
        const correctionId = HTMLAttributes['data-correction-id'] || '';

        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                class: 'correction-mark',
                'data-correction': correctionText,
                ...(correctionId ? { 'data-correction-id': correctionId } : {}),
            }),
            ['span', { class: 'correction-mark-original' }, 0],
            ['span', { class: 'correction-mark-replacement', contenteditable: 'false' }, ` -> ${correctionText}`],
        ];
    },

    addCommands() {
        return {
            setCorrectionMark:
                (attributes) =>
                    ({ commands }) => commands.setMark(this.name, attributes),
            unsetCorrectionMark:
                () =>
                    ({ commands }) => commands.unsetMark(this.name),
        };
    },
});

export default CorrectionMark;
