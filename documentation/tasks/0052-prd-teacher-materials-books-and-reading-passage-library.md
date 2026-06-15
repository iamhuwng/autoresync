# PRD-0052: Teacher Materials Books And Reading Passage Library

> **PRD Number:** 0052
> **Status:** Discovery Draft
> **Created:** 2026-06-01
> **Author:** Codex via planning session
> **Audience:** Junior developer implementing only after every open decision is resolved
> **Primary surfaces:** Teacher Materials / Teacher Lobby, Reading V2 Studio, Homework assignment, Admin configuration

---

## 1. Introduction / Overview

### 1.1 Problem Statement

Teacher Materials currently treats most content as standalone materials. This is not enough for teachers who organize content by exam family, book, chapter, section, and reusable passage.

The system needs two new material-management concepts:

1. **Book**: a teacher-side organizer/package that groups existing materials into ordered sections, chapters, tests, and placeholder pages.
2. **Reading Passage**: a reusable Reading V2 material that stores one passage plus its questions and answer key as a standalone assignable unit.

The feature must also reshape Teacher Materials discovery around admin-configurable test types such as IELTS, TOEIC, TOEFL, THCS, THPT, CEFR, and later institution-specific types.

### 1.2 Goal

Build a structured Materials system where:

- teachers browse materials through a list-first Teacher Materials view
- teachers filter by admin-configured test types
- teachers can see and assign Reading V2 passages directly
- teachers can create Books as organized packages of existing materials
- Books store references and order, not copied content
- intro/table-of-content placeholders are persisted now but not fully editable pages yet
- whole-book student assignment is deferred until book-level progress and result contracts are designed

### 1.3 Current Codebase Reality

This PRD extends and partially supersedes existing Teacher Materials and Reading V2 contracts.

Relevant existing docs:

- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/tasks/0050-prd-teacher-lobby-materials-list-view.md`
- `documentation/tasks/tasks-0050-prd-teacher-lobby-materials-list-view.md`
- `documentation/tasks/0052-visual-similarity-extraction-and-rebuild-plan.md`
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`
- `documentation/tasks/PRD0048/contract-freeze-0048-prd-reading-v2-studio-and-runtime.md`

Current important constraints:

- Teacher Materials listing must read lightweight summary/index rows, not heavy canonical content.
- Reading V2 canonical drafts, answer keys, import evidence, and hidden provenance must not be exposed to student runtime.
- Reading V2 originally hid broad standalone passage exposure from Teacher Lobby unless approved later. This PRD is that later product approval, but only under the controlled `Reading Passage` tab.
- PRD-0050 implemented a compact list view while preserving grid mode. This PRD changes the target: the old material-item grid is retired as the normal material browser, but its square-card visual language is reused for the 4-block Test Type module under search.
- Visual work must pass `documentation/tasks/0052-visual-similarity-extraction-and-rebuild-plan.md` before any PRD-0052 mockup or implementation is treated as product-faithful.
- Reading V2 full tests should become lightweight test compositions that reference reusable Reading Passage entities by id/version/order instead of storing independent duplicate passage payloads inside every test.

### 1.4 Locked Product Decisions

The following decisions are confirmed:

1. Add a `Reading Passage` tab in Teacher Materials.
2. Add a `Book` tab beside `My Content`, `Public Library`, and `Drafts`.
3. `Reading Passage` is directly assignable as homework in V1.
4. `Book` is organizer/package only in V1.
5. `Book` is not directly assignable as a whole unit in V1.
6. Teachers can assign individual materials from inside a Book in V1.
7. Clicking `Book` tab changes the primary CTA from `Create New Test` to `Create New Book`.
8. `Create New Book` opens a dedicated Book creation modal.
9. `Book` tab list shows only Book records.
10. Test Type list is admin-configurable.
11. Teachers can pin 4 Test Type blocks under the search bar.
12. If teacher has no pinned preference, admin default top 4 test types are shown.
13. Intro/table-of-content placeholders are stored as empty Book nodes now.
14. Placeholder nodes are not assignable in V1.
15. Reading Passage source metadata must preserve original source order and use Test-Type-configured display labels such as `Passage`, `Part`, or `Section`.
16. The old square material grid is not the main material browsing layout.
17. The square-card design from the old grid is reused for the 4 Test Type blocks under the search bar.
18. Clicking a Test Type block filters the active content area below it.
19. For normal material tabs, the area below Test Type blocks is list view.
20. `Book` tab is book-only and displays Books as cover/default-name cards in a grid, not as normal material test cards.
21. Each Test Type block has a small blurred settings icon in the top-right that appears on hover/focus.
22. Clicking the Test Type block body filters the list.
23. Clicking the Test Type block settings icon opens the Test Type preference/edit modal and must not filter the list.
24. Test Type blocks use high-resolution Test Type logo images, not plain text headings, and their card structure should visually align with the Book cover/card treatment.
25. The 4 Test Type blocks must always remain in one centered row; they resize responsively instead of wrapping to multiple rows.
26. Normal material browsing is list-only in PRD-0052. Do not keep a user-facing grid/list toggle for normal material rows.
27. When a Reading V2 full test is created or published, each passage is stored as a standalone Reading Passage entity and the full test stores ordered references to those passage entities.
28. Multiple full tests can reference the same Reading Passage entity when product workflow allows reuse.
29. Book can be created as an empty draft/incomplete organizer and finished later.
30. A Book is structurally ready only when it contains at least one `section`, `chapter`, or `test` node; placeholder nodes alone do not make it ready.
31. Book metadata must include bibliographic fields such as book title, author, publisher, edition/series when available.
32. A Book can belong to multiple Test Types through a `testTypeIds[]` field.
33. When editing a Reading Passage from inside a full test, the default action is to create a test-specific fork/new version for that test only. Editing the shared source passage must be an explicit separate command.
34. In V1, Reading Passage rows appear only in the dedicated `Reading Passage` tab, not duplicated in `My Content`.
35. The 4 Test Type blocks do not include an `All` block. The unfiltered state is represented by no active Test Type selection.
36. In V1, the `Reading Passage` tab has no primary create CTA. Direct `Create Reading Passage` can be added later, but it is not required now.
37. Book supports a full nested node tree in V1, not only a flat outline or one-level hierarchy.
38. Book node tree maximum depth is 5 levels in V1. Root nodes are depth `1`; no node can be created, moved, imported, or saved deeper than depth `5`.
39. All Book node types can contain child nodes in V1, including placeholder nodes. Child containment does not make a placeholder assignable or content-bearing.
40. All Book node types can contain material references in V1, including placeholder nodes. Ref containment does not make a placeholder node directly assignable.
41. Placeholder-only Books remain draft/incomplete even when placeholder nodes contain material refs. A Book needs at least one `section`, `chapter`, or `test` node to be structurally ready.
42. The same material can appear multiple times inside one Book. Each placement is a separate material ref with its own `refId`, parent node, order, and display fallback.
43. Book refs use live material identity/metadata for editor display, but assignment from a Book must bind to an explicit published snapshot/version at assignment time.
44. Book refs can point to published materials only in V1. Draft materials must not be selectable or saved as Book refs.
45. Book visibility in V1 supports private Books and public-library-eligible Books, but this private/public choice is shown only inside the `Book` tab as a Book-specific scope control. It is separate from the main Materials subtabs such as `My Content` and `Public Library`.
46. Reading Passage visibility in V1 supports `Private` and `Public` inside the `Reading Passage` tab only. This is separate from the main Materials subtabs.
47. Reading Passage direct creation is not in V1. Reading Passage entities are auto-created from Reading V2 full-test publish/import/extraction flows.
48. Non-IELTS source order display uses a flexible label configured by Test Type, such as `Passage`, `Part`, or `Section`, plus the stored order number.
49. Teachers can bulk-select Reading Passages and assign them as one combined homework set in V1.
50. Teachers can create a basic reusable full Reading test composition from selected Reading Passages in V1.

### 1.5 Implementation Contract Amendment - 2026-06-03

The production data-plane decision for this PRD is now explicit:

- `material_catalog/material_indexes` is the canonical lightweight Teacher Materials summary index for Reading Passage rows and Book material-picker candidates.
- `reading_v2/listing_indexes` is not the PRD-0052 production listing proof path. Treat it as compatibility/internal unless a future migration updates readers, writers, rules, tests, and browser proof.
- Reading V2 full-test publish creates a master full-test material plus generated Reading Passage materials. The master stores ordered passage material/version refs.
- Each generated Reading Passage must write canonical material/version data, `reading_v2/published_snapshots/{passageMaterialId}/{snapshotVersionId}`, student-safe projection, review projection, material metadata, and Material Catalog summary rows.
- Auto V4, paste/import, and normal Studio authoring converge before publish; none get a separate publish shortcut.
- Reading Passage homework is not complete when only the trusted Reading V2 result exists. The linked Firestore `homework_submissions/{submissionId}` row must also move through the existing homework completion lifecycle.
- Reading V1 stays on the legacy `/tests` and root `/student_safe_tests` contract. Reading V2 uses the namespaced `reading_v2/*` publish/projection/result plane.

