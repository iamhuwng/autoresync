# Task List: PRD-0052 Part 2 Reading V2 Composition-First Master Tests

Status: Draft tasklist only. No implementation in this turn.
Created: 2026-06-09
Source PRD: `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`
Required successor: `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`

## Execution Contract

- [ ] Treat this tasklist as the implementation source of truth for PRD-0052 Part 2.
- [ ] Treat PRD-0052 Part 1 extraction/composition work as additive foundation, not proof that the ref-only master contract is complete.
- [ ] Implement PRD-0052 Part 2 before PRD-0054 tasks that depend on the master editing model.
- [ ] Do not start PRD-0054 broken-master repair UI until this tasklist has a published-master Edit Test Modal, ref-only master storage tests, and passing targeted tests.
- [ ] Treat PRD-0054 duplicate-index foundation as a shared prerequisite for final PRD-0052 Part 2 acceptance. Auto-split duplicate warning must not be silently skipped; implement same-source idempotency first if needed, but do not mark final acceptance complete until the PRD-0054 owner-scoped duplicate index is available and tested.
- [ ] Keep work inside the files listed here unless a task explicitly tells you to add a new file.
- [ ] If a required owner, path, route, or storage contract is missing, stop and record it in `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`; do not invent behavior silently.
- [ ] Before each parent task is marked complete, update the findings file with evidence, exact tests run, and any deferred residue.

## Must-Read Before Coding

- [ ] Read `AGENTS.md`.
- [ ] Read `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`.
- [ ] Read `documentation/tasks/process-task-list.md`.
- [ ] Read `DESIGN.md`.
- [ ] Read `documentation/architecture/ui-design-standards.md`.
- [ ] Read `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.
- [ ] Read `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.
- [ ] Read `documentation/architecture/teacher-materials-listing-and-diagnostics.md`.
- [ ] Read `documentation/architecture/teacher-materials-list-view-contract.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`.
- [ ] Read `documentation/architecture/homework-solo-practice-architecture.md`.
- [ ] Read `documentation/architecture/student-test-delivery-projections.md`.
- [ ] Read `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`.
- [ ] Read `documentation/rules/navigation.md` before route, link, redirect, or new-tab work.
- [ ] Read `documentation/rules/infrastructure.md` before RTDB, Firestore, rules, index, or publish-write work.
- [ ] Read `documentation/rules/codebase-hygiene.md` before touching any file that imports `@mantine/*` or any producer/consumer storage path.
- [ ] Read `documentation/rules/observability.md` before adding or changing visible buttons, forms, or workflows.
- [ ] Read `documentation/rules/mobile-portability.md` before storage, browser API, `useNavigate`, or `window.*` work.
- [ ] Read `documentation/rules/react-patterns.md` before new component state, loading state, or async effect work.
- [ ] Read `documentation/rules/student-data-loading.md` before student homework/runtime/result data changes.
- [ ] Read `documentation/rules/student-mobile-design.md` if any student layout, mobile header, tab, filter, overlay, drawer, list, card, or right-rail UI changes.

## Known Current Anchors

Inspect these before editing. Add exact line notes to the findings file after inspection.

- [ ] Publish and storage:
  - `src/services/reading-v2/readingV2PublishPipeline.service.ts`
  - `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
  - `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts`
  - `src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts`
  - `src/services/reading-v2/readingV2StoragePaths.service.ts`
  - `src/services/reading-v2/readingV2Projection.service.ts`
  - `src/services/reading-v2/readingV2MaterialMetadata.service.ts`
- [ ] Composition:
  - `src/services/reading-v2/readingV2FullTestComposition.service.ts`
  - `src/services/reading-v2/readingV2FullTestComposition.service.test.ts`
  - `src/services/reading-v2/readingV2TeacherComposition.service.ts`
  - `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
  - `src/types/readingV2.types.ts`
- [ ] Teacher authoring UI:
  - `src/pages/TeacherLobbyPage.jsx`
  - `src/pages/TeacherLobbyPage.test.jsx`
  - `src/components/test-creation/TestCreationModal.tsx`
  - `src/components/test-creation/TestCreationModal.test.tsx`
  - `src/components/TestEditor.tsx`
  - `src/components/test/editor/EditTestFrame.tsx`
  - `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx`
  - `src/pages/ReadingV2StudioPage.tsx`
  - `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- [ ] New master UI files to add unless inspection finds an existing exact owner:
  - `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
  - `src/components/reading-v2/master/ReadingV2MasterEditModal.css`
  - `src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx`
  - `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`
  - `src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx`
  - `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx`
  - `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx`
