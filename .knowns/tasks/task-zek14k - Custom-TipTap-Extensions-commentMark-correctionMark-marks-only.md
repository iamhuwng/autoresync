---
id: zek14k
title: Custom TipTap Extensions (commentMark + correctionMark + marks-only)
status: done
priority: high
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:43:40.959Z'
updatedAt: '2026-03-01T07:21:03.813Z'
timeSpent: 527
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-1
  - AC-5
  - AC-6
  - AC-7
  - AC-29
---
# Custom TipTap Extensions (commentMark + correctionMark + marks-only)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build two custom TipTap mark extensions and a marks-only mode plugin. commentMark: stores {commentId, color}, renders category-colored background + 2px dotted bottom border. correctionMark: stores {correctionText}, renders strikethrough + " → " + green text inline. Marks-only plugin: ProseMirror plugin that filters transactions to reject text insertion/deletion — only mark add/remove allowed. Also install any missing TipTap npm packages (@tiptap/extension-highlight, @tiptap/extension-underline, @tiptap/extension-color, @tiptap/extension-text-style). See @doc/specs/grading-editor-redesign FR-8, FR-9, FR-2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 commentMark extension: stores {commentId, color}, renders category-colored semi-transparent bg + 2px dotted bottom border
- [x] #2 correctionMark extension: stores {correctionText}, renders line-through + ' → ' + green (#10b981) correction text inline at same font size
- [x] #3 Marks-only ProseMirror plugin: filters transactions to reject content changes (typing, deleting, pasting text) — only mark operations allowed
- [x] #4 Both marks work correctly with TipTap History undo/redo
- [x] #5 Highlight+Comment overlap: comment style overrides highlight only on overlapping chars, rest keeps highlight color
- [x] #6 Install missing TipTap npm packages: @tiptap/extension-highlight @tiptap/extension-underline @tiptap/extension-color @tiptap/extension-text-style
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Custom TipTap Extensions

### Architecture
Three files in `src/components/writing-grading/extensions/`:
1. `commentMark.ts` — Custom Mark extension
2. `correctionMark.ts` — Custom Mark extension (NodeView-based for inline replacement)
3. `marksOnlyPlugin.ts` — ProseMirror plugin

### Step 1: Install missing TipTap packages
```bash
npm install @tiptap/extension-highlight @tiptap/extension-color @tiptap/extension-text-style
```
- `@tiptap/extension-underline` already bundled via starter-kit
- `@tiptap/extension-bubble-menu` already bundled via @tiptap/react

### Step 2: Create `commentMark.ts`