Canonical architecture reference: `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.

---

## 2. Definitions

### 2.1 Test Type

An admin-configured exam or curriculum family used for filtering and grouping materials.

Examples:

- IELTS
- TOEIC
- TOEFL
- THCS
- THPT
- CEFR

Closed naming decisions:

- Canonical label is `TOEFL`; `TOFEL` is stored as an alias/typo.
- Canonical label is `CEFR`; `CELF` is stored as an alias/typo.

The implementation must support aliases so old labels, typos, and future renamed labels do not break existing content.

Materials should store Test Type membership as a normalized id list where multi-membership is possible:

- `primaryTestTypeId` for the main category when one category should lead display
- `testTypeIds[]` for filtering and multi-category membership

Book must use `testTypeIds[]` because one Book can belong to multiple Test Types.

### 2.2 Material

Any teacher-manageable unit that can appear in Teacher Materials.

Initial material kinds:

- full test
- Reading Passage
- Book
- draft
- future: listening part, writing prompt, vocabulary set, grammar worksheet, video, file attachment

### 2.3 Reading Passage

A standalone Reading V2 material containing one passage/stimulus plus its task groups, interactions, answer rules, scoring rules, metadata, and safe delivery projections.

It is directly assignable as homework in V1.

Reading Passage is also the reusable building block for Reading V2 full tests. A full Reading V2 test should reference ordered Reading Passage entities rather than duplicating passage payloads inside the test record.

### 2.4 Book

A teacher-owned ordered package of nodes and material references.

In V1, a Book is an organizer and authoring workspace. It is not a student runtime, not a homework unit, and not a result aggregation unit.

Book can be created as an empty draft/incomplete organizer and finished later. Empty draft Books are valid records, but they are not structurally ready until they contain at least one structural `section`, `chapter`, or `test` node.

A placeholder-only Book remains a draft even when its placeholder nodes contain material refs.

### 2.5 Book Node

An ordered tree node inside a Book.

V1 node types:

- `intro-placeholder`
- `toc-placeholder`
- `note-placeholder`
- `section`
- `chapter`
- `test`

All node types can hold material references in V1. Placeholder nodes are stored now for future page editing and remain non-assignable as nodes, but material refs inside them can use normal material actions when the referenced material supports those actions.

V1 Book nodes support full nesting through parent/child relationships. This means the Book outline is a tree, not a flat list. Maximum depth is 5 levels. All node types can contain child nodes and material refs.

---

## 3. Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Add structured material browsing | Teachers can browse list-first Teacher Materials by tab and Test Type |
| G2 | Add admin-configurable Test Types | Admin can create, deactivate, reorder, and configure Test Type display |
| G3 | Add Reading Passage library | Teachers can view Reading Passage materials in a dedicated tab |
| G4 | Make Reading Passage assignable | Teachers can assign Reading Passage homework; students can complete it; teachers can review results |
| G5 | Add Book organizer | Teachers can create Books and arrange existing materials into ordered nodes |
| G6 | Avoid content duplication | Books store references; assigned materials use versioned/snapshot-safe references |
| G7 | Keep runtime safe | Students never read canonical drafts, answer keys, import evidence, or hidden provenance |
| G8 | Avoid junior guesswork | Every workflow, data boundary, edge case, and forbidden shortcut is documented before implementation |

---

## 4. Non-Goals

### 4.1 V1 Non-Goals

V1 must not implement:

- whole-book student assignment
- student book player
- book-level progress tracking
- book-level unlock rules
- aggregate book result dashboard
- rich intro/TOC page editor
- paid/open marketplace of Books
- collaborative multi-teacher Book editing
- live-linked Book updates into already assigned homework
- automatic migration of all old Reading tests into passage materials without an approved backfill plan

### 4.2 Deferred Later Phases

Later phases may add:

- assign selected Book nodes as a batch
- create custom Reading V2 tests from selected Reading Passages
- duplicate Book structures
- whole-book assignment snapshots
- student Book page
- node-level progress and unlocks
- aggregate Book results
- full placeholder page editing

---

## 5. User Stories

### 5.1 Teacher Materials Browsing

- As a teacher, I can see `My Content`, `Public Library`, `Drafts`, `Reading Passage`, and `Book` tabs.
- As a teacher, I can search materials by title and relevant metadata.
- As a teacher, I can click a Test Type block and filter the current tab list.
- As a teacher, I can pin 4 Test Type blocks to match my teaching focus.
- As a teacher, I can reset to admin defaults if I do not want custom pinned blocks.

### 5.2 Reading Passage

- As a teacher, I can view Reading Passage materials separately from full tests.
- As a teacher, I can see source metadata such as original full test and source order display.
- As a teacher, I can assign one Reading Passage as homework.
- As a student, I can complete Reading Passage homework using a safe Reading V2 runtime.
- As a teacher, I can review results for Reading Passage homework.
- As a teacher, I can later use Reading Passages as source units for custom test creation.

### 5.3 Book

- As a teacher, I can open the `Book` tab and see only Books.
- As a teacher, I can click `Create New Book` and open a dedicated modal.
- As a teacher, I can create Book metadata: title, Test Type, tags, description, visibility.
- As a teacher, I can add section/chapter/test nodes.
- As a teacher, I can add intro/TOC placeholders now even though page editing is future work.
- As a teacher, I can attach existing materials to any Book node type.
- As a teacher, I can reorder nodes and material refs.
- As a teacher, I can assign an individual material from inside a Book.

### 5.4 Admin

- As an admin, I can configure the Test Type list.
- As an admin, I can set display order, active state, labels, and default pinned types.
- As an admin, I can deactivate a Test Type without breaking existing materials.
- As an admin, I can define allowed material kinds per Test Type if needed.

---

## 6. Product Structure

Target hierarchy:

```text
Test Type
  Book
    Book Node
      Material Reference
```

Examples:

```text
IELTS
  Cambridge IELTS 18
    Introduction
    Table of Contents
    Test 1
      Reading Passage 1
      Reading Passage 2
      Reading Passage 3
    Test 2
      Full Reading Test
```

```text
THCS
  Grade 9 Semester Review
    Chapter 1: Vocabulary
    Chapter 2: Reading Practice
    Test: Midterm Practice