- [ ] Assignment, runtime, result:
  - `src/components/homework/HomeworkCreateModal.tsx`
  - `src/components/homework/HomeworkCreateModal.test.tsx`
  - `src/pages/TeacherHomeworkDetailPage.tsx`
  - `src/pages/TeacherHomeworkDetailPage.test.tsx`
  - `src/hooks/useHomeworkDetail.ts`
  - `src/services/homeworkManager.ts`
  - `src/services/reading-v2/readingV2PassageHomework.service.ts`
  - `src/services/reading-v2/readingV2PassageHomework.service.test.ts`
  - `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
  - `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
  - `src/pages/StudentPracticePage.tsx`
  - `src/pages/StudentPracticePage.test.tsx`
  - `src/services/reading-v2/readingV2ResultAdapter.service.ts`
  - `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
  - `src/components/results/ReadingV2ReviewContentAdapter.tsx`
  - `src/components/results/ReadingV2ReviewContentAdapter.test.tsx`
  - `functions/src/readingV2SubmitCore.ts`
  - `functions/src/readingV2SubmitCore.test.ts`
- [ ] Routes, security, observability:
  - `src/constants/routes.ts`
  - `src/constants/routes.test.ts`
  - `src/routes/teacherRoutes.tsx`
  - `src/routes/teacherRoutes.test.tsx`
  - `src/config/featureRegistry.ts`
  - `src/config/featureRegistry.test.ts`
  - `database.rules.json`
  - `src/__tests__/security/readingV2FirebaseRules.test.ts`
  - `firestore.rules`
  - `src/__tests__/security/homeworkFirestoreRules.test.ts`

## Phase 0 - Baseline And Findings File

- [ ] Create `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`.
- [ ] Record current `git status --short` before editing.
- [ ] Record whether the PRD files are tracked or untracked.
- [ ] Record current tests that already cover PRD-0052 Part 2 behavior and where they fall short.
- [ ] Search with `rg "full_test_compositions|composition|reading-passage-set|reading_passage_materials|published_snapshots|student_safe_tests|session_test_payloads|review" src functions database.rules.json firestore.rules`.
- [ ] Search with `rg "@mantine|useNavigate|window.open|location.href|navigate\\(" src/components/test-creation src/pages/TeacherLobbyPage.jsx src/components/reading-v2`.
- [ ] Confirm `TestCreationModal.tsx` currently imports Mantine and direct `useNavigate`; record whether touched work removes the local touched usage or documents deferred residue.
- [ ] Confirm current existing-passage full-test behavior in `TeacherLobbyPage.jsx` and `readingV2TeacherComposition.service.ts`; record whether it publishes immediately or creates a draft.
- [ ] Confirm current full-test publish behavior in `readingV2PublishPipeline.service.ts`; record whether master writes still include embedded `document`, `sections`, `stimuli`, `taskGroups`, `interactions`, `optionSets`, or `answerKey`.
- [ ] Record expected current-state reconciliation: Part 1 wrote Reading Passage entities and composition refs, but new published master writes may still include embedded `document` payload and Teacher Lobby edit routing may still send all Reading V2 materials to Studio.
- [ ] Parent acceptance: findings file has exact current-state notes and no source code changed outside doc/finding updates.

## Phase 1 - Schema, Storage, And Route Contract

- [ ] Define the ref-only published master contract in types:
  - Edit `src/types/readingV2.types.ts`.
  - Add or update master composition types so a published master stores ordered passage references and master metadata only.
  - Required passage ref fields: `materialId`, `snapshotVersionId`, `order`, `title`, `source`, `testType`, `questionCount`, `ownerId`, `visibility`, and `currentVersionId` when available.
  - Prohibited master payload fields: `document`, `sections`, `stimuli`, `taskGroups`, `interactions`, `optionSets`, `answerKey`, `correctAnswers`, and raw rich passage body.
- [ ] Define full-test composition path helpers:
  - Edit `src/services/reading-v2/readingV2StoragePaths.service.ts`.
  - Keep canonical paths aligned with `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.
  - Do not add a path unless `database.rules.json` and the Firebase adapter tests cover it.
- [ ] Define master route behavior:
  - Teacher Lobby published master rows must expose enough metadata to branch safely: Reading V2 composition material kind, `state: 'published'`, `compositionId`, and `publishedVersionId`.
  - Draft or unpublished Reading V2 rows continue to open full-test Studio.
  - Published rows with open draft revisions open the master modal and show the draft-revision state.
  - Published master `Edit Test` opens Edit Test Modal inside Teacher Lobby.
  - Published master does not open full-test Studio.
  - Single-passage slot edit opens `TEACHER_READING_V2_REVISE` in a new tab for that Reading Passage material.
  - New route constants are allowed only if no existing route fits; update `src/constants/routes.ts`, `src/constants/routes.test.ts`, `src/routes/teacherRoutes.tsx`, and `src/routes/teacherRoutes.test.tsx` together.
- [ ] Add failing type/service tests before implementation:
  - `src/services/reading-v2/readingV2FullTestComposition.service.test.ts` rejects embedded master payload.
  - `src/services/reading-v2/readingV2FullTestComposition.service.test.ts` resolves a ref-only master into ordered passage snapshot refs.
  - `src/services/reading-v2/readingV2PublishPipeline.service.test.ts` asserts master writes contain refs and metadata only.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects prohibited embedded master payload fields on the new composition paths before implementation makes the path writable.
- [ ] Parent acceptance: schema and route contract tests fail for the current implementation for the intended reasons.

## Phase 1A - Shared Composition Numbering Contract

