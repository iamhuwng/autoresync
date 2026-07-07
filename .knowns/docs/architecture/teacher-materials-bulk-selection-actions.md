---
title: Teacher Materials Bulk Selection Actions
description: Teacher Lobby Materials selected-material toolbar contract: tab-specific actions, Reading V2 master review, simple test delete, Draft delete, Book archive, and Reading Passage selected-passage actions.
createdAt: '2026-07-06T00:00:00.000Z'
updatedAt: '2026-07-06T00:00:00.000Z'
tags:
  - architecture
  - teacher-lobby
  - materials
  - bulk-selection
---

# Teacher Materials Bulk Selection Actions

## Purpose

Defines the Teacher Lobby Materials selected-material action contract.

Bulk selection is a command surface over already-loaded summary rows. It is not a data-loading path, not a generic force-delete mechanism, and not a bypass around material-specific lifecycle services.

Repo architecture mirror: `documentation/architecture/teacher-materials-bulk-selection-actions.md`.

## Runtime Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/modern/MaterialSelectionToolbar.jsx`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/materialListAdapter.js`
- `src/components/modern/DraftCard.jsx`
- `src/components/modern/BookCard.jsx`
- `src/components/modern/BookCardGrid.jsx`

Data-loading scope remains owned by @doc/architecture/teacher-materials-listing-and-diagnostics.

List row geometry remains owned by @doc/architecture/teacher-materials-list-view-contract.

Reading V2 master and linked-passage removal remains owned by @doc/architecture/reading-v2-material-removal-lifecycle.

## Selection Scope

Teacher Lobby Materials supports selected-material actions on My Content, Public Library, Drafts, Reading Passage, and Book tabs.

- My Content: assignable tests and owned/deletable tests.
- Public Library: visible public tests; assignment enablement is decided after selection.
- Drafts: visible drafts.
- Reading Passage: visible active Reading Passage summary rows.
- Book: owned Book summary rows.

Selection is active-tab scoped. Tab changes and filters prune selected ids that are no longer visible.

## Action Contract

`MaterialSelectionToolbar` renders only after at least one item in the active tab is selected. It receives action descriptors from `TeacherLobbyPage`; it does not decide policy itself.

Current actions:

- My Content: `Assign homework`, `Delete selected`, `Delete simple selected`, `Review Reading V2 removal`.
- Public Library: `Assign homework`; owner-only delete/archive actions stay hidden and assignment is disabled with a material-specific reason when the selected public test is not assignable.
- Drafts: `Delete selected`.
- Reading Passage: `Assign selected`, `Create full test from selected`, `Archive selected`.
- Book: `Archive selected`.

`Create full test from selected` is Reading Passage only.

## Type-Aware Delete

Simple tests may delete through `useTeacherTests.deleteTest`, which owns family-specific cleanup for THCS, Writing, Listening, and legacy rows.

Reading V2 master full tests must open the Reading V2 master removal modal. They must not be sent through the simple test batch delete path.

Mixed selections split actions:

- `Review Reading V2 removal` opens the master removal review for one selected master.
- `Delete simple selected` deletes selected simple tests only.
- Non-deletable selected rows appear as disabled count/action copy and are not silently dropped.

## Reading Passage And Book

Reading Passage selected assignment requires every selected passage to have a published snapshot and student-safe projection. Unsafe-but-owned passages may still be selectable for archive.

Reading Passage selected archive uses the Reading V2 passage archive service and preserves assignment/result snapshots.

Book selected archive changes Book metadata status. It must not delete attached source materials, assignment-pinned projections, or completed results.

## Observability

Generic selected-material actions:

- `assignSelectedMaterials`
- `deleteSelectedMaterials`
- `archiveSelectedMaterials`

Family-specific actions remain in force, including `assignSelectedReadingPassages`, `createReadingFullTestFromSelectedPassages`, `teacher_materials_reading_passage_archived`, `master_delete_requested`, and `archiveBook`.

## Retired Patterns

- Reading Passage-only selection toolbar
- `Create full test from selected` outside the Reading Passage tab
- generic force delete for all selected tests
- bypassing Reading V2 master removal modal from selected-material actions
- silently ignoring selected items that cannot accept an action
- using Book archive to delete attached source materials
- changing list row geometry to host bulk controls