```

Book must be flexible enough to hold mixed material kinds later, but V1 implementation should only expose material kinds that are actually backed by listing, assignment, and launch contracts.

---

## 7. Functional Requirements

### 7.1 Teacher Materials Tabs

| ID | Requirement |
|----|-------------|
| FR-TAB-1 | Teacher Materials must show tabs: `My Content`, `Public Library`, `Drafts`, `Reading Passage`, `Book`. |
| FR-TAB-2 | `My Content` must show teacher-owned non-draft materials except Book-only and Reading-Passage-only views. |
| FR-TAB-3 | `Public Library` must show public/library-eligible materials through lightweight indexes only. |
| FR-TAB-4 | `Drafts` must keep existing draft behavior and must not load while inactive. |
| FR-TAB-5 | `Reading Passage` must show Reading Passage materials only. |
| FR-TAB-6 | `Book` must show Book records only. |
| FR-TAB-7 | Tab switching must not hydrate full canonical Reading V2 documents for list display. |
| FR-TAB-8 | Tab switching must preserve search term unless explicitly cleared by user. |
| FR-TAB-9 | Test Type block filters apply to the active tab. |
| FR-TAB-10 | Normal material tabs use list view below the Test Type block module. |
| FR-TAB-11 | `Book` tab uses a Book cover/default-name grid below the Test Type block module. |
| FR-TAB-12 | Book cover grid is a Book-specific display, not the old material test-card grid. |
| FR-TAB-13 | Reading Passage rows must not be duplicated in `My Content` in V1. Teachers access them through `Reading Passage`. |
| FR-TAB-14 | `Reading Passage` tab must not show `Create New Test` or `Create Reading Passage` as a primary CTA in V1. |
| FR-TAB-15 | Main Materials tabs and Book visibility controls are separate. The top-level `Public Library` tab is not the Book public/private switch. |
| FR-TAB-16 | Public Books must be browsed through the `Book` tab's Book-specific public scope in V1, not mixed into the normal material rows of the top-level `Public Library` tab. |
| FR-TAB-17 | Main Materials tabs and Reading Passage visibility controls are separate. The top-level `Public Library` tab is not the Reading Passage public/private switch. |
| FR-TAB-18 | Public Reading Passages must be browsed through the `Reading Passage` tab's Book-like `Private`/`Public` scope in V1, not mixed into normal material rows of the top-level `Public Library` tab unless a later PRD changes this. |

Closed decision:

- Reading Passage rows appear only in `Reading Passage` for V1.
- `Reading Passage` tab has no primary create CTA in V1.

### 7.2 Search And Test Type Blocks

| ID | Requirement |
|----|-------------|
| FR-FILTER-1 | Teacher Materials must render search bar above Test Type blocks. |
| FR-FILTER-2 | Exactly 4 Test Type blocks are visible by default. |
| FR-FILTER-3 | Visible blocks come from teacher pinned preference when present. |
| FR-FILTER-4 | Visible blocks come from admin default top 4 when teacher has no preference. |
| FR-FILTER-5 | Clicking a Test Type block filters the current list to that Test Type. |
| FR-FILTER-6 | Clicking the active Test Type block again clears the Test Type filter. |
| FR-FILTER-7 | Search combines with Test Type filter using AND semantics. |
| FR-FILTER-8 | Inactive Test Types remain displayable on old materials but cannot be selected for new material creation. |
| FR-FILTER-9 | Test Type filtering must use indexed summary fields, not canonical content scans. |
| FR-FILTER-10 | The 4 Test Type blocks must reuse the square-card visual language from the old material grid. |
| FR-FILTER-11 | The 4 Test Type blocks are configurable by teacher preference. |
| FR-FILTER-12 | If teacher preference is absent or invalid, use the admin-configured default blocks. |
| FR-FILTER-13 | Each Test Type block must expose a small blurred settings icon in the top-right on hover and keyboard focus. |
| FR-FILTER-14 | Clicking the Test Type block body filters the active list by that Test Type. |
| FR-FILTER-15 | Clicking the Test Type settings icon opens a preference/edit modal and must stop propagation so the block body filter action does not fire. |
| FR-FILTER-16 | The settings icon must be keyboard reachable, have an accessible name, and remain visible on focus for keyboard users. |
| FR-FILTER-17 | The active Test Type filter state must be visible through selected-card styling; do not show instructional helper text such as "click again to clear" in the normal UI. |
| FR-FILTER-18 | Test Type blocks must render a high-resolution logo image area instead of using the Test Type text as the main visual. |
| FR-FILTER-19 | Test Type block layout must be closer to Book cards: cover/logo area above, compact metadata and chips below. |
| FR-FILTER-20 | Production logo assets must come from licensed/admin-uploaded URLs or approved bundled assets, with fallback text badge only when no logo is available. |
| FR-FILTER-21 | If the logo already contains the Test Type name, the card body must not repeat the same Test Type text title. |
| FR-FILTER-22 | The 4 Test Type blocks must always render as one centered row at supported viewport widths; card internals may compress/hide secondary metadata before the row wraps. |
| FR-FILTER-23 | The 4 Test Type block slots must be real Test Types only, not an `All` block. |
| FR-FILTER-24 | `All` is not rendered as a Test Type block in V1. No active Test Type filter means all matching materials for the active tab and search term. |

Closed decision:

- Teachers clear an active Test Type filter by clicking the active Test Type block again.
- The 4-block Test Type module does not include an `All` block.

### 7.3 Admin Test Type Configuration

| ID | Requirement |
|----|-------------|
| FR-ADMIN-TT-1 | Admin can create Test Type records. |
| FR-ADMIN-TT-2 | Admin can edit Test Type label, short label, active state, display order, color/icon token, and aliases. |
| FR-ADMIN-TT-3 | Admin can set whether a Test Type is teacher-selectable for new materials. |
| FR-ADMIN-TT-4 | Admin can set default top 4 Test Types. |
| FR-ADMIN-TT-5 | Admin can deactivate a Test Type without deleting it. |
| FR-ADMIN-TT-6 | Existing materials referencing inactive Test Types must still render with their stored label or alias. |
| FR-ADMIN-TT-7 | Admin configuration changes must not mutate existing material snapshots. |
| FR-ADMIN-TT-8 | Admin Test Type records must be globally readable by authenticated teachers for rendering/filtering. |
| FR-ADMIN-TT-9 | Only super admins can create/edit/deactivate Test Types in V1. |
| FR-ADMIN-TT-10 | Admin can configure the Reading source order label per Test Type, such as `Passage`, `Part`, or `Section`. |
| FR-ADMIN-TT-11 | Seed/default Test Type config must use canonical `TOEFL` with `TOFEL` as an alias. |
| FR-ADMIN-TT-12 | Seed/default Test Type config must use canonical `CEFR` with `CELF` as an alias. |
| FR-ADMIN-TT-13 | Teacher admins and normal teachers must not directly create/edit/deactivate Test Types in V1. |

Recommended V1 fields:

```text
testTypeId
canonicalKey
label
shortLabel
aliases[]
active
teacherSelectable
displayOrder
defaultPinnedRank
colorToken
iconToken
logoUrl
logoAlt
allowedMaterialKinds[]
readingSourceOrderLabel
readingSourceOrderLabelPlural
createdAt
updatedAt
updatedBy
```

Material metadata should not depend only on the display label. Store canonical IDs and aliases separately so filtering works even if labels are renamed later.

Recommended material-side fields:

```text
primaryTestTypeId
testTypeIds[]
testTypeLabelsSnapshot[]
```

For Books, `testTypeIds[]` is required and can contain more than one id.

### 7.4 Reading Passage Entity

| ID | Requirement |
|----|-------------|
| FR-RP-1 | Reading Passage must be a first-class teacher material kind. |
| FR-RP-2 | Reading Passage must contain one passage/stimulus plus its related task groups, questions, and answer key/scoring rules. |
| FR-RP-3 | Reading Passage must have lightweight metadata/index record for list display. |
| FR-RP-4 | Reading Passage list row must show title, Test Type, question count, duration/time guidance if present, updated date, visibility, and source order display. |
| FR-RP-5 | Source order must support known numeric order, known non-numeric order, and `unknown`. |
| FR-RP-6 | Reading Passage must preserve source full test material id when available. |
| FR-RP-7 | Reading Passage must preserve source snapshot/version when available. |
| FR-RP-8 | Reading Passage must preserve source question range when available. |
| FR-RP-9 | Reading Passage must preserve source name/source book/source test label when available. |
| FR-RP-10 | Reading Passage must preserve hidden provenance for audit/search/history, but student runtime must not expose hidden provenance. |
| FR-RP-11 | Reading Passage must be versioned. |
| FR-RP-12 | Editing a published Reading Passage must create/open a draft revision rather than mutating the live version. |
| FR-RP-13 | Reading V2 full tests must store ordered references to Reading Passage entities rather than independent duplicated passage payloads whenever the passage is reusable. |
| FR-RP-14 | Reading V2 full test composition must preserve the role/order of each referenced passage, including source order display such as `Passage 1`, `Part 2`, or `Section A`. |
| FR-RP-15 | Multiple Reading V2 full tests may reference the same Reading Passage entity and version. |
| FR-RP-16 | If a full test needs a customized variant of an existing passage, it must create a new Reading Passage version or forked entity instead of silently mutating the shared source. |
| FR-RP-17 | Full-test render, homework assignment, and result review must resolve the passage reference through a published snapshot/version, not through mutable draft content. |
| FR-RP-18 | When teacher edits a referenced Reading Passage from inside a full-test editor, default behavior must create a test-specific fork/new version and update only that full-test composition reference. |
| FR-RP-19 | The full-test editor must not silently edit the shared source Reading Passage used by other tests. |
| FR-RP-20 | Shared-source editing must be available only through an explicit action such as `Edit shared source passage`, with warning that other referencing tests may see the new source version only if they intentionally update to it. |
| FR-RP-21 | If the shared source Reading Passage has a newer version than the version referenced by a full test, the full-test editor should show an update-available state rather than auto-updating the test. |
| FR-RP-22 | Reading Passage visibility must support `private` and `public` in V1. |
| FR-RP-23 | `Private` and `Public` Reading Passage filters must appear only when the `Reading Passage` tab is active. |
| FR-RP-24 | Direct blank/manual Reading Passage creation is not in V1. Reading Passage entities are created from Reading V2 full-test publish/import/extraction flows. |
| FR-RP-25 | Reading Passage source order display must use a Test-Type-configured label plus order number, not hardcoded IELTS `Passage` wording for every Test Type. |
| FR-RP-26 | Reading Passage metadata must store source order as structured fields: label token/snapshot, numeric order when known, and display fallback. |
| FR-RP-27 | Teacher can create a basic reusable full Reading test composition from selected Reading Passages in V1. |
| FR-RP-28 | Creating a full Reading test from selected Reading Passages must create a saved test composition/material, not a homework assignment by itself. |

### 7.5 Reading Passage Direct Homework

| ID | Requirement |
|----|-------------|
| FR-RP-HW-1 | Teacher can assign a Reading Passage directly as homework in V1. |
| FR-RP-HW-2 | Homework assignment must store the Reading Passage material id and published snapshot/version id. |
| FR-RP-HW-3 | Homework assignment must not store canonical draft content. |
| FR-RP-HW-4 | Student launch must use a student-safe Reading Passage projection. |
| FR-RP-HW-5 | Student runtime must render a one-passage Reading V2 experience. |
| FR-RP-HW-6 | Student submission must produce scoring compatible with existing homework result flows. |
| FR-RP-HW-7 | Teacher result view must identify result as Reading Passage homework. |
| FR-RP-HW-8 | Result view must show Reading Passage title and source passage metadata when available. |
| FR-RP-HW-9 | Reading Passage homework must support retake/attempt policy only through existing homework settings unless explicitly extended. |
| FR-RP-HW-10 | Assigning a Reading Passage from inside a Book must still create a normal material homework assignment, not a Book assignment. |
| FR-RP-HW-11 | Teacher can bulk-select multiple Reading Passages and assign them as one combined homework set in V1. |
| FR-RP-HW-12 | Combined Reading Passage homework set must store ordered passage refs and assignment-time published snapshot/version ids for each selected passage. |
| FR-RP-HW-13 | Combined Reading Passage homework set is not automatically saved as a reusable full test material. Teacher must choose the separate create-full-test action for that. |
| FR-RP-HW-14 | Bulk assign and create-full-test are contextual selection actions in `Reading Passage`; they are not a primary `Create Reading Passage` CTA. |

Design warning:

Direct Reading Passage homework is not a listing-only feature. It requires safe projection, launch, submission, scoring, homework indexing, and result review compatibility before release.

### 7.6 Book Records

| ID | Requirement |
|----|-------------|
| FR-BOOK-1 | Book must be a first-class teacher material organizer/package. |
| FR-BOOK-2 | Book V1 must not be directly assignable as a whole unit. |
| FR-BOOK-3 | Book must have metadata: title, author, publisher, edition/series, Test Type ids, tags, description, owner, visibility, createdAt, updatedAt. |
| FR-BOOK-4 | Book must store ordered nodes. |
| FR-BOOK-5 | Book must store material references under any Book node type. |
| FR-BOOK-6 | Book must not copy full material payloads. |
| FR-BOOK-7 | Book must support reorder of nodes and material refs. |
| FR-BOOK-8 | Book must support remove material ref without deleting the source material. |
| FR-BOOK-9 | Book delete/archive must not delete referenced materials. |
| FR-BOOK-10 | Book list must load lightweight Book metadata only. |
| FR-BOOK-11 | Opening Book detail/editor may load Book structure, but still should not hydrate referenced material payloads until needed for preview/edit/assign actions. |
| FR-BOOK-12 | Book tab must render Books as cover/default-name cards in a grid. |
| FR-BOOK-13 | Book cover cards must show Book cover if present; otherwise show a generated/default cover using Book name and Test Type. |
| FR-BOOK-14 | Book cover cards must not show normal material actions such as `Start Test` or whole-Book `Assign Homework` in V1. |
| FR-BOOK-15 | Book may be created and saved with no nodes or material refs. This creates an incomplete/draft organizer that can be finished later. |
| FR-BOOK-16 | Book readiness must be separate from Book existence. An empty Book exists, but is not structurally ready. |
| FR-BOOK-17 | Book is structurally ready only when it contains at least one `section`, `chapter`, or `test` node. |
| FR-BOOK-18 | Placeholder-only Books are allowed as drafts but must not be treated as ready, even when the placeholder nodes contain material refs. |
| FR-BOOK-19 | Book must store `testTypeIds[]` because one Book can belong to multiple Test Types. |
| FR-BOOK-20 | Test Type filtering must include a Book when the active Test Type id appears in the Book's `testTypeIds[]`. |
| FR-BOOK-21 | Material refs inside placeholders do not satisfy Book readiness by themselves. |
| FR-BOOK-22 | Book visibility must support `private` and public-library eligibility in V1. |
| FR-BOOK-23 | Public-library Books must remain organizer/package records only; they must not become student-runnable Book assignments in V1. |
| FR-BOOK-24 | Public-library Book publication must not expose private or inaccessible referenced material details. |
| FR-BOOK-25 | A Book can be made public-library visible only after validation confirms its refs are published and public/shareable according to existing material visibility rules. |
| FR-BOOK-26 | Public-library Book list/detail must use lightweight Book metadata and structure refs; do not hydrate full referenced material payloads for browsing. |
| FR-BOOK-27 | `Private` and `Public` Book visibility filters must appear only when the `Book` tab is active. |
| FR-BOOK-28 | The `Book` tab's `Private` and `Public` controls filter Book records only and must not switch the whole Materials page to `My Content` or `Public Library`. |
| FR-BOOK-29 | The top-level `Public Library` tab remains the normal material-library tab; it is not where teachers browse public Books in V1. |

Recommended V1 Book metadata fields:

```text
bookId
title
subtitle
authors[]
publisher
edition
series
isbn
coverUrl
primaryTestTypeId
testTypeIds[]
tags[]
description
visibility
status
ownerId
createdAt
updatedAt
```

Recommended Book status values:

```text
draft-empty
draft-in-progress
ready
archived
```

Recommended Book visibility values:

```text
private
public-library-pending-review
public-library-published
public-library-rejected
```

If moderation is not implemented in the first task slice, `public-library-published` must be limited to authorized admin/test data only. Teacher-submitted public Books should remain `public-library-pending-review`.

Book-tab visibility UI labels:

```text
Private
Public
```

These labels appear only inside the `Book` tab. They are not replacements for the main Materials subtabs.

### 7.7 Book Creation Modal

| ID | Requirement |
|----|-------------|
| FR-BOOK-MODAL-1 | Clicking `Book` tab changes CTA to `Create New Book`. |
| FR-BOOK-MODAL-2 | Clicking `Create New Book` opens a dedicated Book creation modal. |
| FR-BOOK-MODAL-3 | Modal must not reuse `TestCreationModal` as a hidden Book editor. |
| FR-BOOK-MODAL-4 | Modal minimum fields: title, Test Type ids, description, tags, visibility. |
| FR-BOOK-MODAL-5 | Test Type selector must use admin-configured active teacher-selectable Test Types and must support multi-select. |
| FR-BOOK-MODAL-6 | Modal may create Book metadata plus an empty structure. |
| FR-BOOK-MODAL-7 | Modal must not create assignments, full tests, or Reading Passage copies. |
| FR-BOOK-MODAL-8 | After creation, teacher may leave the Book unfinished and return later. |
| FR-BOOK-MODAL-9 | Modal should support optional bibliographic metadata: author, publisher, edition/series, ISBN, and cover. |
| FR-BOOK-MODAL-10 | Creating an empty Book sets status to `draft-empty`; adding `section`, `chapter`, or `test` nodes can move it to `draft-in-progress` or `ready` depending on readiness validation. |

Closed decision:

- Book creation can create an unfinished draft. The teacher does not have to complete structure immediately.

### 7.8 Book Node Model

| ID | Requirement |
|----|-------------|
| FR-NODE-1 | Book nodes must be stored as structured records, not encoded in a title string. |
| FR-NODE-2 | Node types must include `intro-placeholder`, `toc-placeholder`, `note-placeholder`, `section`, `chapter`, and `test`. |
| FR-NODE-3 | Placeholder nodes must persist even while empty. |
| FR-NODE-4 | Placeholder nodes must expose title/order edit only in V1. |
| FR-NODE-5 | Placeholder nodes must not be assignable. |
| FR-NODE-6 | All node types can contain material references in V1. |
| FR-NODE-7 | Node order must be stable and deterministic. |
| FR-NODE-8 | Node nesting maximum depth is 5 levels in V1. |
| FR-NODE-9 | Moving a node must move its descendants and contained material refs. |
| FR-NODE-10 | Deleting a node must require confirmation if it contains child nodes or material refs. |
| FR-NODE-11 | Book V1 must support nested node trees, not only a flat outline. |
| FR-NODE-12 | A node with no `parentNodeId` is a root-level Book node. |
| FR-NODE-13 | A node with `parentNodeId` belongs under that parent node and must render under it in stable sibling order. |
| FR-NODE-14 | Book tree validation must prevent cycles, self-parenting, duplicate sibling order collisions, orphaned child nodes, and moves that place a node under its own descendant. |
| FR-NODE-15 | Book tree validation must prevent saving or moving a node beyond depth `5`. |
| FR-NODE-16 | Root nodes have depth `1`; child depth is parent depth plus `1`. |
| FR-NODE-17 | Add, import, and drag/drop interactions must block any operation that would create depth `6` or deeper. |
| FR-NODE-18 | All node types can contain child nodes in V1: `intro-placeholder`, `toc-placeholder`, `note-placeholder`, `section`, `chapter`, and `test`. |
| FR-NODE-19 | Child containment and material-ref containment are separate concepts, but V1 allows both for all node types. |
| FR-NODE-20 | Placeholder nodes that contain children or material refs remain placeholders: they are not directly assignable and do not become rich editable pages in V1. |
| FR-NODE-21 | Material refs inside placeholder nodes can still expose normal material actions such as open, preview, or assign when the referenced material supports those actions. |
| FR-NODE-22 | Assigning from a placeholder node assigns the selected referenced material, not the placeholder node and not the whole Book. |

Recommended V1 node fields:

```text
nodeId
bookId
parentNodeId
ancestorNodeIds[]
depth
order
nodeType
title
placeholderState
materialRefs[]
createdAt
updatedAt
```

Recommended V1 material ref fields:

```text
refId
materialId
materialKind
snapshotVersionId
titleAtAttach
testTypeIdAtAttach
order
attachedAt
attachedBy
```

Closed decision:

- Book supports full nested node trees in V1.
- Maximum Book node depth is 5 levels in V1.
- All Book node types can contain child nodes in V1.
- All Book node types can contain material refs in V1.

### 7.9 Book Detail / Editor

| ID | Requirement |
|----|-------------|
| FR-BOOK-EDITOR-1 | Book detail/editor must show ordered nodes and refs. |
| FR-BOOK-EDITOR-2 | Teacher can add placeholder nodes. |
| FR-BOOK-EDITOR-3 | Teacher can add section/chapter/test nodes. |
| FR-BOOK-EDITOR-4 | Teacher can attach existing materials to content-bearing nodes. |
| FR-BOOK-EDITOR-5 | Teacher can reorder nodes. |
| FR-BOOK-EDITOR-6 | Teacher can reorder material refs within a node. |
| FR-BOOK-EDITOR-7 | Teacher can remove a material ref from Book without deleting material. |
| FR-BOOK-EDITOR-8 | Teacher can open referenced material through the existing material action. |
| FR-BOOK-EDITOR-9 | Teacher can assign referenced material through existing assignment flow if material kind supports assignment. |
| FR-BOOK-EDITOR-10 | Book editor must clearly indicate whole-Book assignment is not available in V1. |
| FR-BOOK-EDITOR-11 | Book editor is an organizer/editor for metadata, nodes, and references. It is not a student runtime builder. |
| FR-BOOK-EDITOR-12 | Book editor must expose a metadata panel or section for title, subtitle, authors, publisher, edition/series, cover, tags, visibility, and Test Type ids. |
| FR-BOOK-EDITOR-13 | Book editor must show readiness state separately from save state. Saved empty Books are allowed; readiness can remain incomplete. |
| FR-BOOK-EDITOR-14 | Book editor must make placeholder nodes visibly different from content-bearing nodes. |
| FR-BOOK-EDITOR-15 | Book editor must prevent placeholder nodes from receiving assignment actions. |
| FR-BOOK-EDITOR-16 | Book editor must support adding all V1 node types before attaching material refs. |
| FR-BOOK-EDITOR-17 | Book editor must support attaching existing materials to any Book node type through a material picker/search surface. |
| FR-BOOK-EDITOR-18 | Material picker must use lightweight catalog/index rows and must not hydrate full payloads until preview/edit/assign action requires it. |
| FR-BOOK-EDITOR-19 | Book editor must show unavailable/broken material refs without deleting the ref automatically. |
| FR-BOOK-EDITOR-20 | Book editor must show that assigning from a Book assigns the selected material, not the whole Book. |

Book editor areas:

```text
Book metadata
  title
  subtitle
  authors[]
  publisher
  edition / series
  cover
  testTypeIds[]
  tags
  visibility
  status / readiness