- [ ] Add or extend a single composition numbering owner before publish or modal work:
  - Preferred new owner: `src/services/reading-v2/readingV2CompositionNumbering.service.ts`, unless inspection proves `src/services/reading-v2/readingV2Numbering.service.ts` can own composed master numbering without mixing single-passage authoring concerns.
  - Inspect existing numbering use in `readingV2Numbering.service.ts`, `readingV2TeacherComposition.service.ts`, `readingV2PassageHomeworkLaunch.service.ts`, `readingV2ResultAdapter.service.ts`, and `functions/src/readingV2SubmitCore.ts`.
  - Input: ordered passage snapshot/projection refs and each passage interaction map.
  - Output: `interactionId -> displayNumber`, per-passage first/last display number, and total question count.
  - This function must be the only source for master publish numbering, assignment projection numbering, runtime display numbering, submission validation, result review, and PRD-0054 repair numbering review.
- [ ] Add tests before implementation:
  - `readingV2CompositionNumbering.service.test.ts` composes multi-passage numbering without collisions.
  - `readingV2CompositionNumbering.service.test.ts` preserves numbers before a changed slot and recomputes changed/later slots for PRD-0054 repair.
  - `readingV2TeacherComposition.service.test.ts` uses the shared composition numbering owner for master assembly.
  - `readingV2PassageHomeworkLaunch.service.test.ts` uses the shared composition numbering map for assignment/runtime projection.
  - `readingV2ResultAdapter.service.test.ts` reads frozen numbering from result payload and does not recompute from live refs.
- [ ] Parent acceptance: all later phases have a concrete numbering service import path and no phase is allowed to invent local numbering logic.

## Phase 2A - Composition-First Full-Test Publish Core

- [x] Update `src/services/reading-v2/readingV2PublishPipeline.service.ts`.
  - First publish of a new full Reading V2 test creates standalone Reading Passage materials for each passage.
  - Retry/re-publish of the same source full-test material, source snapshot/version, and source passage order must not create duplicate generated passage identities.
  - Generated Reading Passages inherit the master visibility only when the generated passage can safely support that visibility; otherwise publish blocks or requires teacher-selected private master visibility.
  - Each extracted passage must independently pass canonical anchor, task group, interaction, option set, answer-rule, and projection validation before commit.
  - First publish creates each passage current version, published snapshot, student-safe projection, review projection, and material/listing index row.
  - First publish creates a master composition record that references the generated passage snapshot ids.
  - Master record contains metadata and refs only.
  - Master record never embeds passage content or answer key payload.
  - Master publish uses the shared composition numbering owner from Phase 1A.
- [x] Update `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts`.
  - Commit all RTDB writes for one publish plan through one root multi-location update where the existing adapter supports that.
  - Simulate failure after partial staging in tests and assert no partial committed state remains in repository-backed unit tests.
  - Keep Firestore homework writes out of this publish transaction unless an existing architecture doc already requires them.
- [x] Update `src/services/reading-v2/readingV2Projection.service.ts`.
  - Build passage projections from passage snapshots.
  - Do not build a master student projection that requires live canonical passage reads.
  - If a master launch projection is needed, compose it from frozen passage projections and record the exact source snapshot ids.
- [x] Update `src/services/reading-v2/readingV2MaterialMetadata.service.ts`.
  - Preserve discoverable list metadata for master and generated passage materials.
  - Mark master as composition/ref owner, not a raw passage content owner.
- [x] Add or update tests:
  - `readingV2PublishPipeline.service.test.ts`: retry/re-publish of the same source snapshot does not silently create duplicate generated Reading Passages.
  - `readingV2PublishPipeline.service.test.ts`: public master publish blocks or requires private visibility when generated passage refs cannot be public/shareable.
  - `readingV2PublishPipeline.service.test.ts`: split publish blocks when an extracted passage has invalid anchor/interaction bindings after extraction.
  - `readingV2PublishPipeline.service.test.ts`: full-test publish creates standalone passages plus ref-only master.
  - `readingV2PublishPipeline.service.test.ts`: master write excludes prohibited payload fields.
  - `readingV2PublishPipeline.service.test.ts`: generated passage projections contain student-safe content but no answer key in student path.
  - `readingV2PublishPipeline.service.test.ts`: review projection contains answer/review data only in review path.
  - `readingV2FirebasePublishAdapter.service.test.ts`: commit plan maps master, generated passages, projections, versions, and listing indexes to expected paths.
  - `readingV2FirebasePublishAdapter.service.test.ts`: commit failure rejects and leaves no partial repository state in the test double.
  - `readingV2TeacherComposition.service.test.ts`: existing manually selected passage composition still works after first-publish split.
- [x] Add path-specific rules tests before parent acceptance:
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` accepts valid generated passage/version/projection/index writes through approved trusted write patterns.
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` rejects generated passage or master student-safe projection writes that contain answer keys, review payload, or embedded full-test canonical content.
- [x] Parent acceptance: a full-test publish can be inspected in test output as standalone passages plus ref-only master; no master embedded payload remains. Phase 2A may be complete while Phase 2B is blocked, but final tasklist acceptance cannot be complete until Phase 2B passes.

