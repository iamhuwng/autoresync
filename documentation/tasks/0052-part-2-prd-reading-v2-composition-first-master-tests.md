# PRD-0052 Part 2: Reading V2 Composition-First Master Tests

> **PRD Number:** 0052 Part 2
> **Status:** Discovery Draft
> **Created:** 2026-06-09
> **Author:** Codex via planning session
> **Audience:** Junior developer implementing only after a tasklist is created and approved
> **Primary surfaces:** Teacher Materials, Test Creation Modal, Edit Test Modal, Reading V2 single-passage Studio, Reading V2 publish, assignment, runtime, result review

---

## 1. Introduction / Overview

### 1.1 Problem Statement

PRD-0052 said Reading V2 full tests should become lightweight master compositions that reference reusable Reading Passage entities. The current implementation only partially reached that target: standalone Reading Passage entities may be created during publish, but master full tests can still behave like old embedded documents that contain all passage payloads.

This leaves the main PRD-0052 design incomplete.

Teachers need:

- new Reading V2 full tests to publish as ref-only master compositions
- Reading Passages to become the canonical content units after publish
- full-test editing after publish to edit composition metadata/order/refs, not embedded passage payloads
- individual passage editing to happen in single-passage Studio
- assignment/runtime/result review to use frozen passage snapshots, not mutable live content
- a path to create a full test from existing published Reading Passages

### 1.2 Goal

Complete the PRD-0052 master/passage architecture.

After this feature:

- unpublished new test creation can still use full-test Studio because nothing has been split yet
- publishing splits the full test into standalone Reading Passage entities and a pure ref-only master composition
- published master tests no longer open a full-test Studio for all passages
- `Edit Test` opens an Edit Test Modal for master metadata and passage refs
- each passage slot opens a single-passage Studio in another browser tab
- new assignment freezes a composed student-safe projection by default
- teacher may refresh assignment content to latest passage versions only before any student starts
- old embedded test data is not a migration target

### 1.3 Relationship To PRD-0052 And PRD-0054

This is PRD-0052 Part 2, not a separate product family.

It completes the PRD-0052 promise that full Reading V2 tests are master compositions referencing Reading Passage entities.

PRD-0054 covers lifecycle safety:

- archive
- restore
- broken refs
- repair actions
- duplicate warning
- Book broken-ref handling

This Part 2 changes the master-editing model. Therefore PRD-0054 must align with this decision:

- broken master repair lives in Edit Test Modal, not in an old full-test Studio
- `Re-make manually` from master or Book repair opens single-passage Studio in another browser tab
- there is no full-test Studio for already published master tests

### 1.4 Current Codebase Reality

Current code already has partial seams for:

- Reading Passage material/version paths
- full-test composition/version paths
- passage revision drafts
- composition refs
- selected Reading Passages creating a full-test composition

But current behavior is not yet the final product contract:

- PRD-0052 Part 1 added additive Reading Passage extraction and composition writes, but it did not complete the ref-only master contract
- master may still contain embedded passage payloads
- new Auto V4/full-test publish is not guaranteed pure ref-only
- editing a published master is not yet centered on an Edit Test Modal with single-passage Studio per passage
- assignment/runtime/review still need full composition-first proof

This PRD does not require preserving old embedded development data.

Implementation must treat Part 2 as the reconciliation layer over Part 1: keep the useful passage/composition paths and tests from Part 1, but replace new published master writes with ref-only master writes and split Edit routing by draft/published state.

---

## 2. Definitions

### 2.1 Reading Passage

A standalone Reading V2 material containing one passage plus its questions, answer rules, scoring rules, metadata, and projections.

### 2.2 Master Test

A Reading V2 full-test material that stores test metadata and ordered refs to Reading Passage materials.

The master is not the passage content source after publish.

### 2.3 Composition

The ordered recipe for a full test:

- master title/metadata
- passage slot order
- passage material ids
- passage snapshot/version ids
- source/order/title snapshots
- numbering metadata

### 2.4 Ref-Only Master

A master test whose source of truth is composition refs only.

It must not store embedded full passage text/questions or full passage payload.

### 2.5 Runtime

The student-facing data loaded when a student opens assigned work.

Runtime must be student-safe and must not expose answer keys, scoring rules, hidden provenance, or teacher-only draft content.

### 2.6 Frozen Assignment Projection

A composed student-safe projection saved at assignment time.

It is the exact content students launch unless the teacher explicitly refreshes it before any student starts.

### 2.7 Single-Passage Studio