Book outline
  root node
    child node
      descendant node
        material refs

Node content
  material refs
  ref order
  broken/unavailable state
  assign/open/edit actions for referenced material
```

### 7.10 Material References And Versioning

| ID | Requirement |
|----|-------------|
| FR-REF-1 | Book stores material refs, not copied payloads. |
| FR-REF-2 | Material refs must store enough display fallback to survive missing/inaccessible source material. |
| FR-REF-3 | Material refs must store snapshot/version id for published material when used for assignment. |
| FR-REF-4 | Book refs can point to published materials only in V1. |
| FR-REF-5 | If a referenced material is deleted/archived, Book must show broken/unavailable ref state instead of crashing. |
| FR-REF-6 | If a referenced material is republished, Book must either keep old version or show update-available state based on final versioning decision. |
| FR-REF-7 | The same `materialId` may appear multiple times in one Book. |
| FR-REF-8 | Each material placement must have a unique `refId`; do not use `materialId` as the Book ref primary key. |
| FR-REF-9 | Reordering or deleting one duplicate material ref must not reorder or delete other refs pointing to the same material. |
| FR-REF-10 | Book editor display refs bind to live material identity/metadata through `materialId`, plus stored fallback fields for missing/inaccessible material. |
| FR-REF-11 | Assigning a material from a Book must resolve and store the explicit published snapshot/version at assignment time. |
| FR-REF-12 | Book ref attach-time version is not the assignment version unless the teacher assigns immediately and that version is still the selected published version. |
| FR-REF-13 | Book changes or source material republish must not mutate already-created homework assignments. |
| FR-REF-14 | Book material picker must exclude draft materials in V1. |
| FR-REF-15 | Book save validation must reject draft material refs even if they are injected through stale client state or imported data. |

Closed decision:

- Book editor display refs bind to live material identity/metadata; assignment actions bind to explicit published snapshot/version at assignment time.
- Book refs can point to published materials only in V1.

Implementation note:

- Store display fallback fields on the ref so the Book editor can still render a broken/unavailable row if live material is later deleted, archived, or inaccessible.

---

## 8. UX Requirements

### 8.1 Teacher Materials Layout

Target layout:

```text
TeacherHeader
Main content
  Page title / Materials context
  Tabs
  Search bar + active CTA
  4 square Test Type blocks
  List view for normal material tabs
  Book cover grid for Book tab