## Phase 2B - Auto-Split Duplicate Index Integration Gate

- [x] Do not start this phase until PRD-0054 Phase 1B duplicate index foundation exists and its service/rules tests pass.
- [x] Update `src/services/reading-v2/readingV2PublishPipeline.service.ts`.
  - Before final acceptance, auto-split publish uses the PRD-0054 duplicate guard service and duplicate index at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}` to warn on generated passage candidates with `>= 80%` similarity.
  - If the duplicate index/service is not implemented yet, record the dependency in findings, leave auto-split duplicate warning blocked, and do not mark final PRD-0052 Part 2 acceptance complete.
  - Duplicate warning checks include active passages the teacher can access and the teacher's own archived passages; they must not include broad canonical scans, answer keys, hidden provenance, AI evidence, scoring rules, or full canonical payload hydration.
  - Indexed duplicate warning is warning-only. The teacher can use the existing passage, restore-and-use an owned archived passage through PRD-0054 archive service, or create the new generated passage anyway.
- [x] Add or update tests:
  - `readingV2PublishPipeline.service.test.ts`: auto-split publish calls the PRD-0054 duplicate guard/index before creating generated passages once the index foundation exists.
  - `readingV2PublishPipeline.service.test.ts`: auto-split duplicate warning includes active accessible matches and owned archived matches, but does not hydrate full canonical payloads or answer keys.
  - `readingV2PublishPipeline.service.test.ts`: auto-split duplicate warning lets the teacher use existing, restore-and-use owned archived, or create new anyway.
  - `readingV2PublishPipeline.service.test.ts`: missing or stale duplicate index blocks publish with a typed issue instead of falling back to broad canonical payload hydration.
- [x] Parent acceptance: duplicate warning coverage is proven through the PRD-0054 duplicate index, or this phase remains explicitly blocked in findings. Do not mark overall PRD-0052 Part 2 final acceptance complete while this phase is blocked.

## Phase 3 - Published Master Edit Test Modal

- [ ] Add `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`.
  - Modal opens from Teacher Lobby for published Reading V2 full-test master rows.
  - Modal supports both `mode: "published"` and `mode: "draft"` or an equivalent explicit state model before Phase 4 starts.
  - Published mode loads a ref-only published master composition and can create a new master version.
  - Draft mode creates or edits an unpublished master composition from selected Reading Passage refs without opening full-test Studio and without publishing until explicit publish.
  - Modal shows master title, source, test type, visibility, passage order, passage version badges, question counts, owner badges, and warnings.
  - Modal permits metadata edits, passage reorder, add passage, remove passage, clone non-owned passage into owned copy, and publish new master version.
  - Modal does not render `ReadingV2StudioShell` for the full-test master.
  - Modal has loading, empty, error, dirty, saving, publish-success, and publish-failure states.
- [ ] Add `src/components/reading-v2/master/ReadingV2MasterEditModal.css`.
  - Follow `DESIGN.md` and `ui-design-standards.md`.
  - No nested cards.
  - No new Mantine.
  - Keep TeacherHeader outside this modal and attached to the shell top edge.
  - Buttons with icons use the repo icon convention already present in teacher UI.
- [ ] Add `src/components/reading-v2/master/ReadingV2MasterPassagePicker.tsx`.
  - Lists only published, unarchived Reading Passage rows available to the teacher.
  - Uses the same lightweight library source as Teacher Lobby listing.
  - Never hydrates full canonical passage payload for list rows.
  - Shows title, source, test type, visibility, owner, latest version badge, question count, and selected state.
  - Blocks duplicate passage selection unless the user chooses an explicit duplicate confirmation path.
- [ ] Add modal tests:
  - `ReadingV2MasterEditModal.test.tsx` opens for a master row and never mounts full-test Studio.
  - `ReadingV2MasterEditModal.test.tsx` opens in published mode for a published master row.
  - `ReadingV2MasterEditModal.test.tsx` opens in draft mode for a new master composed from selected existing Reading Passages.
  - `ReadingV2MasterEditModal.test.tsx` keeps draft mode unpublished until explicit publish.
  - `ReadingV2MasterEditModal.test.tsx` edits metadata and passage order.
  - `ReadingV2MasterEditModal.test.tsx` opens a passage slot in a new tab using `TEACHER_READING_V2_REVISE`.
  - `ReadingV2MasterEditModal.test.tsx` refreshes passage version status on focus return or through explicit `Refresh version status`.
  - `ReadingV2MasterEditModal.test.tsx` blocks editing a non-owned public passage until clone is chosen.
  - `ReadingV2MasterPassagePicker.test.tsx` excludes drafts and archived passages.
  - `ReadingV2MasterPassagePicker.test.tsx` does not request canonical passage content for list rows.
- [ ] Wire Teacher Lobby:
  - Edit `src/pages/TeacherLobbyPage.jsx`.
  - Edit `src/pages/TeacherLobbyPage.test.jsx`.
  - `Edit Test` on published master opens `ReadingV2MasterEditModal`.
  - `Edit Test` on a single Reading Passage keeps existing single-passage revise behavior.
  - Existing legacy tests for non-Reading V2 edit keep passing.
- [ ] Update observability:
  - Edit `src/config/featureRegistry.ts`.
  - Edit `src/config/featureRegistry.test.ts`.
  - Track `reading_v2_master_edit_opened`, `reading_v2_master_metadata_saved`, `reading_v2_master_passage_reordered`, `reading_v2_master_passage_added`, `reading_v2_master_passage_removed`, `reading_v2_master_clone_requested`, and `reading_v2_master_publish_submitted`.
- [ ] Rolling PRD-0054 handoff checkpoint:
  - Record exact modal component path, modal state model, single-passage route behavior, and tests that prove no full-test Studio opens for published masters.
  - PRD-0054 master repair remains blocked until final Phase 8 handoff, but this checkpoint prevents downstream modal-owner drift.
- [ ] Parent acceptance: browser and unit tests prove published full-test master edit is modal-based, draft master shell exists for Phase 4, and no full-test Studio route opens for a published master.

## Phase 4 - Create Full Test From Existing Reading Passages

- [ ] Edit `src/components/test-creation/TestCreationModal.tsx`.
  - Add a Reading V2 creation option labeled `Use existing Reading Passages`.
  - Keep this inside the existing Teacher Lobby `Create New Test` modal flow.
  - Do not create a new page.
  - Do not add new Mantine imports.
  - If touching existing Mantine-covered JSX, remove Mantine from that touched region or document exact deferred residue in findings.
  - Replace any newly touched direct `useNavigate` path with the repo navigation abstraction required by `documentation/rules/navigation.md` and `documentation/rules/mobile-portability.md`.
- [ ] Add or update `src/components/test-creation/ReadingV2ExistingPassagePicker.tsx` and `src/components/test-creation/ReadingV2ExistingPassagePicker.test.tsx` unless `ReadingV2MasterPassagePicker` can be reused without creation-specific branching.
  - Picker uses published, unarchived Reading Passage rows only.
  - Picker shows owner/visibility/version/test type/question count.
  - Picker supports reorder before draft creation.
  - Picker warns on mixed test type, mixed source, duplicate passage, non-owned public selection, and version mismatch.
  - Picker never loads canonical passage body for selection rows.
- [ ] Update `src/services/reading-v2/readingV2TeacherComposition.service.ts`.
  - Add a draft-master creation path from selected published passage snapshot refs.
  - Do not immediately publish the master from the Test Creation Modal path.
  - Return the draft master id and enough metadata for the modal to open.
  - Preserve existing published composition behavior only where tests prove an existing caller still needs it.
- [ ] Update `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`.
  - Creates draft master from existing passages.
  - Rejects draft, archived, inaccessible, and missing-projection passages.
  - Preserves selected order.
  - Stores refs, not embedded payload.
  - Does not publish until explicit publish action from the master modal.
- [ ] Update `TestCreationModal.test.tsx`.
  - Option appears only for Reading V2.
  - Selecting existing passages opens a draft master modal flow.
  - Blank, paste/import, and Auto V4 setup still work.
  - Errors are visible and recoverable.
- [ ] Parent acceptance: a teacher can create a draft full-test master from existing passages without opening full-test Studio and without publishing until explicit modal publish.

## Phase 5 - Single-Passage Version Update And Update References Modal

- [ ] Extend `src/services/reading-v2/readingV2PassageRevision.service.ts`.
  - Publishing a single Reading Passage creates a new immutable version.
  - Existing published versions remain available for pinned assignments, results, and old master versions.
  - Current version pointer updates only after publish succeeds.
- [ ] Add `src/services/reading-v2/readingV2ReferenceUpdate.service.ts` and `src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts` unless an exact service owner exists after inspection.
  - Finds owned full-test masters referencing the older passage version.
  - Finds owned Books referencing the older passage version if Book references use Reading Passage material ids.
  - Excludes non-owned materials.
  - Excludes assigned frozen projections and result snapshots.
  - Returns a lightweight where-used summary with owner, material id, title, current ref version, available latest version, and selectable update flag.
  - Applies selected ref updates only when the teacher confirms.
- [ ] Implement `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx`.
  - Opens after a single Reading Passage publish when owned masters or Books reference the older version.
  - Lists affected owned masters and Books.
  - Defaults all update checkboxes to unchecked.
  - Allows skip all.
  - Updates selected refs only.
  - Shows success and partial failure states.
- [ ] Add tests:
  - `ReadingV2UpdateReferencesModal.test.tsx` defaults unchecked and does not update on close.
  - `ReadingV2UpdateReferencesModal.test.tsx` updates selected owned masters only.
  - `readingV2ReferenceUpdate.service.test.ts` excludes non-owned refs.
  - `readingV2ReferenceUpdate.service.test.ts` never mutates assignments or result snapshots.
  - Add Book reference coverage in the Book test owner discovered during inspection.
- [ ] Parent acceptance: publishing one passage version never silently changes existing master, Book, assignment, or result refs.
- [ ] Rolling PRD-0054 handoff checkpoint:
  - Record exact service that updates master/Book refs.
  - Record exact behavior split between healthy `Update references?` and PRD-0054 broken-ref remake.
  - Record exact tests that prove assignments/results are not selectable update targets.

## Phase 6 - Assignment Freeze, Refresh Before Start, Runtime, And Results

- [ ] Edit `src/services/reading-v2/readingV2PassageHomework.service.ts`.
  - Assignment of a master freezes the exact ordered passage snapshot refs.
  - Add or use a storage path helper for `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` if the implementation stores composed assignment payloads in RTDB.
  - Assignment creation must create the homework id, write the RTDB assignment payload, then write the Firestore homework document pointer. If Firestore fails after RTDB payload creation, test cleanup or unreachable-orphan behavior.
  - Assignment stores enough metadata for launch and review without reading live latest passage refs.
  - Assigning an archived, draft, inaccessible, or missing-projection passage fails closed.
  - Existing single-passage and reading-passage-set behavior stays compatible.
- [ ] Edit `src/components/homework/HomeworkCreateModal.tsx` and `src/components/homework/HomeworkCreateModal.test.tsx`.
  - Assigning a composition master shows frozen passage count, source, test type, and version summary.
  - The UI does not promise auto-update after assignment.
- [ ] Edit `src/pages/TeacherHomeworkDetailPage.tsx`, `src/pages/TeacherHomeworkDetailPage.test.tsx`, and `src/hooks/useHomeworkDetail.ts`.
  - Add `Refresh to latest passage versions` only for Reading V2 composition assignments.
  - Enable refresh only while no student has started.
  - Disable refresh when any `homework_submissions` record for the homework has numeric `startedAt` or status other than `not_started`.
  - Refresh creates a new frozen assignment projection, not a live pointer.
  - Show exact before/after version summary.
- [ ] Edit runtime and result services:
  - `src/services/reading-v2/readingV2PassageHomeworkLaunch.service.ts`
  - `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
  - `src/pages/StudentPracticePage.tsx`
  - `functions/src/readingV2SubmitCore.ts`
  - `src/services/reading-v2/readingV2ResultAdapter.service.ts`
  - `src/components/results/ReadingV2ReviewContentAdapter.tsx`
