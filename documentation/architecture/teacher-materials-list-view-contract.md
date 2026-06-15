# Teacher Materials List View Contract

## Purpose

This document defines the Teacher Lobby Materials compact list-view contract introduced by PRD-0050.

It exists because the list view is not a widened one-column card grid. It is a scan/comparison mode with fixed column geometry, icon-only actions, and summary-only material metadata.

## Runtime Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/MaterialViewModeToggle.jsx`
- `src/components/modern/MaterialListView.jsx`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/materialListAdapter.js`
- `src/components/modern/materialVisualTaxonomy.js`

Data-loading scope remains owned by `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.

Authoring entry, search bar ownership, grid-card behavior, and teacher navigation remain owned by `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.

## View Mode Contract

Teacher Lobby Materials supports two render modes:

- `grid`: default browsing mode, using existing card components.
- `list`: compact scan mode, using normalized row view models from `materialListAdapter.js`.

The view mode is local component state. Do not persist it in `localStorage`, `sessionStorage`, `IndexedDB`, or another browser store without a separate portability review.

Switching view mode must not reset the active tab, search query, public-library filters, or loaded material data.

## List Geometry Contract

The header and every row must share one grid definition. The current CSS owner is `--material-list-grid` in `MaterialListView.css`, consumed by both `MaterialListView.css` and `MaterialListRow.css`.

Visible columns are:

1. `Material`
2. `Items`
3. `Updated`
4. `Actions`

Duration is not a scan column. It remains a compact metadata badge in the material cell. This avoids duplicate information and preserves stable action geometry at desktop widths.

## Material Visual Taxonomy

The leading row icon and color accent are governed by `documentation/architecture/teacher-material-visual-taxonomy.md`.

Rows receive semantic `iconKind` and `accentKind` from `materialVisualTaxonomy.js` through `materialListAdapter.js`.

Do not choose material row colors by row index. A material must keep the same visual family when search, filters, sorting, or tab changes move its position.

The left icon is a material type/status marker, not an action. Action icons belong only in the fixed action rail.

Required desktop widths:

- `1280`
- `1366`
- `1440`
- `1536`
- `1586`
- `1600`
- `1920`

At those widths:

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- `document.body.scrollWidth <= document.body.clientWidth`
- header `Items`, `Updated`, and `Actions` x positions match first-row cells within `1px`
- normal row height stays in the `64px` to `68px` range

Do not hide horizontal overflow as a substitute for fixing the grid.

## Action Rail Contract

List actions use a fixed four-slot icon rail. Missing actions leave their slot empty; they must not resize the rail.

Slot ownership is a row-view-model concern in `materialListAdapter.js`, not ad hoc row CSS.

Current slots:

| Slot | Action family |
| --- | --- |
| 1 | `Edit`, `View`, `Use as-is`, `Complete` |
| 2 | `Delete`, `Remove from library` |
| 3 | `Start Test`, `Clone` |
| 4 | `Assign HW`, `Restore` |

Buttons are icon-only visually, with `aria-label` and `title` preserving accessible names. Visible text labels must remain visually hidden, not removed from the DOM.

`Assign HW` is not a reason to widen THCS rows. It occupies slot 4 when present.

Reading Passage archive uses the teacher-facing action label `Remove from library`, not hard-delete language. The restore action appears only in archived Reading Passage scope and occupies the fixed restore/action slot without changing row geometry.

## Typography Contract

The list view uses restrained hierarchy. Do not make every visible text element bold.

Current weights:

- row title: `600`
- column headers: `500`
- badges: `500`
- action fallback text: `500` but visually hidden
- metrics, updated date, and footer: `400`

Use color, iconography, and slot position for priority before increasing font weight.

## Data Contract

The list adapter maps current listing rows into stable view models. It must stay pure and unit-tested.

Rows may use:

- title and metadata already present in the listing row
- count and duration summary fields
- updated or created timestamp
- material type, skill, grade, exam, completeness, and ownership flags
- archive state and safe broken-ref summary fields already present on the row

Rows must not hydrate:

- Reading V2 canonical draft bodies
- standalone passage assets
- student-safe payloads
- session-safe payloads
- result projections

## Tab Scope

My Content and Public Library support grid and list modes.

Drafts remain grid-only in PRD-0050. `useTeacherDrafts` still loads only when the Drafts tab is active.

Public Library rows must not expose owner-only actions such as `Delete`.

Reading Passage active scope excludes archived rows. Reading Passage Archive scope lists owned archived rows and exposes restore where allowed. Broken-ref row state is a badge/disabled-action state from safe summary fields; it must not create a wider row, add a new column, or move actions outside the fixed rail.

## Retired Patterns

These patterns are obsolete for Teacher Lobby Materials list mode:

- list rows implemented as widened grid cards
- row action columns sized by content or button text
- `Assign HW` causing wider THCS rows than non-THCS rows
- a dedicated `Duration` scan column while duration is already a badge
- blanket `font-weight: 700` or `800` across headers, titles, badges, metrics, and actions
- optional action overflow menus used to hide a broken action rail at desktop widths
- fake status or folder filters without backed data and handlers
- hard-delete wording for reversible Reading Passage archive actions

Historical PRD/mockup text may still mention some of these ideas as design exploration. Treat this architecture contract as the release-source of truth after PRD-0050 implementation review.

## Verification Anchors

Use these checks when changing list mode:

- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"`
- targeted UTF-8 check for touched docs/code
- `git diff --check -- <touched files>`
- browser layout probe for the required desktop widths listed above
- computed-style probe for title/header/badge/metric/footer font weights after typography changes
