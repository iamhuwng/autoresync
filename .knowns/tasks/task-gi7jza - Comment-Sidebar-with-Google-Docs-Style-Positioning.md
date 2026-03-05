---
id: gi7jza
title: Comment Sidebar with Google Docs-Style Positioning
status: done
priority: high
labels:
  - phase-1
  - from-spec
  - grading-editor
createdAt: '2026-03-01T06:44:32.735Z'
updatedAt: '2026-03-01T07:52:32.721Z'
timeSpent: 186
assignee: '@me'
spec: specs/grading-editor-redesign
fulfills:
  - AC-12
  - AC-13
  - AC-14
  - AC-15
  - AC-16
  - AC-17
---
# Comment Sidebar with Google Docs-Style Positioning

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build CommentSidebar.tsx, CommentCard.tsx, and ConnectionLines.tsx. Google Docs-style comment panel with vertically positioned cards aligned to highlighted text anchors. Collapsed/focused card states. Bidirectional click/hover interaction between essay highlights and cards. SVG connecting dotted line. Filter pills (All/Open/Resolved). Card actions: edit (inline), resolve (fade+remove mark), re-open (restore), soft delete (recoverable), category reassignment dropdown. Stacking algorithm with graceful degradation at 20+ comments. This is the most complex task. See @doc/specs/grading-editor-redesign FR-41 through FR-59.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cards vertically positioned at anchor text Y-coordinate via getBoundingClientRect on TipTap mark DOM nodes
- [x] #2 Push-down stacking: if card overlaps previous, push down with 8px min gap. Cards ordered by essay position (top to bottom)
- [x] #3 Graceful degradation at 20+ comments: falls back to evenly spaced list with note 'Comments are listed in essay order'
- [x] #4 Collapsed card: category dot + label, truncated text (1-2 lines + ellipsis), relative timestamp, ✕ on hover
- [x] #5 Focused card: full text, ⋮ menu (Edit/Delete/Recover), ✓ Resolve, optional category dropdown (GRA/LR/CC/TA or TR/uncategorized)
- [x] #6 Click highlight in essay → auto-switch to Comments tab + focus corresponding card + collapse others + auto-scroll panel
- [x] #7 Click card → scroll essay to highlighted text + darken highlight (opacity 0.2 → 0.5)
- [x] #8 Click away → collapse focused card, highlight returns to 0.2 opacity
- [x] #9 Hover highlight → card gets elevated shadow + subtle blue bg flash
- [x] #10 Hover card → highlight opacity increases (0.2 → 0.35)
- [x] #11 SVG dotted connecting line from highlight right edge to card left edge (stroke: #94a3b8, dash: 4 3) — only for focused comment, only when Comments tab active
- [x] #12 Resolve: 300ms fade, remove comment mark from essay, move to resolved status
- [x] #13 Re-open: restore card to active + re-apply mark to essay text
- [x] #14 Soft delete via ⋮: mark as deleted, remove mark from essay, recoverable via ⋮ Recover on deleted cards
- [x] #15 Edit via ⋮: comment text becomes inline editable input, Save on Enter/blur, Cancel on Escape
- [x] #16 Filter pills at top: [All] [Open] [Resolved] — default is Open
- [x] #17 Position updates on scroll via requestAnimationFrame (must complete <16ms per frame)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Log

### CommentCard.tsx (260 lines)
- Two states: collapsed (truncated text, ✕ on hover) and focused (full text, ⋮ menu, resolve, category)
- ⋮ menu: Edit/Delete for active, Re-open for resolved, Recover for deleted
- Inline edit: textarea, Enter saves (if non-empty/changed), Escape cancels, blur saves
- Resolve: 300ms CSS transition (opacity→0, translateX→20px) then callback
- Category dropdown with dynamic TA/TR based on taskNumber
- Relative time: now/Xm/Xh/Xd
- Bidirectional hover/click via onFocus/onHover callbacks

### CommentSidebar.tsx (233 lines)
- Filter pills: All/Open/Resolved with counts
- Push-down stacking algorithm:
  - Ideal top = anchor text Y-offset
  - Actual top = max(idealTop, lastCardBottom + 8px gap)
  - Cards ordered by essay position
- Graceful degradation at 20+ comments: falls back to simple list with notice
- Auto-scroll to focused card via scrollIntoView({ behavior: 'smooth' })
- Click on sidebar background unfocuses
- SVG connection line: calculates coordinates from anchor position to card center
- Empty states per filter

### CommentSidebar.css (320 lines)
- Filter pills (blue active state)
- Card states: collapsed, focused (blue border + shadow), hovered (elevated shadow), resolving (fade+slide), resolved (dashed border, 65% opacity), deleted (dotted, 40% opacity)
- ⋮ dropdown menu with danger hover variant
- Truncated text (-webkit-line-clamp: 2)
- Inline edit textarea with blue focus ring
- Resolve button (green outline → green fill on hover)
- Category select dropdown
- Connection line SVG positioning

### Build: Zero new TS errors"
<!-- SECTION:NOTES:END -->