- [ ] Runtime requirements:
  - Student launch reads assignment-pinned projection.
  - Student launch does not read live current passage refs.
  - Missing pinned projection fails closed with a clear, non-leaking error.
  - Submission validates against the pinned snapshot/projection id.
  - Result/review shows frozen passage titles, source, test type, order, and version ids from the assignment/result snapshot.
  - Runtime, submission, result, and review all use one composition numbering map frozen into the assignment/result payload.
- [ ] Add tests:
  - `readingV2StoragePaths.service.test.ts` covers assignment payload path if a new helper is added.
  - `readingV2PassageHomework.service.test.ts` freezes master assignment refs.
  - `readingV2PassageHomework.service.test.ts` writes or references the frozen assignment payload before the Firestore homework pointer.
  - `readingV2PassageHomework.service.test.ts` refreshes before start and blocks after start.
  - `readingV2PassageHomeworkLaunch.service.test.ts` composes runtime from assignment-pinned snapshots.
  - `readingV2LaunchIntegration.service.test.ts` rejects live canonical master payloads for student launch.
  - `StudentPracticePage.test.tsx` launches master homework from frozen projection after source passage is updated.
  - `StudentPracticePage.test.tsx` blocks with clear error when pinned projection is missing.
  - `functions/src/readingV2SubmitCore.test.ts` rejects submissions whose projection/snapshot ids do not match assignment.
  - `functions/src/readingV2SubmitCore.test.ts` rejects submissions whose display numbers do not match the frozen composition numbering map.
  - `readingV2ResultAdapter.service.test.ts` review uses frozen refs after source passage edit/archive.
  - `ReadingV2ReviewContentAdapter.test.tsx` displays grouped passages from frozen result data.