```

Rules:

- TeacherHeader remains attached to the top shell edge.
- Page padding and max width live inside main content wrapper.
- Teacher Materials should use current compact list view contracts where possible.
- The old square material-card design is preserved only as the Test Type block visual language.
- Test Type blocks are filter controls, not material records.
- Test Type blocks have two click targets: block body for filtering; hover/focus settings icon for preference/edit modal.
- Do not make Book/Reading Passage tabs look like separate applications.
- Do not put Book editor state into list rows.
- Do not make list rows hydrate heavy content.

### 8.2 List View

Current PRD-0050 already implemented compact list view. This PRD should reuse that list pattern.

Normal material tabs use list view below the Test Type block module:

- `My Content`
- `Public Library`
- `Drafts` if draft list support is included
- `Reading Passage`

Required list row columns should remain scan-friendly:

- Material
- Type / Items
- Updated
- Actions

Reading Passage row actions:

- Open/Edit/View
- Assign Homework
- Select for bulk assignment
- Create full Reading test from selected passages
- Archive/Delete if owner and allowed

When `Reading Passage` is active, show a Reading-Passage-specific visibility scope control above or near the list:

```text
Private | Public
```

Rules:

- This control is visible only inside `Reading Passage`.
- `Private` shows the teacher's own Reading Passages.
- `Public` shows public Reading Passages available to the teacher.
- This control does not navigate to the top-level `My Content` or `Public Library` Materials tabs.
- Public Reading Passages in V1 remain Reading Passage rows, not normal material rows in the top-level `Public Library` tab.
- `Assign selected` creates one combined homework set from selected Reading Passages.
- `Create full test from selected` creates a saved reusable full Reading test composition/material.
- The tab still has no primary `Create Reading Passage` CTA.

Book row actions:

- Open Book
- Edit metadata
- Archive/Delete if owner and allowed
- No `Start Test`
- No `Assign Homework` for whole Book in V1

### 8.3 Book Cover Grid

`Book` tab is a visual exception.

Book tab must display Book records as cover/default-name cards in a grid.

When `Book` is active, show a Book-specific visibility scope control above or near the Book cover grid:

```text
Private | Public
```

Rules:

- This control is visible only inside `Book`.
- `Private` shows the teacher's own private Books.
- `Public` shows public-library-eligible/published Books.
- This control does not navigate to the top-level `My Content` or `Public Library` Materials tabs.
- Public Books in V1 are still Book organizer cards, not normal material list rows.

Book cover card content:

- cover image if teacher added one
- generated/default cover if no cover exists
- Book title
- Test Type
- node/material count summary
- updated date
- visibility/status

Book cover card actions:

- open Book
- edit metadata
- archive/delete if allowed

Forbidden in V1:

- `Start Test`
- whole-Book `Assign Homework`
- showing all nested materials directly on the cover card
- hydrating full referenced material payloads just to render cover grid

### 8.4 Book Tab CTA

CTA rules:

- `Book` active: primary CTA text = `Create New Book`.
- `Book` inactive: primary CTA follows current material creation behavior.
- `Reading Passage` active: hide/omit the primary create CTA in V1.
- Do not show `Create New Test` while `Reading Passage` is active; it implies the wrong material kind.
- Do not add `Create Reading Passage` in V1 unless a later approved task explicitly scopes direct passage authoring/import.

Closed decision:

- `Reading Passage` tab has no primary create CTA in V1.

---

## 9. Data Architecture Principles

### 9.1 Summary Index First

Teacher Materials list rows must be driven by lightweight summary/index records.

Do not read:

- Reading V2 canonical drafts
- full passage content
- full question/task groups
- answer keys
- import evidence
- student-safe projections
- session-safe payloads
- result payloads

unless the teacher explicitly opens, edits, previews, launches, or assigns a material.

### 9.2 Reading Passage Storage

Recommended conceptual storage:

```text
reading_v2/passage_materials/{materialId}
reading_v2/passage_material_versions/{materialId}/{versionId}
reading_v2/material_metadata/{materialId}
reading_v2/full_test_compositions/{testMaterialId}
reading_v2/full_test_composition_versions/{testMaterialId}/{versionId}
reading_v2/relationship_indexes/{surface}/{materialId}
reading_v2/projections/student_safe_passages/{materialId}:{snapshotVersionId}
```

Exact path names must be reconciled with existing Reading V2 storage paths before implementation.

Important:

- Existing Reading V2 already has `passage_assets`, `task_group_materials`, `full_tests`, `material_metadata`, `published_snapshots`, and projections.
- Do not invent overlapping paths if existing packaging plane can be extended safely.
- Reading Passage homework must use a projection path compatible with current launch/hook contracts.

### 9.2.1 Reading V2 Full Test Composition Model

Target model:

- Reading Passage entities own passage text, task groups, questions, answer key/scoring, source metadata, and student-safe projections.
- Full Reading V2 tests own metadata plus an ordered reference list to Reading Passage entities.
- A full test is a composition/manifest, not the canonical storage location for passage payloads.
- Multiple full tests can call/reference the same Reading Passage entity when that reuse is intentional.
- If a teacher edits a shared passage for only one test, the default system behavior must create a test-specific passage version or forked entity and update only that test composition to reference the new version.
- If a teacher wants to change the reusable source passage itself, they must choose an explicit shared-source edit action.

Course/Class precedent:

- Existing Course/Class linking uses a copy plus original-pointer model: a class-linked course copy can diverge from the source course while still preserving where it came from.
- Reading Passage/Test should use the same safety principle, but with lighter storage: reference a passage version by default, then fork/new-version only when a test needs customization.
- Do not deep-copy every passage into every test by default, because that destroys the reusable Reading Passage library benefit.

Recommended full-test composition fields:

```text
testMaterialId
title
primaryTestTypeId
testTypeIds[]
skill
passageRefs[]
questionCount
durationMinutes
visibility
ownerId
createdAt
updatedAt
publishedVersionId
```

Recommended passage ref fields inside a full-test composition:

```text
refId
passageMaterialId
passageVersionId
order
sourcePassageNumber
sourceOrderLabelSnapshot
sourceOrderDisplaySnapshot
displayTitleSnapshot
questionCountSnapshot
durationSnapshot
```

Rules:

- `order` controls where the passage appears in the full test.
- `sourcePassageNumber` preserves the original numeric order when known.
- `sourceOrderLabelSnapshot` preserves the Test-Type-configured label used at composition time, such as `Passage`, `Part`, or `Section`.
- `sourceOrderDisplaySnapshot` is the full display string, such as `Passage 1`, `Part 2`, or `Section A`.
- Assignment must bind to the full-test composition version and each referenced passage version.
- Student runtime must receive a resolved safe projection, not raw mutable refs.
- Editing a referenced passage inside the full-test editor must fork/new-version by default and update only the current test's `passageVersionId`.
- Shared-source edits must be explicit and must not auto-update already published/assigned tests.

### 9.2.2 Combined Reading Passage Homework Set

Bulk assignment from `Reading Passage` creates a homework set, not a saved material.

Recommended fields:

```text
homeworkId
homeworkKind: "reading_passage_set"
title
passageRefs[]
assignedSnapshotRefs[]
createdBy
classTargets[]
dueDate
settings
```

Rules:

- `passageRefs[]` preserve teacher-selected order.
- `assignedSnapshotRefs[]` bind each passage to its published snapshot/version at assignment time.
- Result review must show one homework item with multiple passage result sections.
- If teacher wants a reusable material from the same selection, they must use `Create full test from selected`.

### 9.3 Book Storage

Recommended conceptual storage:

```text
material_books/{bookId}
material_book_nodes/{bookId}/{nodeId}
material_book_indexes/teacher/{teacherId}/{bookId}
```

Alternative:

```text
materials/{bookId}
  kind: "book"
  structure: [...]
