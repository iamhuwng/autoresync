# Teacher Lobby Authoring And Navigation Contract

## Purpose

This document defines the current Teacher Lobby authoring, card, and navigation contract after the May 2026 lobby polish.

It exists because older docs split these concerns across PRD-0033 extraction notes, PRD-0022 modal planning, Reading V2 integration notes, and historical test-creation-page analysis. The live teacher workflow should now be read from this architecture note first.

## Current Scope

This contract applies to the teacher `/lobby` materials surface and the shared create flow hosted from that surface.

Current anchors:

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/navigation/TeacherHeader.tsx`
- `src/components/navigation/TeacherNavigation.tsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/TestCard.jsx`
- `src/components/modern/icons.jsx`
- `src/components/test-creation/TestCreationModal.tsx`
- `src/components/thcs-editor/THCSSetupStep.tsx`

The Teacher Lobby is both a material listing surface and the normal teacher entry point for creating tests. Data-loading scope is documented separately in `documentation/architecture/teacher-materials-listing-and-diagnostics.md`. Compact list-view rendering is documented separately in `documentation/architecture/teacher-materials-list-view-contract.md`.

## Creation Entry Contract

Teachers start new material creation from the lobby `Create New Test` action.

Required flow:

1. `TeacherLobbyPage` opens `TestCreationModal`.
2. `TestCreationModal` owns test-family and skill selection.
3. IELTS Reading continues through the shared parser/draft/review path.
4. THCS-THPT branches into the THCS setup and editor surface inside the same shared modal shell.
5. Reading V2 starts from the same modal entry and forwards metadata/start mode into the Studio pipeline.

Required rules:

- Do not route teachers to a separate creation page before test-family selection.
- Do not create a second THCS-only lobby creation modal.
- Do not make the lobby card grid own canonical authoring state.
- Modal close/discard behavior must stay owned by the shared `TestCreationModal` shell.

Legacy route-backed creation/edit pages may remain as compatibility or direct-draft entry points, but they are not the normal teacher-lobby create path.

## THCS Setup Modal Contract

The THCS setup step must feel like a native step inside the shared creation modal.

Required rules:

- Metadata fields stay above the quick-start row.
- The quick-start row stays compact enough to leave visual space below the cards inside the modal viewport.
- Quick-start choices use SVG icon art for `From Template`, `Paste Text`, and `Start Blank`; do not use emoji labels as the primary icon treatment.
- `Advanced Settings` uses an SVG chevron that rotates with the expanded state; do not use the text glyph triangle as the control icon.
- `Paste Text` and `Start Blank` continue from the setup step without opening a new page.

## Search And Filter Bar Contract

`SearchFilterBar` owns the visible search field and create button row for non-draft tabs.

Required rules:

- The search input must render a visible SVG search icon from `src/components/modern/icons.jsx`.
- Do not use emoji search icons in the input.
- The icon must be visually inside the search input chrome, not hidden under the text caret or left padding.
- `Create New Test` remains in the same row so the search/filter action area stays one coherent control band.

## Material Grid Card Contract

Teacher-lobby material grid cards are summary cards, not canonical document readers.

Required rules:

- Cards render titles from approved material metadata/index rows.
- Long card titles clamp to two visible lines.
- Full title remains available through the native `title` tooltip on hover/focus.
- Card badges should stay summary-level: question/task count, skill/type, duration, grade/exam when present.
- Cards must not hydrate Reading V2 canonical drafts, student-safe projections, session payloads, or result payloads just to render the grid.

List mode is not a widened card implementation. It must follow `documentation/architecture/teacher-materials-list-view-contract.md` for grid columns, action slots, typography, and desktop overflow gates.

## Teacher Header Responsive Contract

`TeacherHeader` keeps teacher chrome visible while preventing tab overflow.

Responsive rules:

- `width <= 768`: use the mobile drawer through `MobileMenu`.
- `769 <= width < 1280`: keep the teacher header visible, collapse tab buttons into the compact hamburger dropdown in `TeacherNavigation`, and keep notification/profile controls visible.
- `width >= 1280`: render full inline teacher navigation tabs.

Required behavior:

- The compact hamburger dropdown is for narrow desktop/tablet overflow, not only phone layouts.
- The profile menu and compact navigation menu close on outside click and Escape.
- Teacher pages should not allow nav tab text to squeeze or wrap into broken header layouts.

## Retired Patterns

These patterns are obsolete for the current Teacher Lobby create/navigation flow:

- page-first test creation from lobby before test-family selection
- THCS creation through a separate lobby-only THCS modal
- emoji search icon inside the search input
- text-glyph `Advanced Settings` triangle as the only disclosure icon
- material-card titles expanding beyond two lines and pushing card controls downward
- full teacher tab row on narrow desktop widths where it collides with user/profile controls
- compact list rows implemented as widened one-column cards
- list action rails sized by button text or by whether `Assign HW` is present

Historical docs may still mention these patterns as original PRD targets or pre-refactor behavior. Treat those references as historical unless this document explicitly delegates ownership elsewhere.

## Verification Anchors

Use these checks when changing this surface:

- Teacher Lobby `/lobby` at desktop width shows full tabs and visible search SVG icon.
- Narrow desktop/tablet width collapses tabs into the compact hamburger dropdown before tabs overflow.
- Phone width uses the mobile drawer path.
- `Create New Test` opens `TestCreationModal`, not a new creation page.
- THCS setup quick-start row has breathing room below it and `Advanced Settings` uses an SVG chevron.
- Long card titles show two lines and expose the full title through hover/focus tooltip.
- List view keeps `Material`, `Items`, `Updated`, and `Actions` columns aligned through the fixed-grid contract.

## Related Docs

- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/architecture/teacher-materials-list-view-contract.md`
- `documentation/architecture/teacher-test-creation-parsing-and-review.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/system/navigation-ux-guide.md`