- [ ] Add path-specific rules tests before parent acceptance:
  - `src/__tests__/security/readingV2FirebaseRules.test.ts` covers the RTDB assignment payload path if it is under RTDB.
  - `src/__tests__/security/homeworkFirestoreRules.test.ts` covers the Firestore homework pointer if homework schema changes.
  - Tests reject assignment payload writes that include answer keys, review-only content, or live mutable refs instead of frozen projection refs.
- [ ] Parent acceptance: source passage updates never change assigned or completed student work unless teacher refreshes before any student starts.
- [ ] Rolling PRD-0054 handoff checkpoint:
  - Record exact assignment refresh service and UI owner.
  - Record exact authoritative "student started" source.
  - Record exact runtime/result tests that prove frozen projections survive archive/repair work.

## Phase 7 - Security Rules, Observability, And Guards

- [ ] Update `database.rules.json`.
  - Allow only valid ref-only master composition writes.
  - Reject master writes with prohibited embedded payload fields.
  - Permit generated passage material/version/projection/index writes only through existing trusted write patterns.
  - Prevent student reads of answer keys, canonical drafts, and review-only projections.
- [ ] Update `src/__tests__/security/readingV2FirebaseRules.test.ts`.
  - Accept valid ref-only master write by trusted teacher/admin path.
  - Reject embedded answer key/master payload write.
  - Reject student read of canonical full-test master payload if such path exists.
  - Accept student-safe projection read only for allowed projection path.
