---
title: 'Pattern: Feature Exists But Never Invoked'
createdAt: '2026-03-01T09:47:14.951Z'
updatedAt: '2026-03-01T09:47:41.916Z'
description: >-
  Pattern where a TipTap extension, React component, or service method exists in
  code but is never called at the critical moment. The feature appears complete
  but does nothing.
tags:
  - pattern
  - debugging
  - tiptap
  - integration
---
# Pattern: Feature Exists But Never Invoked

## Problem

A feature's infrastructure (extension, component, service method) is fully implemented and working, but the **invocation point** is missing. The code looks complete — the extension registers, the component renders, the service builds correctly — but the actual call that connects input → feature → output is absent.

This is a variant of Integration Safety Rule 8 ("Component Exists ≠ Component Integrated"), but at the function-call level rather than the import/render level.

## Symptoms

- Feature infrastructure exists and passes code review
- No build errors, no runtime errors
- Feature simply does nothing when the user performs the trigger action
- Developer says "I added the extension/component" but didn't verify the trigger→action chain

## Real Bug: TipTap Comment Marks Never Applied (2026-03-01)

**What existed:**
- `commentMark.ts` — Full TipTap mark extension with `renderHTML`, `parseHTML`, inline styles
- `EssayEditor.css` — CSS for `.comment-mark`, `.comment-focused`, `.comment-hovered`
- `EssayEditor.tsx` — `useEffect` that applies focus/hover classes to comment marks
- `WritingGradingModal.tsx` — `handleAddComment` that creates comment objects

**What was missing:**
The actual call to `editor.chain().setCommentMark({ commentId, color }).run()` — the one line that applies the mark to the selected text in TipTap's DOM.

```typescript
// ❌ BEFORE — creates comment state but never marks the text
const handleAddComment = useCallback(() => {
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    onAddComment(selectedText, from, to);
    // Comment object created in parent... but editor text is unmarked
}, [editor, onAddComment]);

// ✅ AFTER — marks the text THEN creates comment state
const handleAddComment = useCallback(() => {
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Apply the mark to the editor DOM
    editor.chain().focus().setCommentMark({ commentId, color: '#6b7280' }).run();
    
    // THEN notify parent
    onAddComment(selectedText, from, to, commentId);
}, [editor, onAddComment]);
```

## Detection Checklist

When debugging "feature does nothing":

1. **Trace the trigger chain end-to-end:**
   - User clicks button → handler function → ... → actual DOM/state mutation
   - Follow EVERY callback hop between components

2. **Check for "bridge gaps":**
   - Component A generates data and passes to Component B via callback
   - Component B receives the callback but never calls the underlying API
   - The callback connects A→B, but the B→API link is missing

3. **Grep for the critical API:**
   ```bash
   # Example: Does anyone actually CALL setCommentMark?
   grep -rn "setCommentMark" src/
   # If only the extension definition shows up — it's never invoked
   ```

## Prevention

- After implementing any extension/service, grep for its usage — it should appear in at least TWO places (definition + invocation)
- Add integration tests that verify the trigger→action chain, not just the individual pieces
- This maps to Integration Safety Rule 8: always verify import + render + props + browser trigger

## Source

Bug discovered 2026-03-01 in `EssayEditor.tsx` → `handleAddComment()`