Reading V2 Studio mode for editing one Reading Passage material/version, not a full master with multiple passages.

### 2.8 Edit Test Modal

The master-level editor opened by `Edit Test` after a full test has been published.

It edits composition metadata, passage order, refs, replace/remove actions, visibility, and publish controls. It is not a full passage authoring surface.

---

## 3. Locked Product Decisions

1. New unpublished Reading V2 test creation may use full-test Studio to edit all passages together before first publish.
2. Auto V4 create remains draft-only until publish.
3. Publishing a new full Reading V2 test splits content into standalone Reading Passage entities and a master composition.
4. After publish, the master is pure ref-only.
5. After publish, the master must not store embedded full passage payload.
6. Old embedded development/test data does not need migration.
7. `Edit Test` for a published master opens Edit Test Modal, not full-test Studio.
8. Edit Test Modal can edit master title, Test Type, duration, visibility, passage order, passage refs, replace/remove actions, clone actions, and publish.
9. Edit Test Modal cannot edit passage text/questions inline.
10. Each passage slot can open single-passage Studio in another browser tab.
11. Single-passage Studio edits one Reading Passage material/version.
12. If a passage is edited from the Reading Passage subtab, it opens single-passage Studio.
13. Editing a passage publishes a new version of the same passage material.
14. Publishing a new passage version must not silently mutate masters or Books.
15. After passage publish, show an `Update references?` modal when owned master or Book refs use the old passage version.
16. The `Update references?` modal offers `Keep existing tests/books unchanged`, `Update selected references`, and `Review later`.
17. `Update references?` defaults all refs unchecked.
18. Teacher can update only owned master refs and owned Book refs.
19. Assignments and results are never updated by `Update references?`.
20. Public/non-owned refs are not selectable for update.
21. Non-owned public master tests do not show direct edit.
22. Non-owned public master tests support `Clone`.
23. No `Use as template` option. Clone is the simplified UX.
24. Public/non-owned passage inside an owned master is visible but greyed out for direct editing.
25. Teacher can clone a public/non-owned passage into a teacher-owned passage.
26. Cloned passage gets a new material id and owner = current teacher.
27. Cloned passage default visibility is private.
28. Cloned passage stores lineage metadata.
29. Test Creation Modal flow for existing passages is: `Create new test` -> choose Test Type, for example IELTS -> choose Reading V2 -> choose `Use existing Reading Passages`.
30. `Use existing Reading Passages` selects published Reading Passages only.
31. Public non-owned selected passages are referenced by default, not cloned by default.
32. Picker offers `Clone to my library` for public/non-owned passages, but it is not default.
33. Creating a master from existing passages creates a draft master first. Teacher publishes later.
34. Existing-passage creation flow does not use full-test Studio.
35. Existing-passage creation flow uses Edit Test Modal / master draft editor.
36. Before first publish in existing-passage flow, teacher can edit metadata/order/replace/remove refs but cannot edit passage content inline.
37. Master publish pins the teacher-confirmed snapshot/version for each selected passage ref.
38. If a selected passage updates before master publish, show a warning and ask teacher what to use.
39. Master can contain any number of passages, minimum 1.
40. Duplicate same Reading Passage in one master is allowed with warning.
41. Mixed Test Types are allowed with warning.
42. Visibility is teacher-selected, but public visibility is blocked if refs are not public/shareable.
43. Master composition preserves title snapshot, source order display, original source full test/book if known, and selected order.
44. Assignment freezes a composed student-safe projection by default.
45. Teacher can refresh assignment to latest passage versions only before any student starts.
46. Once any student starts, assignment projection stays frozen.
47. If runtime cannot resolve a pinned passage snapshot, launch blocks with clear error.
48. Publish writes all required outputs atomically.
49. Publish failure must be all-or-nothing.
50. This Part 2 must not conflict with PRD-0054; if conflict appears, Part 2 controls master editing model and PRD-0054 must be amended.

### 3.1 Implementation Clarifications

