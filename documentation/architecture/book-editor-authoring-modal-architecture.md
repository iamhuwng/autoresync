# Book Editor Authoring Modal Architecture

Status: Canonical
Updated: 2026-06-06
Scope: Teacher Materials Book editor opened from Teacher Lobby

## Purpose

Defines the current Book editor shell, tab ownership, interaction boundaries, and visual rules. This document supersedes earlier PRD-0052 task prose that describes a route-first editor, four peer tabs, a decorative tab rail, an inline-only tree action button, green modal chrome, or a paused redesign.

## Entry And Shell Contract

- Normal `Edit` stays on `/lobby` and opens `BookEditorModal`.
- `/teacher/materials/books/:bookId` is compatibility-only and redirects to `/lobby` with one-time modal-open state.
- `BookEditorModal` owns title, status chips, `Save`, `Request review`, close, tab rail, focus containment, scroll lock, and dirty-close confirmation.
- `BookEditorWorkspace` owns editor state and active body content. It receives `bookId` by prop, does not use `useParams()`, and does not render `TeacherHeader`.
- `BookEditorPage` is compatibility/page presentation only.
- Public projection presentation remains read-only.

## Tab Ownership

The modal has exactly three tabs:

- `Overview`: metadata, readiness, and statistics.
- `Content`: Book structure, selected-node editing, material attachment, selected-material actions, and selected-material homework assignment.
- `Settings`: visibility, access, public-review state, cover upload/storage, and maintenance controls.

Book cover uploads use the stable R2 object key `book-covers/{bookId}/cover`; replacing the cover overwrites the previous object instead of showing or editing raw storage URLs in the modal.

Broken Reading Passage refs are handled inside the existing `Content` tab. Do not add a fourth repair tab, a route-first repair page, or a separate Book repair modal. The Content pane may show a repair region for selected broken refs, with reason codes, replace/remove actions, and restore-start for owned archived sources.

Retired:

- peer `Assign` tab;
- `Contents` label;
- body-owned real tabs under a decorative modal tab rail;
- body-level `Save Book Structure`;
- persistent modal footer/status strip.

## Content Layout

Desktop/tablet `Content` uses a two-pane authoring layout.

Left pane:

- quiet Book outline navigator near `380px`;
- compact root add actions, outline search, tree hierarchy, selection, status, and material-ref child rows;
- one three-dot actions trigger per node/ref row;
- no always-visible command dump.

Right pane:

- selected item header and placement;
- node details;
- icon-only structure actions;
- attach-material search/list;
- selected-material summary and icon-only actions.

The right-panel icon buttons use SVG icons, stable `36px` dimensions, `aria-label`, and `title`. Full visible labels are retired for these compact action rows.

## Floating Tree Menu Contract

The three-dot button is a real actions menu, not a duplicate select button.

- Menu renders through a portal under `document.body`.
- Menu uses fixed viewport positioning and may cross card/panel boundaries.
- Opening the menu must not resize or distort the tree row/card.
- Node menu exposes select, sibling move, allowed child creation, and delete.
- Material-ref menu exposes select and remove.
- Outside pointer interaction and `Escape` close the menu.
- Menu closes before modal discard confirmation or another obscuring workflow opens.
- Accessible trigger name is `Open actions for <title>`.

Retired:

- rendering the menu inside the row/card or scroll panel;
- clipping the menu to the tree pane;
- labeling the trigger as an actions menu when it only selects.

## Save And Dirty-State Contract

- Header save remains active-tab owned: the active tab domain always saves.
- Dirty edits in the non-active domain are also flushed so cross-tab edits are not silently skipped.
- When metadata saves before structure, the returned `updatedAt` is threaded into the structure write for optimistic concurrency.
- Structure dirty state compares against the last loaded/saved node baseline, not the immutable initial prop.

## Visual And Typography Contract

- Book editor follows the common teacher authoring modal grammar: neutral frame, violet/indigo primary accent, compact header, one tab rail, body-only work area.
- Green Reading-specific chrome is not a Book editor shell color.
- Body copy, labels, chips, and statuses use regular/medium weight. Bold weight is reserved for modal title, selected-item title, and section hierarchy.
- Avoid nested cards, broad command bars, page heroes, duplicated headings, and decorative gradients.
- Stitch `.stitch/designs/book-editor-content-tab-redesign.html` and `.png` remain layout references, but common teacher-modal shell rules and product semantics win when they conflict.

## Safety And Accessibility

- No new `@mantine/*` imports.
- No whole-Book homework/start action.
- Attach/remove operations mutate Book snapshot refs only, never source materials.
- Broken-ref repair mutates Book material refs only. It must not mutate source Reading Passage materials, assignment-pinned projections, or completed result snapshots.
- Broken-ref reason summaries may include `archived`, `missing`, `inaccessible`, `missing-version`, and `missing-projection`; repair UI must not expose passage bodies, answer keys, canonical payloads, or student data.
- Delete and dirty-close confirmations stay inside the modal.
- Modal traps focus, restores focus after close, and locks background scrolling.
- Tree uses `tree`/`treeitem`/`group` semantics and exposes expanded state.
- Placeholder node types remain representable in the controlled type selector.

## Code Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/routes/TeacherMaterialBookRedirect.tsx`
- `src/components/books/BookEditorModal.tsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookMaterialPicker.tsx`

## Verification Baseline

As of 2026-06-06:

- targeted PRD-0052 Book editor suite: 6 files / 62 tests passing;
- touched Book editor files: no TypeScript diagnostics;
- browser proof: menu portaled outside tree, menu extends beyond tree boundary without changing card height, outside click closes menu, right action buttons are icon-only, and no legacy teal/green shell colors remain in the Book modal slice;
- full repository TypeScript still exits non-zero from pre-existing debt outside this slice.
