---
title: IELTS Writing Grading Editor Finalization 2026-03-30
description: Finalized source of truth for the teacher writing grading editor layout, comment interactions, ordering rules, and containment inside the teacher shell.
createdAt: '2026-03-29T20:16:53.672Z'
updatedAt: '2026-03-30T03:30:19.251Z'
tags:
  - spec
  - ielts
  - writing
  - grading
  - finalized
  - comments
---

# IELTS Writing Grading Editor Finalization 2026-03-30

## Status

This document is the latest finalized source of truth for the teacher writing grading editor UI, layout, comment interactions, ordering rules, and containment inside the teacher shell.

Supersedes as the operative UI reference:
- @doc/specs/grading-editor-redesign
- @doc/prd/ielts-writing-test-system-prd
- @task-gi7jza
- @task-46v9ri
- @task-z5eq9j

Related historical references that remain useful for context but are no longer authoritative on final interaction details:
- `ai-workspace-sync/gemini/antigravity/brain/9d477b7d-7b72-427b-a322-591a30495fac/google-docs-comment-spec.md`
- `documentation/mockups/academic-record-feedback-study-next-shell-faithful-mockup.html`

## Final Layout

### Teacher Shell Containment
- The grading detail page must render inside the standard teacher-view shell, below the shared teacher header.
- The grading page is not allowed to appear as a detached full-screen surface with its own standalone app shell identity.
- The grading editor must visually follow the same page-language used by the Homework teacher pages: soft multicolor page gradient, white content cards, rounded header card, and standard action button treatment.
- The teacher header remains the top-level navigation container. The grading editor is the page body inside that shell.

### Two-Column Editor
- Left column: marked essay editor.
- Right column: tabbed side panel.
- The page remains a two-column grading surface on desktop and collapses vertically on narrow screens.
- The right panel should feel like a responsive page column, not a narrow floating stack of miniature cards.

### Right Panel Tabs
- `Prompt`
- `Comments`
- `Scoring`

## Final Comment Workflow

### Manual Comment Creation
1. Teacher selects text in the essay.
2. Teacher clicks the comment action.
3. The right column must force-switch to the `Comments` tab.
4. A new rich-text comment composer opens in the `Comments` tab.
5. The composer opens below the currently listed saved comments.
6. Saving the composer creates the actual comment and applies the final highlight to the essay text.

### Saved Comment Result
After save:
1. The selected essay text receives a distinct highlight color.
2. Hovering that highlighted text shows a tooltip with the saved comment content only.
3. The tooltip must not repeat the selected anchor text.
4. The selected text and comment both appear in the `Comments` tab.
5. The new comment is ordered by essay position, not save time.

### Ordering Rule
The comments panel must respect essay order.

Example:
- If the teacher saves comments in creation order `#1`, then `#3`, then `#2`
- But the essay physically reads in the order `#1`, `#2`, `#3`
- Then the `Comments` tab must display `#1`, `#2`, `#3`

This ordering rule overrides creation timestamp order.

### Click / Focus Linking
- Clicking highlighted commented text in the essay must force-open the `Comments` tab.
- The matching comment entry in the sidebar must scroll into view if necessary.
- The matching comment entry must receive a visually obvious glow/focus border.
- The existing visual link between essay highlight and sidebar comment remains part of the design intent, but the sidebar list itself is rendered as normal responsive stacked cards ordered by essay position.

### Hover Linking
- Hovering highlighted comment text must show a tooltip with formatted comment content only.
- Hovering essay comment text should also synchronize hover emphasis with the sidebar comment when practical.

## Quick Comments
- Quick comments remain valid, but they still must respect the same final ordering and highlight/linking behavior after creation.
- The quick-comments trigger should sit in a clean, intentional top-right position within the editor card and visually match other teacher action buttons rather than appearing as an unrelated floating FAB.
- Manual comments are authored in the right-side rich-text composer. Quick comments may remain one-click insertions.

