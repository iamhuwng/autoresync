/**
 * MarksOnlyMode — TipTap Extension (ProseMirror Plugin)
 *
 * Prevents all content modifications (typing, deleting, pasting, cutting, dragging)
 * while still allowing:
 * - Mark add/remove operations (highlight, comment, correction, text color, strikethrough)
 * - Selection changes (clicking, shift+arrow, ctrl+a)
 * - Undo/redo (via TipTap History extension)
 * - Meta transactions (non-document-changing)
 *
 * This creates a "marks-only" editing mode where the teacher can annotate
 * the student's essay but cannot modify the actual text content.
 *
 * Implementation:
 * Uses ProseMirror's `filterTransaction` plugin hook. When a transaction
 * changes the document, it checks if ALL steps are AddMarkStep or RemoveMarkStep.
 * If any step would change text content (ReplaceStep, etc.), the transaction is rejected.
 *
 * @see specs/grading-editor-redesign FR-2
 * @module extensions/marksOnlyPlugin
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const MARKS_ONLY_PLUGIN_KEY = new PluginKey('marksOnlyMode');

/**
 * Check if a transaction only contains mark operations.
 * Uses step constructor names since ProseMirror doesn't export
 * the step classes directly for instanceof checks.
 */
function isMarkOnlyTransaction(tr: { docChanged: boolean; steps: Array<{ toJSON(): { stepType: string } }> }): boolean {
    // If document didn't change, allow (selection-only, meta-only)
    if (!tr.docChanged) return true;

    // Check every step — all must be mark operations
    return tr.steps.every((step) => {
        const json = step.toJSON();
        const stepType = json.stepType;
        return stepType === 'addMark' || stepType === 'removeMark';
    });
}

/**
 * ProseMirror plugin that filters transactions to only allow mark operations.
 */
function createMarksOnlyPlugin(): Plugin {
    return new Plugin({
        key: MARKS_ONLY_PLUGIN_KEY,
        filterTransaction(tr) {
            return isMarkOnlyTransaction(tr);
        },
    });
}

export interface MarksOnlyModeOptions {
    /**
     * Whether marks-only mode is enabled.
     * When false, the plugin is not added and the editor behaves normally.
     * @default true
     */
    enabled: boolean;
}

/**
 * TipTap Extension wrapper for the marks-only ProseMirror plugin.
 *
 * Usage:
 * ```ts
 * useEditor({
 *   extensions: [
 *     StarterKit,
 *     MarksOnlyMode.configure({ enabled: true }),
 *   ],
 * })
 * ```
 */
export const MarksOnlyMode = Extension.create<MarksOnlyModeOptions>({
    name: 'marksOnlyMode',

    addOptions() {
        return {
            enabled: true,
        };
    },

    addProseMirrorPlugins() {
        if (!this.options.enabled) {
            return [];
        }
        return [createMarksOnlyPlugin()];
    },
});

export default MarksOnlyMode;
