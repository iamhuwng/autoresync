# PRD-0050: Teacher Lobby Materials Compact List View

Created: 2026-05-29
Status: Implemented
Owner: Product / Teacher Experience
Target area: Teacher Lobby, Materials tab

## Purpose

Add a compact list view to the Teacher Lobby Materials tab so teachers can scan, compare, and act on many materials faster than the current grid-only layout allows.

The feature must use the approved current-style design direction from:

- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/concept-current-style.png`
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-mockups.html`
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-components.html`
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-proposal.md`

## Visual Source Of Truth

Implementation must treat the approved mockup artifacts as a design contract, not loose inspiration:

- `concept-current-style.png` is the visual target for overall density, hierarchy, row styling, toolbar geometry, color rhythm, and page composition.
- `teacher-lobby-materials-list-view-mockups.html` is the page-level reference for header, tabs, toolbar, columns, row spacing, actions, footer, and desktop overflow behavior.
- `teacher-lobby-materials-list-view-components.html` is the component master for reusable row, badge, action, toggle, and toolbar parts.
- `teacher-lobby-materials-list-view-proposal.md` explains the rationale and recommended implementation boundaries.

The implemented list view must follow these artifacts faithfully. If production code must deviate because current data, routing, actions, or shared components make an exact match unsafe, the deviation must be documented in the tasklist and final handoff with the reason and replacement behavior.

## Problem

Teacher Materials currently renders materials as cards in a grid. That works for browsing a small number of materials, but it is inefficient for repeated teacher workflows:

- comparing item counts, durations, and update dates across many materials,
- quickly finding incomplete or draft-like items,
- starting a test or assigning homework without visual noise,
- reviewing long material titles without card-height churn,
- using a layout that feels like a real list rather than a widened one-column grid.

The list view must be a distinct compact information layout. It must reuse live design primitives for harmony, but it must not simply stretch the existing grid card into a vertical column.

## Goals

1. Add a grid/list view toggle to Teacher Lobby Materials.
2. Keep the current grid view available and unchanged in purpose.
3. Provide a compact desktop list view with table-like alignment, row-level color accents, concise metadata chips, and right-aligned actions.
4. Reuse current teacher shell, tabs, toolbar, button, badge, icon, and diagnostic patterns where they fit.
5. Create list-specific row and adapter components so grid and list remain cleanly separated.
6. Preserve existing data-loading contracts for My Content, Public Library, and Drafts.
7. Avoid horizontal overflow at teacher desktop widths.
8. Document and enforce the no-Mantine direction for touched teacher UI.

## Non-Goals

- No mobile-specific Teacher Lobby redesign in this PRD.
- No new material creation flow.
- No Reading V2 authoring, runtime, result, or session payload redesign.
- No canonical draft hydration in the listing.
- No broad `/tests` scan for normal teachers.
- No fake filters that appear functional without backed data.
- No Mantine expansion. Do not add new `@mantine/*` usage.

## User Stories

### US-1: Switch To List View

As a teacher, I can switch Materials from grid to list so I can scan my materials in a denser format.

Acceptance:

- A segmented icon toggle appears in the Materials toolbar.
- Grid remains available.
- The selected mode is visually clear.
- Switching mode does not refetch data unnecessarily.
- First implementation can keep mode memory-only for the session. Do not add `localStorage`, `sessionStorage`, or `IndexedDB` persistence in this PRD.

### US-2: Scan Material Metadata

As a teacher, I can see the title, material type/tags, item count, duration badge, updated date, and available actions in one aligned row.

Acceptance:

- List columns are stable: Material, Items, Updated, Actions.
- Duration remains a badge in the Material cell rather than a separate scan column.
- Titles are single-line with ellipsis and native title tooltip for full text.
- Important badges from grid cards are preserved in compact form.
- Normal row height targets `64px` to `68px`.
- Rows do not change height during hover, focus, or action state.

### US-3: Act On Materials

As a teacher, I can edit, delete, start a test, assign homework, complete incomplete material, or use public-library actions from the list.

Acceptance:

- My Content tests keep existing primary actions.
- THCS items that currently support `Assign HW` still support it.
- Incomplete items show recovery actions such as `Complete`, not `Start Test`.
- Actions render in a fixed four-slot icon rail so row layout does not change when `Assign HW` is present or absent.
- Public Library rows do not expose owner-only edit/delete actions.
- Drafts remain grid-only for PRD-0050 list rendering. Later Draft card selected-material actions are outside this list-view PRD and are governed by `documentation/architecture/teacher-materials-bulk-selection-actions.md`.

### US-4: Keep Existing Teacher Data Contracts

As a product owner, I need the list view to be a rendering change, not a data-contract rewrite.

Acceptance:

- My Content continues using indexed owner/creator query behavior from `useTeacherTests`.
- Public Library continues using the existing public-library path.
- Drafts still load only when the Drafts tab is active.
- Reading V2 list rows use session-safe listing metadata only.
- No list row depends on canonical draft payload, passage assets, student runtime payload, session payload, or result projection data.

### US-5: Preserve Visual Harmony

As a teacher, I need the list view to feel native to the current Teacher Lobby design.

Acceptance:

- The page shell, header, content tabs, search area, button styling, shadows, and color tokens match the approved mockup artifacts unless a documented production constraint prevents it.
- List rows use current accent-color language and existing material categories where possible.
- The list view has its own compact row structure and does not look like one-column cards.
- The HTML component master remains the implementation reference for row parts and toolbar/toggle parts.

## Functional Requirements

### FR-1: View Mode State

- Add `materialsViewMode` state in Teacher Lobby or an extracted local component.
- Supported values: `grid`, `list`.
- Default value: `grid`.
- Do not persist the value in browser storage in this PRD.
- Do not alter `contentFilter`, search, type, grade, or exam filters when switching modes.

### FR-2: Toolbar Integration

- Extend the existing Materials toolbar to include a grid/list segmented icon toggle.
- Reuse existing button and icon conventions.
- Place the toggle near the create action, matching the approved mockup geometry.
- If status/folder filters are added, they must be backed by existing or newly specified data. Otherwise leave them out or document as future work.

### FR-3: List Rendering

- Add a dedicated list renderer, separate from grid card components.
- The renderer must accept normalized row view models, not raw test shapes scattered across JSX.
- The list must support at least:
  - regular tests,
  - THCS tests,
  - Reading V2 / IELTS reading materials shown in Teacher Lobby,
  - incomplete items,
  - public-library items,
  - drafts if the Drafts tab is included in V1 wiring.

### FR-4: Row Adapter

- Add an adapter that maps current material/draft objects into list row view models.
- Each row view model should contain:
  - stable `id`,
  - `title`,
  - `iconKind`,
  - `accentKind` or accent color token,
  - `badges`,
  - `itemLabel`,
  - `durationLabel`,
  - `updatedLabel`,
  - `statusKind`,
  - `actions`,
  - optional `disabledReason`,
  - optional `titleTooltip`.
- Keep row adapter pure and unit-tested.

### FR-5: Actions

- Reuse existing action handlers from `TestCard`, `ThcsTestCard`, and `DraftCard` paths.
- Do not introduce action behavior drift between grid and list.
- Owner-only actions must stay owner-only.
- Public-library actions must match existing public-library semantics.
- Disabled actions must expose a clear visual disabled state and not call handlers.

### FR-6: Diagnostics

- Keep existing `grid_rendered` diagnostic compatibility.
- Include `viewMode` in Teacher Lobby render diagnostics.
- If adding a new event, prefer `materials_rendered` or `list_rendered` without removing old fields that tests or troubleshooting depend on.
- Diagnostics must not log full material payloads.

### FR-7: Empty And Loading States

- Grid and list must share existing loading and empty-state semantics.
- List loading can use current page loading state rather than custom skeletons unless already present.
- Empty state copy should not claim filters exist if they are not active.

### FR-8: No Mantine Expansion

- Do not add new `@mantine/*` imports.
- If touched teacher UI already imports Mantine, either replace the touched Mantine usage in the same change or explicitly document the remaining Mantine residue as deferred.
- Prefer current project components and plain CSS modules/files over Mantine replacements.

## Design Requirements

### Visual Check Gates

These gates are release-blocking for this PRD:

1. Artifact contract gate
   - Before coding, implementation owner must review `concept-current-style.png`, `teacher-lobby-materials-list-view-mockups.html`, and `teacher-lobby-materials-list-view-components.html`.
   - Owner must create a short checklist of visual details to preserve: toolbar geometry, toggle position/state, column order, row density, icon tiles, accent strips, badges, action grouping, footer, and no-overflow behavior.

2. Component parity gate
   - New list row, badge, action, and toggle components must be checked against `teacher-lobby-materials-list-view-components.html`.
   - Gate fails if implemented components look like stretched grid cards instead of compact list components.
   - Gate fails if row height, icon tile size, badge treatment, or action grouping materially drifts without documented reason.

3. Page parity gate
   - Final Teacher Lobby list screen must be checked against `concept-current-style.png` and `teacher-lobby-materials-list-view-mockups.html`.
   - Required screenshot widths: `1366`, `1586`, and `1920`.
   - Gate fails if header/tabs/toolbar/list/footer composition does not follow the approved artifacts and no production constraint explains the change.

