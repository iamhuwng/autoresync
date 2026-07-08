# Teacher Materials Bulk Selection Actions

## Purpose

This document defines the Teacher Lobby Materials bulk-selection contract.

Bulk selection is a command surface over already-loaded material summary rows. It is not a new data-loading path, not a bypass around material-specific lifecycle services, and not a generic force-delete mechanism.

## Runtime Anchors

- `src/pages/TeacherLobbyPage.jsx`
- `src/components/modern/MaterialSelectionToolbar.jsx`
- `src/components/modern/MaterialSelectionToolbar.css`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/materialListAdapter.js`
- `src/components/modern/DraftCard.jsx`
- `src/components/modern/BookCard.jsx`
- `src/components/modern/BookCardGrid.jsx`

Data-loading scope remains owned by `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.

List row geometry remains owned by `documentation/architecture/teacher-materials-list-view-contract.md`.

Reading V2 master and linked-passage removal remains owned by `documentation/architecture/changelog/reading-v2-material-removal-lifecycle.md`.

## Selection Scope

Teacher Lobby Materials supports selection on these tabs:

| Tab | Selectable items | Selection renderer |
| --- | --- | --- |
| My Content | Assignable tests and owned/deletable tests | `MaterialListRow.selection` |
| Public Library | Visible public tests | `MaterialListRow.selection` |
| Drafts | Visible drafts | `DraftCard.selection` |
| Reading Passage | Visible active Reading Passage summary rows | `MaterialListRow.selection` |
| Book | Owned Book summary rows | `BookCard.selection` through `BookCardGrid` |

Selection is scoped to the active tab and visible filtered rows. Switching tabs or filtering away selected items prunes the selected ids.

## Toolbar Contract

`MaterialSelectionToolbar` renders only when at least one item in the active tab is selected.

The page, not the toolbar, owns action policy. The toolbar receives already-filtered action descriptors and only renders count, item label, buttons, disabled states, and error copy.

Toolbar actions must use shared announcements for create, assign, archive, remove, and delete outcomes. Do not add `alert()` or one-off success banners for bulk actions.

## Tab Action Matrix

| Tab | Current bulk actions | Notes |
| --- | --- | --- |
| My Content | `Assign homework`, `Delete selected`, `Delete simple selected`, `Review Reading V2 removal` | Assignment is single-test until the homework modal supports multi-test preselection. Reading V2 master removal is reviewed one master at a time. |
| Public Library | `Assign homework` | Public rows never expose owner-only delete/archive actions. The action is disabled with a material-specific reason when the selected public test is not assignable. |
| Drafts | `Delete selected` | Deletes selected draft ids through `useTeacherDrafts.deleteDraft`. |
| Reading Passage | `Assign selected`, `Create full test from selected`, `Archive selected` | `Create full test from selected` is Reading Passage only. Assignment can pass a selected passage set. |
| Book | `Archive selected` | Archives owned Books through Book metadata status, not through source-material deletion. |

## Type-Aware Delete Contract

Bulk delete for tests must inspect selected material type before choosing actions.

Simple deletable tests:

- THCS, Writing, Listening, and legacy IELTS tests may use the existing `useTeacherTests.deleteTest` path.
- `useTeacherTests.deleteTest` owns family-specific cleanup such as THCS library/draft cleanup and writing draft cleanup.
- Multiple simple tests may be deleted in a batch after one confirmation.

Reading V2 master full tests:

- Must not be sent through the simple `deleteTest` batch path.
- Must open the existing Reading V2 master removal modal.
- The modal must keep explicit choices for `Remove master only` and `Remove master and linked passages`.
- Linked-passage removal remains one-master-at-a-time so ownership, affected Books, active assignments, and teacher acknowledgement stay explicit.

Mixed selections:

- Show `Review Reading V2 removal` for selected Reading V2 masters.
- Show `Delete simple selected` for selected simple deletable tests.
- Keep non-deletable selected items visible as disabled action/count copy rather than silently dropping them from the action model.

## Reading Passage Action Contract

Reading Passage bulk actions operate on Reading Passage material summary rows only.

- Assign requires every selected passage to have a published snapshot and student-safe projection.
- Create full test is allowed only on Reading Passage tab and creates a draft selected-passage Reading V2 composition.
- Archive selected uses the Reading V2 passage archive service and preserves assignment/result snapshots.
- Unsafe-but-owned passages may remain selectable so teachers can archive them even when assignment is disabled.

## Book Action Contract

Bulk Book archive changes Book metadata status to `archived`.

It must not:

- delete source test materials;
- delete Reading Passage materials attached inside a Book;
- mutate assignment-pinned projections or completed results;
- create whole-Book homework/start actions.

## Observability

Bulk toolbar actions track generic material-selection events:

- `assignSelectedMaterials`
- `deleteSelectedMaterials`
- `archiveSelectedMaterials`

Material-specific actions still emit their existing family events, for example:

- `assignSelectedReadingPassages`
- `createReadingFullTestFromSelectedPassages`
- `teacher_materials_reading_passage_archived`
- `master_delete_requested`
- `archiveBook`

## Retired Patterns

These patterns are obsolete:

- a Reading Passage-only selection toolbar;
- showing `Create full test from selected` outside the Reading Passage tab;
- treating all selected tests as safe for one generic force delete;
- bypassing the Reading V2 master removal modal from bulk delete;
- silently ignoring selected items that cannot accept the chosen action;
- using Book archive to delete attached source materials;
- widening Material list rows or moving row action slots to fit bulk controls.

## Verification Anchors

Use these checks when changing this surface:

- `npx eslint src/pages/TeacherLobbyPage.jsx src/components/modern/MaterialSelectionToolbar.jsx src/components/modern/materialListAdapter.js`
- `npx vitest run src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/components/modern/BookCardGrid.test.jsx src/components/modern/DraftCard.test.jsx src/config/featureRegistry.test.ts --reporter=basic`
- focused `TeacherLobbyPage.test.jsx` coverage for My Content simple delete, mixed Reading V2 master review, Draft delete, Book archive, and Reading Passage selection flows
- `git diff --check`

The full `TeacherLobbyPage.test.jsx` suite may require a larger heap in this repository; an out-of-memory run is not evidence of feature failure, but it must be reported honestly.