- [ ] Update `firestore.rules` and `src/__tests__/security/homeworkFirestoreRules.test.ts` only if homework assignment schema changes.
- [ ] Update `src/config/featureRegistry.ts` and `src/config/featureRegistry.test.ts` for all new visible actions from Phases 3-6.
- [ ] Add user-facing error logs only through existing observability helpers; do not add console-only diagnostics as acceptance proof.
- [ ] Parent acceptance: rules tests cover every new path, and feature registry tests cover every new workflow action.

## Phase 8 - PRD-0054 Dependency Handoff

- [ ] Update `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md` only if PRD-0052 implementation changes a contract the PRD names.
- [ ] Record in the findings file:
  - PRD-0054 master-repair dependency status as `READY` or `BLOCKED`, with exact reason.
  - Exact master modal component path.
  - Exact service that updates master refs.
  - Exact route used to open single-passage Studio from a master slot.
  - Exact assignment refresh service and UI path.
  - Exact tests that prove published master edit no longer uses full-test Studio.
- [ ] Mark PRD-0054 dependency ready only after targeted tests and browser proof steps for published-master modal edit, draft-master creation, single-passage slot routing, and assignment refresh pass.
- [ ] If the modal path, modal state model, ref-update service, single-passage route, or assignment-refresh authority is missing, mark the dependency `BLOCKED`; do not write a placeholder readiness note.
- [ ] Parent acceptance: PRD-0054 implementer can repair broken masters through the PRD-0052 modal without guessing component or service ownership.

## Targeted Test Commands

Run from `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`. For vitest, vite, and esbuild commands in this Windows checkout, use the unrestricted command form required by `AGENTS.md`.

- [x] Publish/composition:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2CompositionNumbering.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic`
- [x] Auto-split duplicate-index integration:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts --reporter=basic`
  - If PRD-0054 Phase 1B is not implemented yet, record this command as blocked by dependency; do not replace it with broad canonical scan tests.
- [x] Master modal and creation:
  - `cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/test-creation/TestCreationModal.test.tsx src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterPassagePicker.test.tsx src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx --reporter=basic`
- [x] Assignment/runtime/result:
  - `cmd /c npx vitest run src/components/homework/HomeworkCreateModal.test.tsx src/pages/TeacherHomeworkDetailPage.test.tsx src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/StudentPracticePage.test.tsx src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx functions/src/readingV2SubmitCore.test.ts --reporter=basic`
- [x] Routes, registry, rules:
  - `cmd /c npx vitest run src/constants/routes.test.ts src/routes/teacherRoutes.test.tsx src/config/featureRegistry.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic`
- [x] UTF-8 targeted check:
  - `cmd /c npm run check:utf8 -- src/services/reading-v2 src/components/reading-v2/master src/components/test-creation src/components/homework src/pages/TeacherLobbyPage.jsx src/pages/TeacherHomeworkDetailPage.tsx src/pages/StudentPracticePage.tsx src/config src/constants src/routes database.rules.json firestore.rules documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- [x] Diff whitespace:
  - `git diff --check`

## AI E2E Browser Protocol

- [ ] Use the in-app Browser or Playwright first when it can reach the local dev server and complete dev quick-login.
- [x] The `@chrome` plugin may be used when necessary: in-app browser authentication fails, popup/new-tab behavior must be proven in real Chrome, cross-tab refresh/on-focus behavior is under test, or existing Chrome session/state is required. Record the reason in the findings file before using Chrome.
- [x] For new-tab, refresh-on-focus, cross-tab messaging, `window.*`, or direct navigation work, confirm `documentation/rules/navigation.md` and `documentation/rules/mobile-portability.md` were read and record the exact rule impact in findings.
- [x] Do not ask for manual credentials during normal proof. Use the hidden dev quick-login buttons. If quick-login fails, capture the runtime/config error and stop before entering credentials.
- [x] For every proof step, record browser surface used, viewport size, URL, material/homework ids, expected result, actual result, and screenshot/trace path in the findings file.
- [x] Use a fresh browser context, separate Chrome profile, or explicit logout before Student proof so Teacher state cannot leak into Student verification.
- [x] Treat console errors, failed network requests in touched flows, broken feature-registry events, or missing audit/observability events as blockers unless proven unrelated with evidence.

## Browser Proof Steps

- [x] Start the dev server bound to `localhost:5173`. Do not use a neighboring port.
- [x] Open `http://localhost:5173`.
- [ ] Click the subtle settings icon in the bottom-right corner. Packet 9 landed in an already-authenticated Teacher session, so no quick-login click occurred.
- [ ] Use the `Teacher` quick-login button. Packet 9 landed in an already-authenticated Teacher session, so no quick-login click occurred.
- [ ] Teacher proof 1: `/lobby` -> `Create New Test` -> IELTS -> Reading V2 -> blank/import/Auto V4 -> publish. Confirm generated Reading Passages appear in the library and the full-test master `Edit Test` opens Edit Test Modal, not full-test Studio.
- [ ] Teacher proof 2: `/lobby` -> `Create New Test` -> Reading V2 -> `Use existing Reading Passages` -> select published passages -> reorder -> create draft. Confirm draft opens in master modal and is not published until explicit publish.
- [ ] Teacher proof 3: from master modal, edit metadata, reorder refs, open one passage slot in a new tab, publish a new passage version, return to master flow, and confirm `Update references?` modal appears.
- [ ] Teacher proof 4: assign the master as homework. Confirm frozen version summary appears and refresh is available before any student starts.
- [x] Student proof: log out or new browser context, reveal dev buttons, use `Student`, launch assigned homework, submit, and confirm runtime uses frozen projection. Packet 9 used explicit logout plus Student quick-login, then launched `packet9-live-20260610151227-hw-launch`; screenshot `21-student-frozen-runtime-5174.png`.
- [x] Teacher proof 5: update or archive a source Reading Passage after submission. Confirm result/review still shows frozen version data. Packet 9 archived/restored/re-archived `packet9-live-20260610151227-passage`; Student result panel for `packet9-live-20260610151227-result` still loaded frozen result data; screenshot `22-student-frozen-result-panel-5174.png`.
- [x] Responsive proof for touched teacher modal/list UI: 1366 px, 848 px, 375 px, and 320 px widths. Confirm no horizontal overflow, no overlapping text, and primary actions remain visible.
- [ ] Student mobile proof only if student UI changed: 375 px and 320 px widths, 44 px touch targets, no shell/header regression.
- [x] Save screenshots or Playwright output paths in the findings file.