4. Overflow gate
   - Required desktop widths: `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`.
   - Gate passes only when `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `document.body.scrollWidth <= document.body.clientWidth`.
   - Gate fails if overflow is hidden instead of fixed.

5. Deviation gate
   - Every remaining mismatch against the approved artifacts must be listed in the tasklist or final handoff.
   - Each mismatch must be classified as fixed, accepted with reason, or deferred with follow-up.

### Visual Success Criteria

The implementation is visually successful only when:

- Toolbar, view toggle, create action, column header, list rows, actions, and footer follow the approved mockup layout.
- Row density remains compact, with normal rows targeting `64px` to `68px`.
- Material title, badges, item count, duration, updated date, and actions align in stable columns.
- The released column contract is `Material / Items / Updated / Actions`; duration is badge-only.
- Row color accents, icon tiles, badge shapes, and button treatments match the component master unless documented constraints prevent exact match.
- Long titles use single-line ellipsis and never force row or page overflow.
- No required desktop width has horizontal document overflow.
- Final screenshots are reviewed side-by-side against the approved image and rendered HTML artifacts.
- No undocumented visual mismatch remains before release.

### Layout

- Desktop teacher scope.
- Target usable widths: `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, `1920`.
- No horizontal page overflow at those widths.
- The list table region must fit inside the existing content container.
- Use CSS grid columns with shrink-safe tracks:
  - Material column: flexible, ellipsis-safe.
  - Items column: fixed or bounded.
  - Updated column: fixed or bounded.
  - Actions column: fixed four-slot icon rail.

Retired pre-release layout idea:

- A separate `Duration` scan column is obsolete because duration is already visible as a badge.
- Content-sized action columns are obsolete because they let `Assign HW` change row geometry.

### Row Visuals

- Normal row height: `64px` to `68px`.
- Incomplete rows can be slightly distinct but should not exceed compact list density unless content requires it.
- Accent strip should be narrow and stable.
- Icon tile should be fixed size.
- Badges should be compact and not wrap the row into card-like height.
- Action buttons should be right-aligned and height-stable.

### Responsive Desktop Fallback

- No phone optimization required.
- At narrower desktop widths, reduce gaps and shorten column tracks before allowing horizontal scroll.
- Do not move desktop actions into overflow just to hide an unstable layout. Missing actions leave empty fixed rail slots.
- Do not rely on `overflow-x: hidden` to hide broken layout. The rendered document must not overflow.

## Data And State Constraints

- Normal teacher listing must remain scoped by owner/creator/public-library contracts.
- Super-admin broad access remains exception-only.
- Draft loading remains active-tab gated.
- Do not make row rendering depend on heavy payload hydration.
- Do not change Firestore or RTDB schemas in this PRD.

## Accessibility Requirements

- Toggle buttons must expose accessible names such as `Grid view` and `List view`.
- Icon-only buttons need `aria-label` or visible text.
- Action buttons must be keyboard reachable.
- Disabled actions must use real disabled state when possible.
- Long titles need native `title` attribute or equivalent accessible full-label path.
- Column header text must be visible in list view.

## Observability Requirements

- User-facing new action surfaces must remain observable according to repo rules.
- At minimum, render diagnostics must include `viewMode`, active tab/filter, item count, and loaded scope.
- Action diagnostics should reuse existing action paths where present.

## Error Handling

- List row adapter must tolerate missing optional metadata.
- Missing duration should render a neutral fallback rather than `undefined`.
- Missing updated date should render a neutral fallback.
- Unsupported material type should render with a default icon/accent, not crash.

## Open Decisions

1. Closed: Drafts stay grid-only for PRD-0050 list rendering. Later selected-material actions on Draft cards do not reopen this list-view decision.
2. Closed: `All Statuses` and `All Folders` remain design-only until backed metadata and handlers exist.
3. Closed: list/grid mode is memory-only in PRD-0050. Any persistence needs a separate portability review.
4. Closed: touched `TeacherLobbyPage.jsx` Mantine `AppShell` was replaced with native wrapper markup.
5. Closed: post-review fixed action rail replaces text-width action buttons and optional desktop overflow.

## Release Criteria

- Teacher can switch between grid and list in Materials.
- List view is faithful to `concept-current-style.png`, `teacher-lobby-materials-list-view-mockups.html`, and `teacher-lobby-materials-list-view-components.html`.
- All visual check gates pass.
- Any intentional deviation from the approved artifacts is listed with reason, impact, and follow-up recommendation.
- Existing grid behavior remains intact.
- Existing tests pass.
- New adapter/list/toggle tests cover core behavior.
- Browser QA confirms no horizontal overflow at required desktop widths.
- UTF-8 and diff whitespace checks pass for touched files.

## Architecture Follow-Up

Post-implementation source of truth:

- `documentation/architecture/teacher-materials-list-view-contract.md`

That architecture note supersedes pre-release mockup text where the mockup suggested a separate Duration scan column, content-width action buttons, or optional overflow actions for desktop list rows.