1. A Teacher Lobby row is treated as a published Reading V2 master only when its row/index metadata identifies it as a Reading V2 full-test composition and includes a published composition version, such as `materialKind: 'reading-v2-full-test-composition'`, `state: 'published'`, and `publishedVersionId`.
2. A Reading V2 draft or unpublished full-test row continues to open full-test Studio.
3. If a published master also has an open draft revision, `Edit Test` opens the master Edit Test Modal and the modal must show the draft-revision state and let the teacher resume or discard it through the approved revision flow.
4. Generated Reading Passages from first publish inherit the master's visibility only when the refs can safely support that visibility. If the master is public and a generated passage cannot be public/shareable, publish must block or require the teacher to choose a private master before commit.
5. Re-publishing or retrying the same source full-test snapshot must be idempotent for generated Reading Passages. The implementation must not create duplicate generated passages for the same `sourceFullTestId + sourceSnapshotVersionId + source order` tuple.
6. Broad fuzzy duplicate detection from full canonical payload scans is not required and remains forbidden. However, the PRD-0054 lightweight duplicate index is now approved; final Part 2 acceptance requires auto-split publish to use that index for duplicate warnings once the index foundation exists.
7. The `Update references?` modal applies to healthy passage version edits. It does not apply to PRD-0054 broken-ref manual remake flows where the originating broken ref is intentionally replaced.

---

## 4. Goals

1. Make new Reading V2 full-test publishes composition-first.
2. Make Reading Passages the content units after publish.
3. Replace published full-test Studio editing with Edit Test Modal + single-passage Studio.
4. Support creation of a master test from existing published Reading Passages.
5. Support safe passage version updates with explicit ref update choices.
6. Preserve assignment/result stability through frozen projections.
7. Keep public/non-owned ownership boundaries clear.
8. Provide clone behavior for public/non-owned masters and passages.
9. Remove reliance on old embedded master payloads for new publishes.

---

## 5. Non-Goals

This PRD does not include:

1. Migrating old embedded full-test data.
2. Preserving old development/test records.
3. Editing multiple published passages together in one full-test Studio.
4. Auto-updating all refs when a passage version publishes.
5. Updating existing assignments/results to newer passage versions.
6. AI remake of passages.
7. Archive/restore implementation details beyond alignment with PRD-0054.
8. Student runtime layout redesign.
9. Whole-book student runtime.

---

## 6. User Stories

1. As a teacher, I want a new Reading V2 test to publish into standalone passages and a master file so that passages can be reused.
2. As a teacher, I want to edit a published master test without accidentally editing every passage payload in one place.
3. As a teacher, I want each passage slot to open its own Studio so that passage edits are controlled and versioned.
4. As a teacher, I want to create a full test from existing Reading Passages so that I can reuse material quickly.
5. As a teacher, I want to clone public passages before editing them so that I do not mutate another teacher's material.
6. As a teacher, I want passage updates to ask which of my tests/books should use the new version so that older work does not change silently.
7. As a student, I want assigned homework to stay stable even if teacher later edits the source passage.
8. As a teacher, I want to refresh not-started assignments to latest passage versions when I intentionally want that update.

---

## 7. Functional Requirements

### 7.1 New Full-Test Creation Before Publish

FR-CREATE-1. Normal new Reading V2 test creation may open full-test Studio while the test is unpublished.

FR-CREATE-2. Auto V4 create may open full-test Studio while the test is unpublished.

FR-CREATE-3. Unpublished full-test Studio may edit all passages together because no reusable Reading Passage entities have been published yet.

FR-CREATE-4. Auto V4 create must not create standalone Reading Passage entities before publish.

FR-CREATE-5. First publish must split the full-test draft into standalone Reading Passage entities and a master composition.

FR-CREATE-6. First publish must be all-or-nothing.

### 7.2 Composition-First Publish

FR-PUBLISH-1. Publishing a new full Reading V2 test must create one Reading Passage material per passage.

FR-PUBLISH-1A. Publishing must be idempotent for generated Reading Passages from the same source full-test material, source snapshot/version, and source passage order. A retry or re-publish of the same source snapshot must reuse or reject duplicate generated passage identities instead of silently creating duplicate passage materials.