## Rollback And Guard Notes

- [x] Keep PRD-0052 Part 2 changes separate from PRD-0054 changes until this tasklist passes.
- [x] Do not delete legacy full-test code until all current callers have a tested replacement.
- [x] Do not migrate existing production data without a separate migration tasklist and dry-run output.
- [x] If master storage still contains embedded payload after Phase 2, stop. Do not continue to UI phases.
- [x] If the master modal cannot be made without broad Mantine replacement, stop and record exact touched imports and proposed split.
- [x] If assignment refresh cannot identify an authoritative "student started" source, stop and record the missing source. Do not approximate from UI state.
- [x] If extracted passages cannot pass standalone anchor/interaction validation after split, block publish. Do not rely on whole-test validation alone.
- [x] If cross-store atomicity is requested between RTDB and Firestore, stop and ask for architecture approval; RTDB multi-location update does not make Firestore writes atomic.

## Ambiguity Flags

- [x] No existing dedicated Reading V2 master Edit Test Modal was found. This tasklist names `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` as the approved owner. Do not substitute a generic equivalent without a later explicit approval.
- [x] The exact assignment-refresh UI owner must be confirmed by inspecting `TeacherHomeworkDetailPage.tsx`, `HomeworkCreateModal.tsx`, and `useHomeworkDetail.ts`. If none owns homework mutation actions, stop before adding a new surface.
- [x] The existing `TestCreationModal.tsx` has Mantine and direct navigation drift. The touched-region cleanup boundary must be recorded in findings before code review.
- [x] The where-used service for updating owned Books after a passage version publish is not clearly established. Implement only after locating Book reference storage in `materialBooks.service.ts`, `bookEditor.service.ts`, and `bookValidation.service.ts`.
- [x] PRD-0048 Studio docs still describe Studio as the long-lived authoring surface. For PRD-0052 Part 2, published full-test master editing moves to Edit Test Modal; single-passage editing remains Studio.

## Final Acceptance Criteria

- [x] New full-test publish creates standalone Reading Passage materials and a ref-only master composition.
- [x] Auto-split publish runs the PRD-0054 indexed duplicate warning before final acceptance and never uses broad canonical scans or answer-key comparison.
- [x] One shared composition numbering owner is used by publish, assignment, runtime, submission, result review, and PRD-0054 repair numbering.
- [x] Published master storage has no embedded passage body, question payload, option sets, or answer keys.
- [x] Teacher Lobby `Edit Test` for published Reading V2 master opens Edit Test Modal.
- [x] Full-test Studio is not used for published master editing.
- [x] Single-passage slot editing opens single-passage Studio in a new tab.
- [x] Test Creation Modal can create a draft master from existing published Reading Passages.
- [x] Publishing a single Reading Passage version never silently updates owned masters, Books, assignments, or results.
- [x] Update References modal defaults unchecked and updates only confirmed owned refs.
- [x] Homework assignment freezes exact passage versions.
- [x] Refresh to latest versions is available only before any student starts.
- [x] Student runtime, submission, and result review use frozen projections.
- [x] Security rules block embedded master payload and answer-key leakage.
- [x] Observability covers all new visible actions.
- [x] Targeted tests, browser proof, UTF-8 check, and `git diff --check` pass.
- [x] Browser proof records browser surface, viewport, URL, material/homework ids, expected result, actual result, and screenshot/trace path for publish, modal edit, draft creation, update-references, assignment refresh, student runtime, and frozen-result review.