## Scoring and Summary Rules
- Submission-level `Overall Summary` is removed from the teacher grading UI.
- Each active task must have its own `Task Summary`.
- Publish is blocked until every non-voided task has complete scores and a meaningful task summary.
- Compatibility layers may still derive a submission-level aggregate summary from task summaries where legacy readers require it, but that derived summary is not an editable teacher field.

## Comment Data and Visual Rules
- Highlight color is assigned per saved comment and should remain visually distinct from nearby comments where possible.
- Category remains metadata; ordering is based on essay position, not category.
- Resolved and deleted comments remain teacher-only management states.
- Only active comments remain represented as live highlights in the essay.
- Comment cards in the sidebar should use the full available column width and scale naturally with the right column.

## Essay Metadata Display
- Word count and time metadata are not shown below the essay editor because that information already exists in the `Prompt` tab.
- The essay surface should remain visually focused on the text, marks, and comment interactions.

## Guardrails and Edge Cases

### Open Composer Guard
- Only one unsaved new-comment composer is allowed per active task at a time.
- If a new comment is already being drafted, the UI must block starting another manual or quick comment on that same task until the draft is saved or canceled.

### Publish Guard
- Publish must be blocked while any new-comment composer is still open and unsaved.
- The teacher must either save or cancel the open composer before final submit.

### Draft Safety
- Unsaved new-comment composers are local UI state, not published grading state.
- The system must not persist orphaned essay marks that reference a comment record that was never saved.

### Original View
- Switching to `Original` view disables the `Comments` tab because the marked layer is hidden.
- Returning to `Marked` view restores comment interaction.

## Implementation Notes
- The page should preserve the Google Docs-style intent: comment-linked highlights, right-side comment thread, essay-order alignment, and visible focus synchronization.
- The visual language should now align with the Homework teacher pages rather than a detached dark-shell grading surface.
- The latest implementation should prefer this document over earlier draft specs whenever there is a conflict.


## Edit-State Refinement 2026-03-30
- Editing an existing comment must not render a full new-comment composer nested inside a fully expanded comment card with duplicated hierarchy.
- The focused card header should collapse into a simple editing state instead of repeating the normal read-state structure.
- The inline edit panel should use one compact source-context row for the selected text preview plus the category control, followed by the rich-text editor and a restrained action footer.
- The selected-text preview in edit mode should read as quoted essay context, not as a large secondary form block.
- Edit mode should feel like an inline annotation workspace inside the comment card, not a modal inside a card.

## Radius and Control System 2026-03-30
- The grading page should avoid overly pill-shaped controls.
- Filters in the comments panel should behave like segmented controls inside a shared track rather than isolated oversized pills.
- Action buttons, tabs, quick-comment trigger, and comment-edit controls should use medium radii that align with the broader page language.
- The visual target is structured and editorial, not soft consumer-chat styling.


## 2026-03-30 Amendment — Header-Top Comment Rail Alignment In Grading Editor

The grading editor now uses the same stable cross-column reading model adopted by the wide student Writing result surface, but with grading controls still enabled.

Current contract:
- Clicking highlighted commented text in the essay forces the right-side `Comments` tab open.
- The entire comments rail moves as one block; the UI does not detach or overlay the selected comment above sibling cards.
- The selected comment remains in its natural essay-order position within the list.
- The visual anchor on the right is the selected comment header row.
- The visual anchor on the left is the clicked annotation top line.
- The intended steady-state is `selected comment header top == clicked annotation top`.

This supersedes earlier looser wording that described the matching comment as merely scrolling into view. The expected behavior is parallel alignment, not approximate proximity.

Implementation note:
- The grading page provides the clicked annotation viewport top from the essay editor into the comments sidebar.
- The comments sidebar measures the selected comment header within the natural rail and translates the whole rail from that stable offset.
- The alignment math must not depend on center-based card positioning or temporary floating-card overlays.