TipTap Mark.create() with:
- **name:** `'commentMark'`
- **priority:** 1001 (higher than Highlight's default 1000, so comment styles override highlight where they overlap)
- **addAttributes():** `commentId: string` (required, rendered as data-comment-id), `color: string` (default '#6b7280')
- **parseHTML():** `[{ tag: 'span[data-comment-id]' }]` — reads from data attributes
- **renderHTML({ HTMLAttributes }):** Renders `<span>` with:
  - `data-comment-id` attribute for DOM targeting (used by CommentSidebar getBoundingClientRect)
  - `class: 'comment-mark'` for base styling
  - Inline `style`: `background-color: ${color}20` (semi-transparent, 12% opacity hex suffix), `border-bottom: 2px dotted ${color}`
- **addCommands():** `setCommentMark`, `unsetCommentMark`, `toggleCommentMark`
- **inclusive: false** — new text typed adjacent to comment shouldn't extend the mark

### Step 3: Create `correctionMark.ts`

Custom Mark with inline content substitution. This is trickier because TipTap marks wrap existing text, but we need to ADD text (the correction) after the original.

**Approach:** Use a Mark that renders a `<span>` with the original text struck through AND appends " → correctionText" via CSS `::after` pseudo-element OR via renderHTML inserting extra content.

Actually, TipTap marks can only wrap their text content — they can't add extra text nodes. Two options:
- **Option A (CSS ::after):** Mark renders `<span data-correction="because" class="correction-mark">` with CSS: `.correction-mark { text-decoration: line-through; color: #94a3b8; }` and `.correction-mark::after { content: " → " attr(data-correction); text-decoration: none; color: #10b981; font-size: inherit; }`
- **Option B (NodeView):** More complex, full control but heavier.

**Decision: Option A (CSS ::after)** — simpler, works with undo/redo, and `attr()` in `content` is well-supported. The correction text is stored in a `data-correction` attribute.

- **name:** `'correctionMark'`
- **addAttributes():** `correctionText: string` (rendered as `data-correction`)
- **parseHTML():** `[{ tag: 'span[data-correction]' }]`
- **renderHTML():** `<span>` with `class: 'correction-mark'`, `data-correction`, `style: 'text-decoration: line-through; color: #94a3b8;'`
- CSS class `.correction-mark::after` handles the arrow + green text
- **inclusive: false**

### Step 4: Create `marksOnlyPlugin.ts`

ProseMirror plugin (via `@tiptap/pm/state`) that intercepts transactions:

```typescript
import { Plugin, PluginKey } from '@tiptap/pm/state';

const marksOnlyPluginKey = new PluginKey('marksOnly');

function isMarkOperation(tr): boolean {
  // Check if transaction ONLY adds/removes marks (no content changes)
  // - tr.steps should all be AddMarkStep or RemoveMarkStep
  // - No ReplaceStep, ReplaceAroundStep, or other content mutations
  return tr.steps.every(step => 
    step.constructor.name === 'AddMarkStep' || 
    step.constructor.name === 'RemoveMarkStep'
  );
}

export const marksOnlyPlugin = new Plugin({
  key: marksOnlyPluginKey,
  filterTransaction(tr, state) {
    // Always allow selection-only changes and mark-only changes
    if (!tr.docChanged) return true;
    // Allow mark-only operations
    if (isMarkOperation(tr)) return true;
    // Block everything else (typing, deleting, pasting)
    return false;
  },
});
```

Wrap as TipTap Extension:
```typescript
import { Extension } from '@tiptap/core';

export const MarksOnlyMode = Extension.create({
  name: 'marksOnlyMode',
  addProseMirrorPlugins() {
    return [marksOnlyPlugin];
  },
});
```

### Step 5: Add CSS for correctionMark

Add to WritingGradingModal.css (or a new `essay-editor.css`):
```css
.correction-mark {
  text-decoration: line-through;
  color: #94a3b8;
}
.correction-mark::after {
  content: " → " attr(data-correction);
  text-decoration: none;
  color: #10b981;
  font-size: inherit;
  font-style: normal;
}
```

### Step 6: Verify undo/redo compatibility
- Both marks are standard TipTap marks → History extension handles them automatically
- marksOnlyPlugin allows AddMarkStep/RemoveMarkStep → undo/redo generates the reverse steps, which are also mark operations → passes filter

### Step 7: Verify highlight + comment overlap
- commentMark priority (1001) > Highlight priority (1000)
- When both marks are on the same text range, commentMark renders OVER highlight
- On partial overlap: each char segment gets its own combination of marks
- TipTap serializes overlapping marks as nested spans — inner span (commentMark) takes visual precedence via CSS specificity

### File locations
```
src/components/writing-grading/extensions/
├── commentMark.ts         # Custom TipTap Mark
├── correctionMark.ts      # Custom TipTap Mark
├── marksOnlyPlugin.ts     # ProseMirror plugin wrapped as TipTap Extension
└── essayEditorStyles.css   # CSS for correction, comment, gutter
```
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### Step 1: Installed TipTap packages
- `npm install @tiptap/extension-highlight @tiptap/extension-color @tiptap/extension-text-style`
- All 3 installed at ^3.20.0, matching existing tiptap packages

### Step 2: Created commentMark.ts
- Custom Mark with priority 1001 (above Highlight 1000)
- Attributes: commentId (string, stored as data-comment-id), color (string, stored as data-comment-color)
- Renders: <span class='comment-mark'> with semi-transparent bg (hexToRgba 15% opacity) + 2px dotted border
- Commands: setCommentMark, unsetCommentMark
- inclusive: false (don't extend when typing at boundary)

### Step 3: Created correctionMark.ts
- Custom Mark storing correctionText in data-correction attribute
- Renders: <span class='correction-mark'> with line-through + gray text
- CSS ::after content: ' → ' attr(data-correction) in green (#10b981)
- Excludes self (can't double-correct same text)
- Commands: setCorrectionMark, unsetCorrectionMark

### Step 4: Created marksOnlyPlugin.ts
- ProseMirror plugin via filterTransaction()
- Uses step.toJSON().stepType to check for 'addMark' / 'removeMark'
- Allows: selection changes, meta transactions, mark operations, undo/redo
- Blocks: typing, deleting, pasting, cutting, dragging
- Wrapped as TipTap Extension with enabled option

### Step 5: Created essayEditorStyles.css
- .comment-mark: hover/focus states, cursor pointer, transitions
- .correction-mark::after: renders ' → correction' in green via attr()
- .gutter-dot: comment gutter dot styles
- .marks-only-mode: hides caret, custom selection color
- Highlight mark (<mark>) overrides: cursor, transitions

### Step 6: Created barrel export index.ts

### Build verification: Zero new TS errors from all 4 files"
<!-- SECTION:NOTES:END -->