```

Preferred:

- Separate Book structure from generic material listing summary.
- Maintain a lightweight catalog row so Teacher Materials list can show Books without loading structure.

### 9.4 Versioning Principle

Books are mutable organizer documents. Assignments are immutable enough to preserve student experience.

V1:

- Book itself is not assigned, so Book versioning can be simple.
- Material assignment from Book uses existing material assignment version/snapshot behavior.

Future whole-Book assignment:

- Must assign a Book snapshot, not live mutable Book.

---

## 10. Permissions And Security

### 10.1 Teacher

Teacher can:

- read own Books
- create/edit/archive own Books
- submit own eligible Books for public-library review if public Book workflow is enabled
- attach materials they can access
- assign supported published materials
- read own Reading Passage materials
- read public Reading Passage materials available to them
- revise own Reading Passage materials created by full-test publish/import/extraction
- assign own or allowed public Reading Passage materials
- bulk-assign selected Reading Passages as one homework set
- create a basic full Reading test composition from selected Reading Passages

Teacher cannot:

- mutate another teacher's private Books
- attach inaccessible private materials
- publish a Book to Public Library if it contains refs that are not public/shareable
- create a blank/manual Reading Passage directly in V1
- assign draft-only Reading Passage content
- expose answer keys to students

### 10.2 Student

Student can:

- read assigned Reading Passage homework projection
- submit answers for assigned Reading Passage homework
- view permitted result/review data after submission according to existing homework result visibility

Student cannot:

- read Book organizer data unless future student Book runtime is designed
- read canonical Reading Passage draft/material
- read answer keys
- read hidden provenance/import evidence
- infer private teacher library content from Book refs

### 10.3 Admin

Admin can:

- configure Test Types
- inspect global listing config
- deactivate Test Types
- approve/reject public-library Book submissions if moderation is enabled

Admin must not:

- delete Test Type records that existing materials reference unless a migration is approved
- change historical material meaning by relabeling keys without alias handling

---

## 11. Observability

Required event families:

- tab changed
- Test Type block selected/cleared
- teacher pinned Test Type block changed
- Test Type block settings opened
- Book create modal opened
- Book created
- Book node added/reordered/deleted
- material attached to Book node
- material removed from Book node
- Reading Passage assigned as homework
- Reading Passage homework launched
- Reading Passage homework submitted
- Reading Passage result viewed

Payload rules:

- log IDs and counts only when privacy-safe
- do not log passage text
- do not log questions
- do not log answers
- do not log answer keys
- do not log full student names
- do not log import evidence

---

## 12. Edge Cases And Required Preventive Behavior

### 12.1 Test Type Edge Cases

| Edge Case | Prevention |
|-----------|------------|
| Admin deactivates a Test Type used by old materials | Existing materials still render; inactive type cannot be newly selected |
| Admin renames `TOFEL` to `TOEFL` | Use canonical `TOEFL` with `TOFEL` alias; do not rewrite historical material blindly |
| Admin sees `CELF` in old data | Use canonical `CEFR` with `CELF` alias; do not rewrite historical material blindly |
| Teacher admin tries to edit Test Type config | Block; V1 Test Type management is super-admin only |
| Teacher pinned Test Type becomes inactive | Show replacement admin default or show inactive with disabled warning based on final UX |
| Fewer than 4 active Test Types exist | Show only available active types; do not show fake blocks |
| Test Type config fails to load | Use cached/default safe list and show non-blocking error |

### 12.2 Reading Passage Edge Cases

| Edge Case | Prevention |
|-----------|------------|
| Source order unknown | Display source order as `unknown` with the Test-Type-configured label when available; do not invent 1/2/3 |
| Imported test has 2 or 4 passages | Store actual detected order; UI supports non-IELTS counts |
| Non-IELTS source calls units `Part` or `Section` | Use Test-Type-configured source order label; do not hardcode `Passage` |
| Passage has no answer key | Block publish/assignment or show incomplete state |
| Passage is from public material by another teacher | Respect source visibility and duplicate/use-as-own rules |
| Teacher bulk assigns selected passages | Create one combined homework set with ordered assignment-time passage snapshots |
| Teacher creates full test from selected passages | Create saved reusable full-test composition/material; do not assign homework unless teacher separately assigns it |
| Teacher expects `Create Reading Passage` button | Do not show it in V1; passage entities come from full-test publish/import/extraction |
| Source full test is deleted | Preserve source metadata snapshot text/id; show source unavailable |
| Passage was edited after homework assigned | Homework remains bound to assigned snapshot/version |
| Passage projection missing at launch | Fail closed with teacher-facing repair path, not student blank runtime |
| Student opens stale assignment | Load assigned snapshot/version or show unavailable state |
| Teacher tries assigning draft passage | Block; assignment requires published safe projection |

### 12.3 Book Edge Cases

| Edge Case | Prevention |
|-----------|------------|
| Teacher deletes material referenced by Book | Book shows unavailable ref; does not crash |
| Teacher removes ref from Book | Source material remains untouched |
| Teacher deletes Book | Referenced materials remain untouched |
| Source material is republished after being added to Book | Book display may show current material metadata; assignment must freeze selected published snapshot/version at assignment time |
| Book contains empty section/chapter | Allowed; show empty state |
| Placeholder intro/TOC has no content | Allowed; visible as empty placeholder, not assignable |
| Placeholder node contains child nodes | Allowed; placeholder remains non-assignable and child nodes render under it |
| Placeholder node contains material refs | Allowed; placeholder remains non-assignable, but referenced materials can use normal material actions |
| Book has only placeholder nodes with material refs | Book remains draft/incomplete until it has at least one `section`, `chapter`, or `test` node |
| Teacher tries to attach draft material to Book | Block; Book refs support published materials only in V1 |
| Existing Book ref points to material that later becomes draft/unpublished | Show unavailable or needs-repair state; do not auto-delete ref |
| Teacher tries to publish Book with private/non-shareable refs to Public Library | Block or keep pending with validation errors; do not expose private ref details |
| Public-library Book contains ref teacher cannot access | Show unavailable/limited ref; do not leak hidden/private metadata |
| Teacher tries assigning whole Book | Block with clear unavailable state in V1 |
| Material appears multiple times in one Book | Allowed; each placement has its own `refId`, parent node, and order |
| Node reorder conflict from multiple tabs | Use updatedAt/revision token or last-write warning |
| Book contains material teacher can no longer access | Show locked/unavailable row; do not leak details |
| Teacher moves a node under its own descendant | Block move; keep previous tree state |
| Tree import/save creates cycle | Reject save and show repairable validation error |
| Child node points to missing parent | Show orphan repair state; do not drop child silently |
| Teacher nests beyond allowed depth 5 | Block add/import/drag/drop/save before mutation |

### 12.4 Homework Edge Cases

| Edge Case | Prevention |
|-----------|------------|
| Reading Passage assignment has no projection | Assignment creation fails before students see it |
| Student submits malformed response | Trusted submission processor validates shape |
| Teacher views result after material republish | Result binds to original snapshot/version |
| Passage homework mixed with full-test homework | Homework list and result views show material kind clearly |
| Assignment from Book source node removed later | Homework remains valid because assignment stores material id/version |

### 12.5 UI Edge Cases

| Edge Case | Prevention |
|-----------|------------|
| Long Book title | Ellipsis plus title tooltip |
| Long Test Type label | Short label used in 4-block module |
| Mobile/narrow desktop overflow | Follow TeacherHeader and list-view contracts |
| Search returns no rows | Show tab-specific empty state |
| Active tab has CTA unavailable | Disable or replace CTA; do not show misleading action |
| Teacher clicks Test Type settings icon | Stop propagation; open settings modal only; do not change active filter |
| Keyboard user tabs to hidden settings icon | Icon becomes visible on focus and has accessible name |

---

## 13. Conflicts, Convolutions, And Logical Risks

### 13.1 Reading Passage As Direct Homework Is Larger Than It Looks

Risk:

- A list-only Reading Passage library would be small.
- Direct homework means V1 must include projection, launch, scoring, submission, and result review.

Prevention:

- Split implementation into separate phases:
  1. Reading Passage metadata/listing
  2. Reading Passage publish/projection
  3. Reading Passage homework assignment
  4. Student launch/submission/result

### 13.2 Book Is Organizer Only, But Teacher May Expect Assignment

Risk:

- If Book appears like a material, teachers may expect `Assign Homework`.

Prevention:

- Book list row must not show `Assign Homework`.
- Book editor may show `Assign materials from this book`, not `Assign book`.
- Empty copy should avoid saying Book is student-ready.

### 13.3 Material Grid Removal Conflicts With Implemented PRD-0050

Risk:

- PRD-0050 preserved grid/list toggle.
- This PRD removes the old material-item grid as the main material browser.
- This PRD reuses the square-card visual language for Test Type blocks and Book cover cards.

Prevention:

- Do not preserve the old material grid just because PRD-0050 had a toggle.
- Update tests/diagnostics to treat normal material browsing as list view.
- Keep Book cover grid clearly separate from normal material test cards.
- Keep Test Type blocks clearly identified as filters, not material records.

### 13.4 Admin Config Can Become Overbuilt

Risk:

- Admin-configurable Test Types can expand into a taxonomy engine too early.

Prevention:

- V1 admin fields stay small.
- No nested taxonomies in V1 unless needed.
- Aliases handle typos/renames without building complex ontology.

### 13.5 Book Node Tree Can Become Too Flexible

Risk:

- Unlimited nesting and mixed placeholder/content nodes can confuse teachers and juniors.

Prevention:

- Define maximum depth.
- All node types can contain children.
- All node types can contain material refs.
- Use a simple default structure.
- Validate cycle/orphan/depth rules before save and after drag/drop.

### 13.6 Reading Passage Duplicates Could Inflate Storage

Risk:

- Publishing full tests and standalone passages can duplicate passage/task payloads across snapshots/projections/results.
- If full tests each store their own embedded passage payloads, the same passage cannot be reused cleanly across multiple tests.

Prevention:

- Use references in organizer/index layers.
- Treat full Reading V2 tests as compositions that call/reference Reading Passage entities.
- Treat combined Reading Passage homework sets as assignments, not reusable materials.
- Duplicate only where immutable delivery/review snapshots require it.
- Avoid copying passage payload into Book.

### 13.7 Shared Passage Mutation Can Break Other Tests

Risk:

- Multiple tests may reference the same Reading Passage.
- Editing that passage for one test could unintentionally change every other test that references it.

Prevention:

- Published tests must reference explicit passage versions.
- Editing a shared published passage from inside a full-test editor must create a test-specific new version or fork by default.
- Editing the reusable shared source must require a separate explicit command.
- Test composition must update only the intended test to the new passage version.
- Existing assigned homework must remain bound to the old snapshot/version.

---

## 14. Recommended Development Phases

### Phase 0: Product Contract Closure

Resolve remaining open decisions in this PRD.

No code should start before Phase 0 is done.

### Phase 1: Catalog And Test Type Foundation

Deliver:

- admin Test Type config
- teacher pinned 4 Test Type preferences
- normalized material listing index shape
- tab/filter contract tests

No Reading Passage homework yet.

### Phase 2: Reading Passage Library

Deliver:

- Reading Passage metadata/index rows
- `Reading Passage` tab
- `Private | Public` Reading Passage scope inside the `Reading Passage` tab
- source metadata display
- full-test composition model that stores ordered passage refs
- basic create-full-test-from-selected action
- combined Reading Passage homework set assignment
- publish/projection path for one-passage materials and full-test compositions

No student homework launch until projection contract is proven.

### Phase 3: Reading Passage Homework

Deliver:

- homework picker support
- direct assign action
- student launch for one-passage Reading V2 projection
- submission/scoring/result review

This phase is required because direct assignment is V1 scope.

### Phase 4: Book Foundation

Deliver:

- `Book` tab
- `Create New Book` modal
- Book metadata records with bibliographic fields
- Book list
- Book editor/detail with nodes and material refs
- placeholder nodes persisted
- empty draft Book save/resume flow
- multi-Test-Type membership for Books

No whole-Book assignment.

### Phase 5: Book Material Actions

Deliver:

- attach existing materials
- assign individual material from Book
- broken ref handling
- version/update indicators

### Phase 6: Later Book Assignment Design

Design only:

- Book assignment snapshot
- student Book page
- node progress
- unlock rules
- aggregate results
- revision behavior after assignment

No V1 implementation unless separately approved.

---

## 15. Acceptance Criteria

### 15.1 Teacher Materials

- Teacher sees tabs: `My Content`, `Public Library`, `Drafts`, `Reading Passage`, `Book`.
- Teacher sees search bar above 4 Test Type blocks.
- Teacher can click a Test Type block and filter active tab list.
- Teacher can clear Test Type filter.
- Teacher can pin 4 Test Type blocks.
- Teacher Materials list does not hydrate full canonical content.
- Normal material browsing is list-only; no grid/list toggle is shown for normal material rows.
- Book private/public visibility controls appear only inside the `Book` tab.
- Top-level `Public Library` tab does not show public Books as normal material rows in V1.

### 15.2 Admin Test Types

- Admin can create/edit/deactivate Test Types.
- Admin can set default top 4 Test Types.
- Teacher sees updated active Test Types.
- Existing materials with inactive Test Types still render.
- Test Type aliases prevent typo/rename breakage.

### 15.3 Reading Passage

- Teacher can open `Reading Passage` tab and see only Reading Passage rows.
- Teacher does not see Reading Passage rows duplicated in `My Content`.
- Teacher does not see a primary create CTA on `Reading Passage` tab in V1.
- Teacher sees `Private | Public` scope only inside `Reading Passage`.
- Public Reading Passages do not appear as normal rows in top-level `Public Library` in V1.
- Each Reading Passage row shows Test-Type-configured source order label and number if known.
- Reading Passage entities are created automatically from Reading V2 full-test publish/import/extraction, not direct blank creation in V1.
- Full Reading V2 tests store ordered Reading Passage references rather than duplicate embedded passage payloads.
- Multiple tests can reference the same Reading Passage version.
- Editing a shared Reading Passage from inside a full-test editor creates a test-specific new version or fork by default instead of silently changing every test that references it.
- Shared-source passage editing is an explicit command, not the default in-test edit behavior.
- Teacher can assign a Reading Passage as homework.
- Teacher can bulk-select multiple Reading Passages and assign them as one combined homework set.
- Teacher can create a basic reusable full Reading test composition from selected Reading Passages.
- Assignment stores material id plus snapshot/version.
- Student can launch assigned Reading Passage homework.
- Student can submit Reading Passage homework.
- Teacher can view Reading Passage homework result.
- Student runtime never reads answer keys or canonical drafts.

### 15.4 Book

- Teacher can open `Book` tab and see only Books.
- Active `Book` tab changes CTA to `Create New Book`.
- `Create New Book` opens dedicated modal.
- Teacher can create Book metadata, including title, author, publisher, edition/series, tags, visibility, and one or more Test Types.
- Teacher can save an empty draft Book and finish it later.
- Book stores intro/TOC placeholders as empty nodes.
- Teacher can add nested section/chapter/test nodes.
- Book outline supports full nested tree behavior in V1.
- Book is structurally ready only after it has at least one section/chapter/test node.
- Teacher can attach existing material refs to any Book node type.
- Teacher can reorder nodes and material refs.
- Teacher can assign individual supported materials from Book.
- Teacher cannot assign whole Book in V1.

---

## 16. Testing Requirements

### 16.1 Unit Tests

Required areas:

- Test Type config normalization
- Test Type alias resolution
- teacher pinned Test Type preference fallback
- Book metadata validation
- Book multi-Test-Type validation
- Book bibliographic metadata validation
- Book node validation
- Book tree validation: parent ids, depth, ancestor ids, order, cycle prevention, orphan handling
- Book readiness validation: empty draft allowed; placeholder-only stays draft even with refs; ready requires at least one section/chapter/test
- Book ref validation
- Book published-only ref validation
- Reading Passage metadata derivation
- Reading Passage source metadata display model
- Reading Passage Test-Type source order label resolution
- Reading V2 full-test composition reference model
- shared Reading Passage version/fork behavior
- Reading Passage assignment eligibility
- combined Reading Passage homework set validation
- selected-passage full-test composition creation validation
- broken Book ref display model

### 16.2 Integration Tests

Required areas:

- Teacher Materials tab filtering
- `Book` tab CTA switch
- Book creation modal creates Book only
- Book creation can save an empty draft Book
- Book editor updates metadata, Test Type ids, and bibliographic fields
- Book public-library validation blocks private/non-shareable refs
- Book assignment from a material ref stores assignment-time snapshot/version
- Reading Passage assignment creates normal homework assignment
- selected Reading Passage bulk assignment creates one combined homework set
- selected Reading Passage full-test creation creates saved reusable test composition
- Reading V2 full test publish stores passage refs and versions
- Reading Passage homework launch loads safe projection
- Reading Passage result binds to correct snapshot/version

### 16.3 Security Rules Tests

Required areas:

- teacher can read/write own Books
- teacher cannot mutate another teacher's private Book
- public-library Book read path does not expose private/non-shareable refs
- student cannot read Book organizer data in V1
- student can read assigned Reading Passage projection
- student can read assigned combined Reading Passage homework projection
- student can read resolved assigned full-test projection but cannot read mutable passage entities
- student cannot read canonical Reading Passage content or answer keys
- super-admin-only Test Type writes

### 16.4 Browser QA

Required flows:

- teacher opens Materials
- teacher switches each tab
- teacher filters by Test Type block
- teacher creates Book
- teacher saves empty draft Book and sees it in Book tab
- teacher edits Book metadata, including author/publisher and multiple Test Types
- teacher adds placeholder nodes
- teacher adds section/chapter/test node and readiness updates
- teacher attaches material to Book
- teacher assigns Reading Passage homework
- teacher bulk-selects Reading Passages and assigns one combined homework set
- teacher creates a basic full Reading test from selected Reading Passages
- student completes Reading Passage homework
- teacher reviews result

---

## 17. Rollout And Migration

### 17.1 Feature Flags

Recommended flags:

```text
teacherMaterialsTestTypeBlocks
adminConfigurableTestTypes
readingPassageLibrary
readingPassageHomework
materialBooks
materialBookEditor
```

### 17.2 Backfill

Backfill must be separate and safe.

Initial V1 should not require automatic migration of all historical tests.

Allowed approaches:

- create Reading Passage entities automatically for new Reading V2 full-test publishes
- create Reading Passage entities automatically during approved Reading V2 full-test import/extraction flows
- run admin backfill later with dry-run report

### 17.3 Existing Materials

Existing materials need catalog/index records for filtering.

If Test Type is missing:

- infer only when safe
- otherwise mark as `unknown`
- never silently assign a wrong Test Type

---

## 18. Forbidden Patterns

Do not:

- make Book copy full material payloads
- make Book directly assignable in V1
- let student runtime read Book organizer data in V1
- let student runtime read Reading V2 canonical drafts
- expose answer keys/import evidence/provenance to students
- scan all material payloads to render list rows
- hide Reading Passage homework under legacy full-test assumptions
- embed duplicate mutable passage payloads inside each Reading V2 full test
- mutate a shared Reading Passage in a way that silently changes other full tests
- encode Book structure in strings
- delete source material when removing Book ref
- mutate active homework when Book changes
- assume IELTS always has exactly 3 passages for all Test Types
- hardcode `Passage` as the source-order label for every Test Type
- hardcode Test Type list without admin config
- add direct blank/manual `Create Reading Passage` in V1
- treat `TOFEL`, `TOEFL`, `CELF`, and `CEFR` as interchangeable without explicit alias config
- allow non-super-admin roles to mutate Test Type config in V1
- implement whole-Book assignment before progress/result contracts are approved

---

## 19. Open Decisions To Resolve Before Tasklist

1. Closed: Reading Passages appear only in `Reading Passage` for V1, not duplicated in `My Content`.
2. Closed: the 4-block Test Type module does not include an `All` block; no active Test Type filter means all.
3. Closed: teachers clear an active Test Type filter by clicking the active Test Type block again.
4. Closed: `Reading Passage` tab has no primary create CTA in V1; direct passage creation is deferred.
5. Closed: Book can be created as an unfinished draft and resumed later; immediate completion is not required.
6. Closed: Book supports full nested node tree behavior in V1.
7. Closed: Book node maximum depth is 5 levels in V1.
8. Closed: all Book node types can contain child nodes in V1.
9. Closed: all Book node types can contain material refs in V1.
10. Closed: placeholder-only Books remain draft/incomplete even when placeholder nodes contain material refs.
11. Closed: Book allows the same material to appear multiple times; each placement has a unique `refId`.
12. Closed: Book editor display refs use live material metadata; assignment from Book binds explicit snapshot/version at assignment time.
13. Closed: Book refs can point to published materials only in V1; draft materials are not selectable or savable as refs.
14. Closed: Book visibility supports private and public-library eligible in V1; private/public is a Book-tab-only scope control, separate from main Materials subtabs, with no whole-Book student runtime or marketplace sales.
15. Closed: Reading Passage visibility supports `Private` and `Public` inside the `Reading Passage` tab only; it is separate from main Materials subtabs.
16. Closed: no direct Reading Passage creation in V1; entities are created automatically from Reading V2 full-test publish/import/extraction.
17. Closed: non-IELTS source order display uses Test-Type-configured labels such as `Passage`, `Part`, or `Section`.
18. Closed: teachers can bulk-select Reading Passages and assign them as one combined homework set in V1.
19. Closed: teachers can create a basic reusable full Reading test composition from selected Reading Passages in V1.
20. Closed: use canonical `CEFR`; store `CELF` as an alias/typo.
21. Closed: use canonical `TOEFL`; store `TOFEL` as an alias/typo.
22. Closed: super admins only can manage Test Types in V1.

---

## 20. Recommendation Summary

Recommended V1 implementation order:

1. Close open decisions.
2. Build admin Test Type config and list indexes.
3. Build Teacher Materials tabs and Test Type blocks.
4. Build Reading Passage entity storage and full-test composition refs.
5. Build Reading Passage library and projection.
6. Build Reading Passage direct homework.
7. Build Book metadata/list/modal with empty draft support and multi-Test-Type fields.
8. Build Book editor with metadata, nested placeholder/content nodes, section/chapter/test nodes, and material refs.
9. Add assign-individual-material-from-Book action.

Do not build whole-Book assignment in V1.

Do not start tasklist until open decisions are answered.