FR-PUBLISH-1B. Before final Part 2 acceptance, auto-split publish must run the PRD-0054 duplicate warning against each generated Reading Passage candidate using the owner-scoped duplicate index at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`. This depends on PRD-0054 duplicate-index foundation work and must use the approved PRD-0054 hashed-shingle Sorensen-Dice formula, warn only at `>= 80%`, include active passages and the teacher's own archived passages, and avoid broad canonical scans, answer keys, hidden provenance, AI evidence, scoring rules, or full canonical payload hydration.

FR-PUBLISH-1C. When auto-split publish finds an indexed duplicate, the teacher-facing warning must let the teacher use the existing passage or create the new generated passage anyway. If the match is the teacher's own archived passage, the warning must offer restore-and-use or create-new-anyway behavior through the PRD-0054 archive/restore service.

FR-PUBLISH-2. Publishing must create a master composition storing ordered passage refs.

FR-PUBLISH-3. The master composition must be the source of truth after publish.

FR-PUBLISH-4. The master must not store embedded full passage text/questions or full passage payload.

FR-PUBLISH-5. Publish must write passage materials, passage versions, published snapshots, student-safe projections, review projections/manifests, material metadata, Material Catalog indexes, master composition, composition version, master metadata/index row, and the `reading_v2/publish_commits/{materialId}:{snapshotVersionId}` publish commit marker.

FR-PUBLISH-6. If any passage write, composition write, projection write, index write, or publish commit marker write fails inside the RTDB publish commit plan, publish must fail all-or-nothing.

FR-PUBLISH-7. Publish output must not expose answer keys, scoring rules, hidden provenance, or teacher-only data in student-safe projection/index rows.

FR-PUBLISH-8. New publish must not depend on legacy embedded master payload for runtime correctness.

FR-PUBLISH-9. Before commit, each extracted/generated Reading Passage must independently pass canonical validation for anchors, task groups, interactions, option sets, answer-rule bindings, source order, and student-safe projection generation.

FR-PUBLISH-10. If a whole-test Auto V4 draft contains a passage whose anchors or interactions only work because of cross-passage embedded context, split publish must block with a typed validation issue instead of creating an invalid standalone Reading Passage.

### 7.3 Published Master Edit Test Modal

FR-MASTER-EDIT-0. Teacher Lobby must decide draft-vs-published edit behavior from row/index metadata. Published composition rows open Edit Test Modal. Draft or unpublished Reading V2 rows open full-test Studio. The implementation must not route all Reading V2 rows through one unconditional Studio path.

FR-MASTER-EDIT-1. `Edit Test` on a published master must open Edit Test Modal.

FR-MASTER-EDIT-2. `Edit Test` on a published master must not open full-test Studio.

FR-MASTER-EDIT-3. Edit Test Modal must support editing title.

FR-MASTER-EDIT-4. Edit Test Modal must support editing Test Type.

FR-MASTER-EDIT-5. Edit Test Modal must support editing duration.

FR-MASTER-EDIT-6. Edit Test Modal must support editing visibility.

FR-MASTER-EDIT-7. Edit Test Modal must support passage ordering.

FR-MASTER-EDIT-8. Edit Test Modal must support replacing passage refs.

FR-MASTER-EDIT-9. Edit Test Modal must support removing passage refs.

FR-MASTER-EDIT-10. Edit Test Modal must support cloning public/non-owned passage refs into teacher-owned copies.

FR-MASTER-EDIT-11. Edit Test Modal must show passage title snapshot, source order display, original source full test/book if known, selected order, current version status, and broken/update status.

FR-MASTER-EDIT-12. Edit Test Modal must not edit passage text/questions inline.

FR-MASTER-EDIT-13. Each passage slot must provide action to open single-passage Studio in another browser tab.

FR-MASTER-EDIT-14. Public/non-owned passage slots must show content as non-editable/greyed out for direct editing.

FR-MASTER-EDIT-15. Public/non-owned passage slots may offer clone action.

### 7.4 Single-Passage Studio

FR-PASSAGE-STUDIO-1. Single-passage Studio must edit one Reading Passage material/version.

FR-PASSAGE-STUDIO-2. Opening a passage from Reading Passage subtab must open single-passage Studio.

FR-PASSAGE-STUDIO-3. Opening a passage from Edit Test Modal must open single-passage Studio in another browser tab.

FR-PASSAGE-STUDIO-3A. The parent Edit Test Modal must have a tested refresh path after the child single-passage Studio publishes. Minimum acceptable behavior is refresh-on-window-focus plus an explicit `Refresh version status` action. A cross-tab message channel may be added only if it has focused tests.

FR-PASSAGE-STUDIO-4. Teacher can edit only passages they own.

FR-PASSAGE-STUDIO-5. Non-owned public passages cannot be edited in place.

FR-PASSAGE-STUDIO-6. Publishing a passage edit must create a new version of the same passage material.

FR-PASSAGE-STUDIO-7. Publishing a passage edit must not mutate old published version in place.

FR-PASSAGE-STUDIO-8. Existing masters/books using old version must stay pinned unless teacher explicitly updates them.

FR-PASSAGE-STUDIO-9. Existing assignments/results must stay frozen and never update through passage edit publish.

### 7.5 Update References After Passage Publish

FR-UPDATE-REFS-1. After a passage version is published, system must show an `Update references?` modal when owned refs use the old version.

FR-UPDATE-REFS-2. Modal options must be `Keep existing tests/books unchanged`, `Update selected references`, and `Review later`.

FR-UPDATE-REFS-3. Modal must show passage title.

FR-UPDATE-REFS-4. Modal must show old version to new version.

FR-UPDATE-REFS-5. Modal must show owned master tests using old version.

FR-UPDATE-REFS-6. Modal must show owned Books using old version.

FR-UPDATE-REFS-7. All update checkboxes must default unchecked.

FR-UPDATE-REFS-8. Non-owned refs must be shown only as informational disabled counts.

FR-UPDATE-REFS-9. Assignments and results must not appear as selectable update targets.

FR-UPDATE-REFS-10. `Update selected references` must update only selected owned master/book refs to the new passage snapshot/version.

FR-UPDATE-REFS-11. `Keep existing tests/books unchanged` must close the modal without updating refs.

FR-UPDATE-REFS-12. `Review later` must leave refs unchanged and surface newer-version-available state later in relevant editors.

FR-UPDATE-REFS-13. If no owned refs use old version, show simple publish success only.

### 7.6 Public / Non-Owned Clone Behavior

FR-CLONE-1. Non-owned public master tests must not expose direct edit.

FR-CLONE-2. Non-owned public master tests must expose `Clone`.

FR-CLONE-3. Cloning a public master must create a teacher-owned master draft.

FR-CLONE-4. Public/non-owned passage refs inside the cloned master may continue referencing original public passages unless teacher chooses clone per passage.

FR-CLONE-5. Public/non-owned passages inside owned masters must be non-editable in place.

FR-CLONE-6. Teacher may clone a public/non-owned passage into own library.

FR-CLONE-7. Cloned passage must get a new `passageMaterialId`.

FR-CLONE-8. Cloned passage owner must be current teacher.

FR-CLONE-9. Cloned passage visibility default must be private.

FR-CLONE-10. Cloned passage must store `clonedFromMaterialId`.

FR-CLONE-11. Cloned passage must store `clonedFromSnapshotVersionId`.

FR-CLONE-12. Cloned passage must store `clonedFromOwnerId`.

FR-CLONE-13. Cloned passage must store `clonedFromVisibilitySnapshot`.

FR-CLONE-14. Cloned passage must store `clonedAt`.

FR-CLONE-15. Cloned passage must store `cloneReason: 'teacher-template-clone'`.

FR-CLONE-16. Clone lineage must be hidden/admin provenance and must not expose private source details to students.

### 7.7 Create Master From Existing Reading Passages

FR-EXISTING-1. Teacher Materials `Create new test` flow must allow Test Type -> Reading V2 -> `Use existing Reading Passages`.

FR-EXISTING-2. Existing-passage picker must show published Reading Passages only.

FR-EXISTING-3. Existing-passage picker may show owner-private and readable public passages.

FR-EXISTING-4. Public non-owned passages must be referenced by default.

FR-EXISTING-5. Public non-owned passages must offer `Clone to my library`, but clone must not be default.

FR-EXISTING-6. Teacher must enter master title, Test Type, duration, and visibility.

FR-EXISTING-7. The create flow must default ordering by source order when known.

FR-EXISTING-8. Teacher must be able to drag/drop reorder selected passages.

FR-EXISTING-9. Creating from existing passages must create a draft master first.

FR-EXISTING-10. Creating from existing passages must not open full-test Studio.

FR-EXISTING-11. Draft master from existing passages must be edited through Edit Test Modal / master draft editor.

FR-EXISTING-12. Before publish, teacher may edit metadata, order, replace refs, remove refs, and clone refs.

FR-EXISTING-13. Before publish, teacher may not edit passage content inline.

FR-EXISTING-14. Selected refs must pin the teacher-confirmed snapshot/version at master publish time.

FR-EXISTING-15. If a selected passage updates before master publish, show warning and ask teacher whether to use the latest or keep selected version.

FR-EXISTING-16. Master must contain at least one passage.

FR-EXISTING-17. Master may contain any number of passages above one.

FR-EXISTING-18. Duplicate same passage in one master must warn but allow.

FR-EXISTING-19. Mixed Test Types must warn but allow.

FR-EXISTING-20. Teacher may choose master visibility.

FR-EXISTING-21. Public visibility must be blocked if selected refs are not public/shareable.

### 7.8 Assignment Freeze And Refresh

FR-ASSIGN-1. Assigning a composition-first master must compose and save a student-safe projection at assignment time.

FR-ASSIGN-2. Assignment-time projection must freeze master composition version and each passage snapshot/version ref.

FR-ASSIGN-3. Assignment-time projection must be the default student launch payload.

FR-ASSIGN-4. Runtime must not resolve latest live passage refs by default.

FR-ASSIGN-5. Teacher may refresh assignment to latest passage versions only before any student starts.

FR-ASSIGN-6. Once any student starts the assignment, refresh must be disabled.

FR-ASSIGN-7. Refresh must be explicit and teacher-controlled.

FR-ASSIGN-8. Refresh must show old/new version changes before applying.

FR-ASSIGN-9. Refresh must update the assignment-time student-safe projection.

FR-ASSIGN-10. If a pinned passage snapshot cannot resolve at launch, block launch with clear error.

FR-ASSIGN-11. Student launch must not fetch mutable live passage data.

FR-ASSIGN-12. The authoritative source for "any student has started" is the homework submissions store, not local UI state. Refresh is blocked when any `homework_submissions` record for the homework has a numeric `startedAt` or a status other than `not_started`.

FR-ASSIGN-13. Assignment creation must write the frozen Reading V2 composed assignment projection before or in the same controlled workflow as the Firestore homework assignment reference. If the assignment document exists but the frozen projection is missing, launch must fail closed with a clear error.

### 7.9 Result Review

FR-RESULT-1. Result review must use the same frozen content/version manifest the student saw.

FR-RESULT-2. Result review must not update when source passage gets a newer version.

FR-RESULT-3. Result review must still work if the source passage is later archived, as long as frozen result/snapshot data exists.

FR-RESULT-4. Result review must show title/source/Test Type snapshots from the assignment/result manifest.

### 7.10 Conflict Alignment With PRD-0054

FR-ALIGN-1. PRD-0054 broken master repair must be interpreted through Edit Test Modal for published masters.

FR-ALIGN-2. PRD-0054 manual remake from master repair must open single-passage Studio in another browser tab.

FR-ALIGN-3. PRD-0054 manual remake from Book repair must open single-passage Studio in another browser tab.

FR-ALIGN-4. PRD-0054 must not require a full-test Studio for published masters.

FR-ALIGN-5. If PRD-0054 text says repair happens in Studio, implementation must read that as single-passage Studio or Edit Test Modal depending on context.

---

## 8. User Flows

### 8.1 New Test From Auto V4 / Full-Test Studio

1. Teacher opens Materials.
2. Teacher clicks `Create new test`.
3. Teacher chooses Test Type.
4. Teacher chooses Reading V2.
5. Teacher chooses blank/import/Auto V4 flow.
6. App opens full-test Studio because test is unpublished.
7. Teacher edits all passages together.
8. Teacher publishes.
9. Publish creates standalone Reading Passages and ref-only master.
10. Later `Edit Test` opens Edit Test Modal, not full-test Studio.

### 8.2 Published Master Edit

1. Teacher opens a published master card.
2. Teacher clicks `Edit Test`.
3. App opens Edit Test Modal.
4. Teacher edits metadata/order/refs.
5. Teacher clicks passage slot edit.
6. App opens single-passage Studio in another browser tab.
7. Teacher publishes passage version.
8. App shows `Update references?` modal.
9. Teacher chooses whether owned masters/books update.

### 8.3 Create Test From Existing Reading Passages

1. Teacher opens Materials.
2. Teacher clicks `Create new test`.
3. Teacher chooses IELTS or another Test Type.
4. Teacher chooses Reading V2.
5. Teacher chooses `Use existing Reading Passages`.
6. Teacher selects published passages.
7. Teacher optionally clones public/non-owned passages.
8. Teacher enters title, Test Type, duration, visibility.
9. Teacher orders passages.
10. App creates draft master.
11. Teacher reviews in Edit Test Modal / master draft editor.
12. Teacher publishes.
13. Publish writes ref-only master composition and required projections/indexes.

### 8.4 Assignment Refresh

1. Teacher assigns a composition-first master.
2. System saves composed student-safe projection.
3. Before any student starts, teacher may refresh to latest passage versions.
4. Refresh shows old/new changes.
5. Teacher confirms refresh.
6. System updates assignment projection.
7. After any student starts, refresh is disabled.

---

## 9. Data Requirements

### 9.1 Master Composition

Master composition must store:

- composition id
- master material id
- title
- owner id
- visibility
- Test Type ids
- duration
- ordered passage refs
- selected order
- title snapshot per passage
- source order display per passage
- original source full test/book if known
- passage snapshot/version id per ref
- question count snapshot per ref
- numbering metadata
- created/updated/published metadata

### 9.2 Passage Clone Lineage

Cloned passages must store:

- `clonedFromMaterialId`
- `clonedFromSnapshotVersionId`
- `clonedFromOwnerId`
- `clonedFromVisibilitySnapshot`
- `clonedAt`
- `cloneReason`

Lineage must not leak private source details to student payloads.

### 9.3 Assignment Manifest / Projection

Assignment-time payload must store:

- master material id
- master composition version
- composed student-safe projection
- passage refs used
- passage snapshot/version ids used
- title/source/Test Type snapshots
- refresh state
- whether any student has started

The frozen composed assignment projection path is:

- `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}`

The Firestore `homework_assignments/{homeworkId}` document must store a pointer to that projection path, the composition version id, and the ordered passage snapshot/version ids. Assignment creation must create the homework id first, write the RTDB assignment payload, then write the Firestore homework document. If the Firestore write fails after the RTDB payload write, implementation must either clean up the orphan RTDB payload or leave it unreachable and record the cleanup path in tests.

### 9.4 Composition Numbering

Composition numbering must use one assembly function for all master publish, assignment projection, runtime, submission, result review, and PRD-0054 numbering-review flows.

Required input:

- ordered passage refs
- each passage snapshot/version id
- each passage interaction id and local display number
- each passage question count
- selected numbering mode

Required output:

- ordered passage display metadata
- `interactionId -> displayNumber` map for the composed master
- per-passage first/last display number
- total question count

The composed numbering map must be frozen into the assignment projection and copied into saved attempt/result data. Result review must read the frozen numbering map, not recompute from current live passage refs.

`Auto-renumber from this passage forward` in PRD-0054 must mean: preserve display numbers before the changed slot, then recompute the display numbers for the changed slot and all later slots from the same assembly function.

### 9.5 Update References Modal Data

Passage publish must be able to find:

- owned master refs using old version
- owned Book refs using old version
- non-owned refs count
- assignment/result count as informational only if available

Assignments/results must never be selectable update targets.

---

## 10. Edge Cases

1. **Passage updates before master publish:** warn and ask latest vs selected version.
2. **Duplicate same passage selected twice:** warn but allow.
3. **Mixed Test Types:** warn but allow.
4. **Public visibility with private refs:** block public visibility.
5. **Non-owned master opened:** no edit; clone only.
6. **Non-owned passage in owned master:** greyed out; clone allowed.
7. **Pinned snapshot missing:** student launch blocks with clear error.
8. **Assignment refresh after student starts:** block refresh.
9. **Passage publish has no owned refs:** show simple success, no update modal.
10. **Teacher updates selected refs after passage publish:** assignments/results stay unchanged.
11. **Clone source later archived:** cloned teacher-owned copy remains independent.
12. **Publish partially fails:** rollback/all-or-nothing.
13. **Old embedded data exists:** ignore/remove in dev; no migration path required.
14. **PRD-0054 repair text says Studio:** interpret with Part 2 model: Edit Test Modal for master refs, single-passage Studio for content authoring.
15. **Duplicate index missing during auto-split:** same-source idempotency may still be implemented, but final Part 2 acceptance is blocked until the PRD-0054 duplicate index exists. Do not fall back to broad canonical payload hydration.
16. **Duplicate index stale during auto-split:** block publish with a typed duplicate-index freshness issue or require the teacher to retry after index repair. Do not silently skip duplicate warning coverage.

---

## 11. Success Metrics

Feature is successful when:

1. New full-test publish creates pure ref-only master composition.
2. Standalone Reading Passages are created and visible from Reading Passage library after publish.
3. Published master `Edit Test` opens Edit Test Modal.
4. Passage slot edit opens single-passage Studio in another browser tab.
5. Public/non-owned master clone works.
6. Public/non-owned passage clone works with lineage metadata.
7. Test Creation Modal supports `Use existing Reading Passages`.
8. Existing-passage flow creates draft master without full-test Studio.
9. Assignment freezes composed student-safe projection.
10. Teacher-controlled assignment refresh works only before any student starts.
11. Result review uses frozen content.
12. Passage publish `Update references?` modal updates only selected owned refs.
13. Old embedded payload is not needed for new master runtime.

---

## 12. Acceptance Criteria

### 12.1 First Publish

- Given an unpublished full-test Studio draft, when teacher publishes, then standalone passage materials are created.
- Given publish succeeds, then master composition stores refs only.
- Given publish succeeds, then master does not rely on embedded passage payload for runtime.
- Given any publish write fails, then no partial master/passage state is committed.

### 12.2 Published Master Editing

- Given a published master, when teacher clicks `Edit Test`, then Edit Test Modal opens.
- Given a published master, full-test Studio is not opened.
- Given teacher clicks a passage slot edit action, single-passage Studio opens in another browser tab.
- Given passage is non-owned public, edit is disabled and clone is available.

### 12.3 Passage Version Update

- Given teacher publishes a new passage version, old version remains immutable.
- Given owned masters/books use old version, `Update references?` modal appears.
- Given teacher selects refs and confirms, selected owned master/book refs update.
- Given teacher keeps unchanged or reviews later, refs stay pinned.
- Given assignments/results exist, they are not selectable for update.

### 12.4 Existing Passage Test Creation

- Given teacher chooses `Create new test -> IELTS -> Reading V2 -> Use existing Reading Passages`, picker shows published passages.
- Given teacher selects passages, app creates a draft master.
- Given draft master opens, teacher edits metadata/order/refs in modal, not full-test Studio.
- Given teacher publishes, master composition refs the teacher-confirmed snapshots at publish time.
- Given selected passage updated before publish, warning appears.

### 12.5 Assignment / Runtime / Result

- Given teacher assigns composition-first master, student-safe projection is frozen at assignment time.
- Given teacher refreshes before any student starts, projection updates to teacher-confirmed latest versions.
- Given any student starts, refresh becomes unavailable.
- Given student launches, runtime uses frozen projection.
- Given result opens, review uses frozen content student saw.
- Given pinned snapshot missing, launch blocks clearly.

---

## 13. Implementation Phases

### Phase 1: Composition-First Publish Core

Build:

- ref-only master publish output
- standalone passage write set
- master composition/version write set
- no embedded full passage payload for new publishes
- all-or-nothing publish tests

### Phase 2: Published Master Edit Modal

Build:

- Edit Test Modal for published masters
- passage slot list/order/replace/remove/clone
- passage slot opens single-passage Studio in another browser tab
- no full-test Studio for published masters

### Phase 3: Existing Passage Test Creation

Build:

- Test Creation Modal entrypoint
- published passage picker
- clone optional action
- draft master from selected passages
- metadata/order/visibility review
- publish from modal

### Phase 4: Single-Passage Version Update

Build:

- passage publish new-version flow
- where-used scan for owned master/book refs
- `Update references?` modal
- selected ref update writes
- newer-version-available state

### Phase 5: Assignment Freeze / Refresh / Runtime

Build:

- assignment-time composed student-safe projection
- refresh before any student starts
- refresh disabled after start
- runtime launches from frozen projection
- result review uses frozen content

### Phase 6: PRD-0054 Alignment Patch

Update PRD-0054 docs/tasklist so broken master repair uses:

- Edit Test Modal for composition repair
- single-passage Studio for passage authoring/remake
- no full-test Studio for published masters

---

## 14. Verification Requirements

Required tests:

1. first publish creates standalone passages and ref-only master
2. first publish fails all-or-nothing
3. published master edit opens modal, not full-test Studio route
4. passage slot opens single-passage Studio route in new tab
5. non-owned public passage is greyed out
6. clone public passage creates new teacher-owned material with lineage
7. update references modal shows owned master refs
8. update references modal shows owned Book refs
9. update references excludes assignments/results
10. update references excludes non-owned refs from selection
11. existing-passage picker filters published only
12. draft master from existing passages pins teacher-confirmed snapshots at publish time
13. updated selected passage before publish triggers warning
14. duplicate selected passage warning
15. mixed Test Type warning
16. public visibility blocked with private refs
17. assignment stores frozen composed projection
18. refresh before any student starts
19. refresh blocked after any student starts
20. runtime uses frozen projection
21. result review uses frozen content
22. missing pinned snapshot blocks launch

Required UI proof:

- Test Creation Modal existing-passage path
- Edit Test Modal for published master
- single-passage Studio opened from passage slot
- `Update references?` modal
- assignment refresh control and disabled-after-start state

Required guard proof:

- no answer keys in student-safe projection
- no hidden provenance in student payload
- no embedded master payload for new publish/runtime
- no new Mantine imports in touched teacher UI
- UTF-8 check on touched files
- targeted Vitest for touched services/components

---

## 15. Open Questions

No product questions remain open.

Before implementation, create a separate tasklist that is junior-executable and includes exact files, tests, browser proof steps, and PRD-0054 alignment edits.
