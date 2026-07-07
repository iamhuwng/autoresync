---
title: Teacher Materials List View Contract
description: 'Teacher Lobby Materials compact list-view contract for PRD-0050: fixed grid columns, four-slot icon action rail, typography hierarchy, tab scope, and retired widened-card patterns.'
createdAt: '2026-05-30T11:54:40.699Z'
updatedAt: '2026-07-06T00:00:00.000Z'
tags:
  - architecture
  - teacher-lobby
  - materials
  - list-view
  - prd-0050
---

# Teacher Materials List View Contract

## Purpose

Defines the Teacher Lobby Materials compact list-view contract introduced by PRD-0050.

The list view is not a widened one-column card grid. It is a scan/comparison mode with fixed column geometry, icon-only actions, restrained typography, and summary-only material metadata.

Repo architecture mirror: `documentation/architecture/teacher-materials-list-view-contract.md`.

## Runtime Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/modern/SearchFilterBar.jsx`
- `src/components/modern/MaterialViewModeToggle.jsx`
- `src/components/modern/MaterialListView.jsx`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/MaterialSelectionToolbar.jsx`
- `src/components/modern/materialListAdapter.js`

Data-loading scope remains owned by @doc/architecture/teacher-materials-listing-and-diagnostics.

Authoring entry, grid-card behavior, search ownership, and teacher navigation remain owned by @doc/architecture/teacher-lobby-authoring-navigation-contract.

Selected-material toolbar policy is owned by @doc/architecture/teacher-materials-bulk-selection-actions.

## View Mode Contract

Teacher Lobby Materials supports:

- `grid`: default browsing mode using existing cards.
- `list`: compact scan mode using normalized row view models.

View mode is memory-only local component state in PRD-0050. Do not persist it in browser storage without a separate portability review.

Switching view mode must not reset active tab, search query, filters, or loaded material data.

## List Geometry Contract

Header and rows share one CSS grid definition through `--material-list-grid`.

Visible columns:

1. `Material`
2. `Items`
3. `Updated`
4. `Actions`

Duration is badge-only inside the Material cell. It is not a scan column.

Required desktop widths: `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, `1920`.

At those widths:

- no document horizontal overflow
- header `Items`, `Updated`, and `Actions` x positions match first-row cells within `1px`
- normal row height stays `64px` to `68px`

Do not hide horizontal overflow as a substitute for fixing grid geometry.

## Action Rail Contract

List actions use a fixed four-slot icon rail. Missing actions leave empty slots and must not resize the rail.

Slot ownership belongs in the row view model from `materialListAdapter.js`.

| Slot | Action family |
| --- | --- |
| 1 | `Edit`, `View`, `Use as-is`, `Complete` |
| 2 | `Delete` |
| 3 | `Start Test`, `Clone` |
| 4 | `Assign HW` |

Buttons are visually icon-only. Keep `aria-label` and `title`; visually hidden text may remain for accessibility/fallback.

## Selection Contract

Rows may expose an optional `selection` view-model object. Selection state must not add a scan column, resize the four-slot action rail, or move row actions.

The selected-material toolbar is page-level policy. Row/list components only expose and render selection affordances.

## Typography Contract

Do not make all visible list text bold.

Current hierarchy:

- row title: `600`
- headers: `500`
- badges: `500`
- action fallback text: `500`, visually hidden
- metrics, updated date, footer: `400`

Use color, iconography, and slot position for priority before increasing font weight.

## Tab Scope

My Content and Public Library support grid and list modes.

Drafts remain grid-only for PRD-0050 list rendering. `useTeacherDrafts` still runs only when Drafts tab is active, and Draft card-level selected-material actions are governed by @doc/architecture/teacher-materials-bulk-selection-actions.

Public Library rows must not expose owner-only actions such as `Delete`.

## Retired Patterns

Obsolete for Teacher Lobby Materials list mode:

- list rows as widened grid cards
- action columns sized by button text or row action count
- `Assign HW` widening THCS rows
- dedicated `Duration` scan column while duration is already a badge
- blanket `font-weight: 700` or `800` across headers, titles, badges, metrics, actions
- desktop action overflow menus used to hide broken rail geometry
- fake status/folder filters without backed data and handlers
- Reading Passage-only selected-material tooling after another tab has supported selected-material actions
- changing row geometry to host selected-material toolbar controls

## Verification Anchors

Run focused tests:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"
```

Also run targeted UTF-8, `git diff --check`, browser width probe, and computed-style proof after typography changes.


## Material Visual Taxonomy

Leading row icon and color accent semantics are governed by @doc/architecture/teacher-material-visual-taxonomy.

Rows receive semantic `iconKind` and `accentKind` from `materialVisualTaxonomy.js` through `materialListAdapter.js`.

Retired: positional accent rotation by row index, `HomeIcon` for school/test categories, and action icons in the leading material slot.
